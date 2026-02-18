# Contract Analyser

A web app that lets you upload a contract PDF, get an AI-generated overview and clause-by-clause plain-language explanations, and ask questions about the contract. The system is designed to **minimize false answers and hallucinations** by using rule-based code for structure and tightly scoped LLM prompts that only use the document you provide.

---

## How it works

1. **Upload** – You upload a contract PDF.
2. **Extract & split** – The backend extracts text from the PDF and **splits it into clauses using rule-based Python code** (no LLM). See [Clause splitting (code, not LLM)](#clause-splitting-code-not-llm) below.
3. **Overview** – A first LLM reads the contract text and gives a short **overview** of what the contract is about. It is instructed to base this only on the contract and not to use outside knowledge.
4. **Clause explanations** – A second LLM explains each clause in **plain language**. It is instructed to explain only from the clause text given, without bringing in information from elsewhere.
5. **Q&A** – After analysis, you can ask questions. A third LLM answers **only from the summary and clause data** it receives; it cannot access the internet or other sources, so it either answers from that information or says it has no information.

---

## Anti-hallucination design: the three LLMs

The prompts for the LLM agents are written **explicitly so they do not give false answers or hallucinate**:

| LLM | Role | Constraint |
|-----|------|------------|
| **1. Contract overview** | Summarizes what the contract is about in 2–4 sentences. | Must use **only the contract text** provided. If it cannot summarize clearly, it responds with “I cannot explain it.” No external knowledge. |
| **2. Clause explainer** | Explains each clause in plain, non-legal language. | Must base the explanation **only on the clause text** given. It does not look up or use information from outside the document. If the text is unclear or not explainable, it responds with “I cannot explain it.” |
| **3. Q&A assistant** | Answers your questions about the contract. | Can use **only the information** passed to it (contract summary + clause text and explanations). It cannot use the internet or any other source. If nothing in that information answers the question, it responds with: “I cannot answer that, there is no information about it in the contract.” |

So: overview and explanations stay within the document; Q&A stays within the analysis data. No external knowledge is used, which avoids hallucinations from outside sources.

---

## Clause splitting: code, not LLM

**We use rule-based Python code to split the contract into clauses**, not an LLM. Reasons:

- **Stability** – LLMs can split incorrectly when numbering or formatting is unusual.
- **Accuracy** – They may merge two clauses into one or split a single clause in the wrong place.
- **Minimized hallucinations** – Wrong splitting can lead to wrong extraction or risk scoring later.
- **Debugging** – With code, we can test, fix, and handle edge cases in a deterministic way.

The AI is reserved for **data extraction and plain-language explanations**, where its reasoning and language understanding are actually needed. Clause boundaries are handled by deterministic logic in `back-end/parser.py` (e.g. numbered items, Article/Section headings, Roman numerals, lettered sub-items).

---

## How to run it

### Prerequisites

- **Python 3.10+** (for the backend)
- **Node.js 18+** (for the frontend)
- **OpenAI API key** (for the LLMs)

### Backend

1. Go to the backend folder and set your API key:

   ```bash
   cd back-end
   ```

2. Create a `.env` file in `back-end` with:

   ```
   OPENAI_API_KEY=your-openai-api-key-here
   ```

3. Install dependencies and start the server:

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

   The API will be at **http://127.0.0.1:8000**.

### Frontend

1. In another terminal, go to the frontend folder:

   ```bash
   cd front-end
   npm install
   npm run dev
   ```

2. Open the URL Vite prints (usually **http://localhost:5173**).

3. The app talks to the backend at `http://127.0.0.1:8000` by default. To use another API URL:

   ```bash
   VITE_API_URL=http://your-host:port npm run dev
   ```

### Using the app

1. Upload a contract PDF (drag-and-drop or file picker).
2. Click **Analyze contract**. You’ll see the overview first, then clauses and explanations as they stream in.
3. When analysis is done, use the question box to ask about the contract. Answers are based only on the analyzed data.

---

## Project structure

```
Contract Analyser/
├── README.md                 # This file
├── back-end/
│   ├── api.py                # FastAPI app: /api/analyze, /api/analyze-stream, /api/ask, /api/health
│   ├── parser.py             # PDF text extraction, rule-based clause splitting, clause type classification
│   ├── llm.py                # LLM calls: contract summary, clause explanation, Q&A
│   ├── run.sh                # Script to create venv, install deps, run uvicorn
│   ├── requirements.txt
│   └── .env                  # OPENAI_API_KEY (you create this)
├── front-end/
│   ├── src/
│   │   ├── App.jsx           # Main UI: upload, streaming results, Q&A
│   │   ├── api.js            # Health check, streaming analysis, ask endpoint
│   │   └── components/       # Typewriter effect, etc.
│   └── package.json
└── STREAMING_API_DOCUMENTATION.md   # SSE event format for /api/analyze-stream
```

---

## API summary

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Check that the API and API key are ready. |
| `/api/analyze` | POST | Upload a PDF; get full analysis as JSON (no streaming). |
| `/api/analyze-stream` | POST | Upload a PDF; get analysis as Server-Sent Events (summary, then clauses one by one). |
| `/api/ask` | POST | Send `question`, `contract_summary`, and `clauses`; get an answer based only on that information. |

See `STREAMING_API_DOCUMENTATION.md` for the streaming event format.

---

## Tech stack

- **Backend:** Python, FastAPI, pdfplumber (PDF text), OpenAI API (GPT-4o-mini).
- **Frontend:** React 19, Vite 7, CSS (light/dark via `prefers-color-scheme`).

If you want more detail on the frontend only, see `front-end/README.md`.
