# Contract Risk Analyzer (Front-end)

Web app for uploading contract PDFs and viewing AI-generated summaries and clause-by-clause explanations. You can also ask questions about the contract once analysis is done.

---

## What you need

- **Node.js** (v18 or newer is fine)
- The **backend API** running (this app talks to it over HTTP)

The front-end expects the API at `http://127.0.0.1:8000` by default. If your backend runs somewhere else, see [Config](#config) below.

---

## Run the app

From the `front-end` folder:

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

If the backend isn’t running, the app will show a message and a retry button instead of the upload screen.

---

## What it does

1. **Upload** – Drag and drop a PDF or use the file picker. Only PDFs are accepted.
2. **Analyze** – Click “Analyze contract”. The backend streams results: you’ll see a summary first, then clauses and explanations as they’re ready. A progress line shows how many clauses are done.
3. **Read** – Summary and each clause’s text and explanation use a typewriter-style effect.
4. **Ask** – After analysis finishes, you can type questions about the contract and get answers based on the summary and clauses. The question box is disabled until loading is complete.

You can reset and analyze another contract anytime with “← Analyze another contract”.

---

## Scripts

| Command        | What it does              |
|----------------|----------------------------|
| `npm run dev`  | Start dev server (Vite)   |
| `npm run build`| Production build          |
| `npm run preview` | Serve production build |
| `npm run lint` | Run ESLint                |

---

## Config

To point at a different API URL, set:

```bash
VITE_API_URL=http://your-api-host:port
```

Then run `npm run dev` (or rebuild for production). The app uses this when calling the backend.

---

## Tech stack

- **React 19** + **Vite 7**
- **CSS** with variables (light/dark via `prefers-color-scheme`)
- No UI framework; custom components and a small typewriter hook for the effect

Main entry is `src/App.jsx`. API calls live in `src/api.js` (health check, streaming analysis, and the “ask” endpoint).
