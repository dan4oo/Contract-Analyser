"""
Contract Analyzer – FastAPI backend.

Run: uvicorn api:app --reload
Then POST a PDF to /api/analyze (see API.md for usage).
"""

import os
import json
import tempfile
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv
from pydantic import BaseModel, Field

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from parser import ContractParser
from llm import LLMExplainer


# Load .env from project folder
_PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_PROJECT_DIR, ".env"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load explainer once at startup (validates OPENAI_API_KEY)."""
    try:
        app.state.explainer = LLMExplainer()
        app.state.parser = ContractParser()
    except SystemExit as e:
        raise RuntimeError("OPENAI_API_KEY not set. Add it to .env.") from e
    yield
    # no cleanup needed


app = FastAPI(
    title="Contract Analyzer API",
    description="Upload a contract PDF; get back clause breakdown and plain-language explanations.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict to your React origin in production, e.g. ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def run_analysis(pdf_path: str) -> dict:
    """Run parser + LLM on a PDF file; return JSON-serializable result."""
    parser: ContractParser = app.state.parser
    explainer: LLMExplainer = app.state.explainer

    text = parser.extract_text_from_pdf(pdf_path)
    clauses_raw = parser.split_into_clauses(text)
    contract_summary = explainer.contract_summary(text)

    clauses = []
    for i, clause_text in enumerate(clauses_raw, start=1):
        clause_type = parser.classify_clause_type(clause_text)
        explanation = explainer.explain_clause(clause_text, clause_type)
        clauses.append({
            "clause_id": i,
            "clause_type": clause_type,
            "original_text": clause_text,
            "explanation": explanation,
        })

    return {
        "contract_summary": contract_summary or "",
        "total_clauses": len(clauses),
        "clauses": clauses,
    }


async def run_analysis_streaming(pdf_path: str) -> AsyncGenerator[str, None]:
    """Run parser + LLM on a PDF file; yield results as they're processed."""
    import asyncio
    
    parser: ContractParser = app.state.parser
    explainer: LLMExplainer = app.state.explainer

    # Extract text and split into clauses (CPU-bound, run in executor)
    loop = asyncio.get_event_loop()
    text = await loop.run_in_executor(None, parser.extract_text_from_pdf, pdf_path)
    clauses_raw = await loop.run_in_executor(None, parser.split_into_clauses, text)
    total_clauses = len(clauses_raw)
    
    # Send initial metadata
    yield f"data: {json.dumps({'type': 'start', 'total_clauses': total_clauses})}\n\n"
    
    # Generate and send contract summary
    yield f"data: {json.dumps({'type': 'summary_start'})}\n\n"
    contract_summary = await loop.run_in_executor(None, explainer.contract_summary, text)
    yield f"data: {json.dumps({'type': 'summary', 'summary': contract_summary or ''})}\n\n"
    
    # Process clauses one by one and stream them
    for i, clause_text in enumerate(clauses_raw, start=1):
        clause_type = await loop.run_in_executor(None, parser.classify_clause_type, clause_text)
        
        # Send clause start event
        yield f"data: {json.dumps({'type': 'clause_start', 'clause_id': i, 'clause_type': clause_type})}\n\n"
        
        # Generate explanation (this is the slow part - LLM call)
        explanation = await loop.run_in_executor(None, explainer.explain_clause, clause_text, clause_type)
        
        # Send complete clause
        clause_data = {
            "type": "clause",
            "clause_id": i,
            "clause_type": clause_type,
            "original_text": clause_text,
            "explanation": explanation,
        }
        yield f"data: {json.dumps(clause_data)}\n\n"
    
    # Send completion event
    yield f"data: {json.dumps({'type': 'complete'})}\n\n"


@app.post("/api/analyze")
async def analyze_contract(file: UploadFile = File(..., description="Contract PDF file")):
    """
    Upload a contract PDF. Returns JSON with contract summary and per-clause explanations.
    (Legacy endpoint - use /api/analyze-stream for streaming results)
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF.")

    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}") from e

    if not contents:
        raise HTTPException(status_code=400, detail="File is empty.")

    fd, path = tempfile.mkstemp(suffix=".pdf")
    try:
        os.write(fd, contents)
        os.close(fd)
        result = run_analysis(path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}") from e
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass


@app.post("/api/analyze-stream")
async def analyze_contract_stream(file: UploadFile = File(..., description="Contract PDF file")):
    """
    Upload a contract PDF. Streams results as Server-Sent Events (SSE) as each clause is analyzed.
    Events:
    - start: Initial metadata with total_clauses count
    - summary_start: Contract summary generation started
    - summary: Contract summary text
    - clause_start: A clause analysis started (clause_id, clause_type)
    - clause: Complete clause data (clause_id, clause_type, original_text, explanation)
    - complete: Analysis finished
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF.")

    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read file: {e}") from e

    if not contents:
        raise HTTPException(status_code=400, detail="File is empty.")

    fd, path = tempfile.mkstemp(suffix=".pdf")
    try:
        os.write(fd, contents)
        os.close(fd)
        
        async def generate():
            try:
                async for chunk in run_analysis_streaming(path):
                    yield chunk
            finally:
                # Cleanup temp file
                try:
                    os.unlink(path)
                except FileNotFoundError:
                    pass
        
        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            }
        )
    except Exception as e:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}") from e


class AskRequest(BaseModel):
    """Payload for contract Q&A: the analysis result from /api/analyze + a question."""

    question: str = Field(..., min_length=1, description="User question about the contract")
    contract_summary: str = Field(default="", description="Summary from /api/analyze")
    clauses: list[dict] = Field(
        default_factory=list,
        description="Clauses from /api/analyze (clause_id, clause_type, original_text, explanation)",
    )


@app.post("/api/ask")
async def ask_about_contract(body: AskRequest):
    """
    Answer a question about the contract using only the provided analysis (summary + clauses).
    Pass the same contract_summary and clauses you got from POST /api/analyze.
    If the answer is not in that information, returns: "I cannot answer that, there is no information about it in the contract."
    """
    explainer: LLMExplainer = app.state.explainer
    answer = explainer.answer_question(
        contract_summary=body.contract_summary,
        clauses=body.clauses,
        question=body.question.strip(),
    )
    return {"answer": answer}


@app.get("/api/health")
async def health():
    """Check that the API and API key are ready."""
    return {"status": "ok"}
