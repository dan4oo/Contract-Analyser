# Contract Risk Analyzer (Back-end)

API for uploading contract PDFs and getting AI-generated summaries and clause-by-clause explanations. Also answers questions about the contract using only the analyzed data.

---

## What you need

- **Python** (3.10 or newer)
- An **OpenAI API key** (for the LLM calls)

The API runs at `http://127.0.0.1:8000` by default. The front-end talks to this URL unless you set `VITE_API_URL` there.

---

## Run the app

From the `back-end` folder:

1. Create a `.env` file with your OpenAI key:

   ```
   OPENAI_API_KEY=your-openai-api-key-here
   ```

2. Install and start:

   ```bash
   ./run.sh
   ```

   Or manually:

   ```bash
   python3 -m venv venv
   source venv/bin/activate   # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn api:app --reload --host 0.0.0.0 --port 8000
   ```

Then the API is at **http://127.0.0.1:8000**. Use the front-end (or `/docs` for Swagger) to test it.

---

## What it does

1. **Health** – `GET /api/health` checks that the API and API key are ready.
2. **Analyze** – `POST /api/analyze-stream` accepts a PDF, extracts text, splits into clauses, and streams back a summary and then each clause with a plain-language explanation.
3. **Ask** – `POST /api/ask` accepts a question plus the contract summary and clauses; it returns an answer based only on that information (or a “no information” message).

Clause splitting is rule-based (see `parser.py`). The LLM is used only for the summary, clause explanations, and Q&A (see `llm.py`).

---

## Endpoints

| Endpoint              | Method | Description                          |
|-----------------------|--------|--------------------------------------|
| `/api/health`         | GET    | Check API and API key                |
| `/api/analyze`        | POST   | Upload PDF; get full JSON (no stream)|
| `/api/analyze-stream` | POST   | Upload PDF; stream results (SSE)     |
| `/api/ask`            | POST   | Question + summary + clauses → answer|

---

## Config

- **API key** – Set `OPENAI_API_KEY` in `.env` in this folder. The app loads it at startup and will exit with a clear message if it’s missing.

---

## Tech stack

- **Python 3.10+** with **FastAPI**
- **pdfplumber** for PDF text extraction
- **OpenAI API** (GPT-4o-mini) for summary, explanations, and Q&A

Entry point is `api.py`. PDF and clause logic is in `parser.py`; LLM prompts and calls are in `llm.py`.
