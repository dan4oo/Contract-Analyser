const getApiUrl = () => import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

const ANALYZE_TIMEOUT_MS = 120_000;

/**
 * Parse error message from API response.
 * @param {object} data - Response body (may have detail)
 * @param {string} fallback - Fallback message
 * @returns {string}
 */
function getErrorMessage(data, fallback = 'Request failed') {
  if (!data?.detail) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail.map((d) => d?.msg ?? String(d)).join(', ');
  }
  return data.detail?.msg ?? fallback;
}

/**
 * Check if the backend is reachable.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function healthCheck() {
  try {
    const res = await fetch(`${getApiUrl()}/api/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ok: false, error: res.statusText };
    const data = await res.json();
    return data?.status === 'ok' ? { ok: true } : { ok: false, error: 'Invalid health response' };
  } catch (err) {
    return { ok: false, error: err.message || 'Network error' };
  }
}

/**
 * Upload a PDF and get analysis (legacy - returns all at once).
 * @param {File} file - PDF file
 * @returns {Promise<AnalyzeResponse>}
 * @throws {Error} with message from response.detail or status text
 */
export async function analyzeContract(file) {
  const form = new FormData();
  form.append('file', file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);

  try {
    const res = await fetch(`${getApiUrl()}/api/analyze`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(getErrorMessage(data, res.statusText) || 'Analysis failed');
    }

    return data;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timed out. Analysis took too long.');
    throw err;
  }
}

/**
 * Upload a PDF and stream analysis results as Server-Sent Events.
 * @param {File} file - PDF file
 * @param {Function} onEvent - Callback for each event: (event) => void
 *   Events: { type: 'start'|'summary_start'|'summary'|'clause_start'|'clause'|'complete', ... }
 * @returns {Promise<void>}
 * @throws {Error} with message from response.detail or status text
 */
export async function analyzeContractStream(file, onEvent) {
  const form = new FormData();
  form.append('file', file);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS * 2); // Longer timeout for streaming

  try {
    const res = await fetch(`${getApiUrl()}/api/analyze-stream`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(getErrorMessage(data, res.statusText) || 'Analysis failed');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            onEvent(data);
          } catch (e) {
            console.warn('Failed to parse SSE data:', line, e);
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.startsWith('data: ')) {
      try {
        const data = JSON.parse(buffer.slice(6));
        onEvent(data);
      } catch (e) {
        console.warn('Failed to parse final SSE data:', buffer, e);
      }
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') throw new Error('Request timed out. Analysis took too long.');
    throw err;
  }
}

/**
 * Ask a question about the analyzed contract. Uses contract_summary and clauses from POST /api/analyze.
 * @param {string} question
 * @param {string} contract_summary
 * @param {Clause[]} clauses
 * @returns {Promise<{ answer: string }>}
 */
export async function askQuestion(question, contract_summary, clauses) {
  const res = await fetch(`${getApiUrl()}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, contract_summary, clauses }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(getErrorMessage(data, res.statusText) || 'Failed to get answer');
  }
  return data;
}

/** Phrase returned when the contract has no information for the question */
export const NO_ANSWER_PHRASE = 'I cannot answer that, there is no information about it in the contract.';

/**
 * @typedef {Object} Clause
 * @property {number} clause_id
 * @property {string} clause_type
 * @property {string} original_text
 * @property {string} explanation
 */

/**
 * @typedef {Object} AnalyzeResponse
 * @property {string} contract_summary
 * @property {number} total_clauses
 * @property {Clause[]} clauses
 */
