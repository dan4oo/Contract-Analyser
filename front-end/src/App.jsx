import { useState, useEffect, useCallback, useRef } from 'react'
import { healthCheck, analyzeContractStream, askQuestion, NO_ANSWER_PHRASE } from './api'
import { TypewriterText } from './components/TypewriterText'
import './App.css'

const PDF_ACCEPT = '.pdf'
const PDF_MIME = 'application/pdf'
const TYPEWRITER_SPEED = 5
const EXPLANATION_DELAY_MS = 300
const TEXTAREA_MAX_HEIGHT = 200

const INITIAL_RESULT = {
  contract_summary: '',
  total_clauses: 0,
  clauses: [],
}

function isNoInfoAnswer(answer) {
  const s = (answer ?? '').trim()
  return s === NO_ANSWER_PHRASE || s.toLowerCase().includes('no information about it in the contract')
}

function isPdf(file) {
  return file?.name?.toLowerCase().endsWith('.pdf') && (file.type === PDF_MIME || file.type === '')
}

/** Get clauses that are fully loaded (no null, not loading, have text). */
function getCompleteClauses(clauses) {
  return (clauses ?? [])
    .filter((c) => c !== null && !c.loading && c.original_text)
    .map(({ clause_id, clause_type, original_text, explanation }) => ({
      clause_id,
      clause_type,
      original_text,
      explanation,
    }))
}

/** Count clauses that have finished loading. */
function getCompletedClauseCount(clauses) {
  return (clauses ?? []).filter((c) => c && !c.loading).length
}

/** Set clause at 1-based index, growing array if needed. Returns new array. */
function setClauseAt(clauses, clauseId, clauseData) {
  const next = [...(clauses || [])]
  while (next.length < clauseId) next.push(null)
  next[clauseId - 1] = clauseData
  return next
}

function App() {
  const [backendOk, setBackendOk] = useState(null)
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const [question, setQuestion] = useState('')
  const [askLoading, setAskLoading] = useState(false)
  const [askError, setAskError] = useState(null)
  const [answer, setAnswer] = useState(null)
  const [lastQuestion, setLastQuestion] = useState(null)
  const questionInputRef = useRef(null)

  const checkHealth = useCallback(async () => {
    setBackendOk(null)
    const { ok } = await healthCheck()
    setBackendOk(ok)
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  useEffect(() => {
    const el = questionInputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`
  }, [question])

  const handleFile = useCallback((selectedFile) => {
    setError(null)
    setResult(null)
    if (!selectedFile) {
      setFile(null)
      return
    }
    if (!isPdf(selectedFile)) {
      setError('Please select a valid PDF file.')
      setFile(null)
      return
    }
    setFile(selectedFile)
  }, [])

  const handleStreamEvent = useCallback((event) => {
    switch (event.type) {
      case 'start':
        setResult({
          ...INITIAL_RESULT,
          total_clauses: event.total_clauses || 0,
        })
        break
      case 'summary':
        setResult((prev) =>
          prev
            ? { ...prev, contract_summary: event.summary || '' }
            : { ...INITIAL_RESULT, contract_summary: event.summary || '' }
        )
        break
      case 'clause_start':
        setResult((prev) => {
          if (!prev) return { ...INITIAL_RESULT }
          const clauses = setClauseAt(prev.clauses, event.clause_id, {
            clause_id: event.clause_id,
            clause_type: event.clause_type,
            original_text: '',
            explanation: '',
            loading: true,
          })
          return { ...prev, clauses }
        })
        break
      case 'clause':
        setResult((prev) => {
          if (!prev) return { ...INITIAL_RESULT }
          const clauses = setClauseAt(prev.clauses, event.clause_id, {
            clause_id: event.clause_id,
            clause_type: event.clause_type,
            original_text: event.original_text,
            explanation: event.explanation,
            loading: false,
          })
          return { ...prev, clauses }
        })
        break
      case 'complete':
        setLoading(false)
        break
      default:
        break
    }
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragActive(false)
    const f = e.dataTransfer?.files?.[0]
    handleFile(f || null)
  }, [handleFile])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const onDragLeave = useCallback((e) => {
    e.preventDefault()
    setDragActive(false)
  }, [])

  const onInputChange = useCallback((e) => {
    handleFile(e.target?.files?.[0] || null)
  }, [handleFile])

  const submit = useCallback(async () => {
    if (!file || loading) return
    setError(null)
    setResult(null)
    setLoading(true)
    try {
      await analyzeContractStream(file, handleStreamEvent)
    } catch (err) {
      setError(err.message || 'Analysis failed. Try again.')
      setLoading(false)
      setResult(null)
    }
  }, [file, loading, handleStreamEvent])

  const reset = useCallback(() => {
    setFile(null)
    setError(null)
    setResult(null)
    setQuestion('')
    setAskLoading(false)
    setAskError(null)
    setAnswer(null)
    setLastQuestion(null)
  }, [])

  const submitAsk = useCallback(async () => {
    const q = question?.trim()
    if (!q || !result || askLoading) return
    setAskError(null)
    setAnswer(null)
    setAskLoading(true)
    try {
      const completeClauses = getCompleteClauses(result.clauses)
      const response = await askQuestion(q, result.contract_summary ?? '', completeClauses)
      setLastQuestion(q)
      setAnswer(response.answer)
    } catch (err) {
      setAskError(err.message || 'Failed to get answer.')
    } finally {
      setAskLoading(false)
      setQuestion('')
    }
  }, [question, result, askLoading])

  if (backendOk === null) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Contract Risk Analyzer</h1>
          <p className="status status-checking">Checking backend…</p>
        </header>
      </div>
    )
  }

  if (!backendOk) {
    return (
      <div className="app">
        <header className="app-header">
          <h1>Contract Risk Analyzer</h1>
          <p className="status status-error">Backend unavailable. Make sure the API is running (e.g. uvicorn api:app --reload).</p>
          <button type="button" className="btn btn-secondary" onClick={checkHealth}>Retry</button>
        </header>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Contract Risk Analyzer</h1>
        <p className="tagline">Upload a contract PDF to get a summary and clause-by-clause analysis.</p>
      </header>

      {!result ? (
        <section className="upload-section">
          <div
            className={`dropzone ${dragActive ? 'dropzone-active' : ''} ${file ? 'dropzone-has-file' : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
          >
            <input
              type="file"
              accept={PDF_ACCEPT}
              onChange={onInputChange}
              disabled={loading}
              id="file-input"
              className="dropzone-input"
            />
            <label htmlFor="file-input" className="dropzone-label">
              {file ? (
                <span className="dropzone-filename">{file.name}</span>
              ) : (
                <span>Drag and drop a PDF here, or <span className="dropzone-browse">browse</span></span>
              )}
            </label>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={submit}
              disabled={!file || loading}
            >
              Analyze contract
            </button>
            {file && !loading && (
              <button type="button" className="btn btn-secondary" onClick={reset}>
                Clear
              </button>
            )}
          </div>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
        </section>
      ) : (
        <section className="results-section">
          <button type="button" className="btn btn-secondary back-btn" onClick={reset}>
            ← Analyze another contract
          </button>

          {result?.contract_summary && (
            <div className="summary-block">
              <h2>What this contract is about</h2>
              <p className="summary-text">
                <TypewriterText text={result.contract_summary} speed={TYPEWRITER_SPEED} />
              </p>
            </div>
          )}

          <div className="ask-block">
            <h2>Ask about this contract</h2>
            {loading ? (
              <p className="ask-hint ask-disabled">
                Please wait for all clauses to be analyzed before asking questions.
              </p>
            ) : (
              <p className="ask-hint">Ask a question; the answer is based only on the contract summary and clauses.</p>
            )}
            <div className="ask-form">
              <textarea
                ref={questionInputRef}
                className="ask-input"
                placeholder={loading ? "Analyzing contract... Please wait." : "e.g. What are the indemnity obligations?"}
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value)
                  const el = questionInputRef.current
                  if (el) {
                    el.style.height = 'auto'
                    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_HEIGHT)}px`
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !loading) {
                    e.preventDefault()
                    submitAsk()
                  }
                }}
                disabled={askLoading || loading}
                rows={2}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitAsk}
                disabled={!question?.trim() || askLoading || loading}
              >
                {askLoading ? 'Asking…' : loading ? 'Analyzing...' : 'Ask'}
              </button>
            </div>
            {askError && (
              <div className="error-message ask-error" role="alert">
                {askError}
              </div>
            )}
            {askLoading && (
              <div className="skeleton-answer">
                <div className="skeleton-line skeleton-question"></div>
                <div className="skeleton-answer-content">
                  <div className="skeleton-line"></div>
                  <div className="skeleton-line"></div>
                  <div className="skeleton-line skeleton-short"></div>
                </div>
              </div>
            )}
            {answer !== null && !askLoading && (
              <div className={`ask-answer ${isNoInfoAnswer(answer) ? 'ask-answer-no-info' : ''}`}>
                {lastQuestion && (
                  <p className="ask-question-label">{lastQuestion}</p>
                )}
                {isNoInfoAnswer(answer) ? (
                  <p className="ask-answer-notice">
                    <TypewriterText
                      text="No information about that in the contract."
                      speed={TYPEWRITER_SPEED}
                    />
                  </p>
                ) : (
                  <p>
                    <TypewriterText text={answer} speed={TYPEWRITER_SPEED} />
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="contract-doc-block">
            <div className="contract-doc-header">
              <h2>Full contract with analysis</h2>
              {loading && result?.total_clauses > 0 && (() => {
                const completed = getCompletedClauseCount(result.clauses)
                const total = result.total_clauses
                return (
                  <div className="analysis-progress">
                    <span className="progress-text">
                      Analyzing clauses... {completed} / {total} complete
                    </span>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${total ? (completed / total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="contract-doc">
              {((result?.clauses) ?? [])
                .filter((c) => c !== null && !c.loading)
                .map((clause) => (
                  <div key={clause.clause_id} className="contract-doc-clause">
                    <div className="contract-doc-clause-meta">
                      <span className="clause-id">Clause {clause.clause_id}</span>
                      <span className="clause-type">{clause.clause_type}</span>
                    </div>
                    {clause.original_text ? (
                      <>
                        <div className="contract-doc-clause-text">
                          <TypewriterText
                            text={clause.original_text}
                            speed={TYPEWRITER_SPEED}
                            startImmediately={true}
                          />
                        </div>
                        <div
                          className={`contract-doc-clause-explanation ${
                            clause.explanation === 'I cannot explain it.' ? 'explanation-fallback' : ''
                          }`}
                        >
                          {clause.explanation?.trim() ? (
                            <TypewriterText
                              text={clause.explanation}
                              speed={TYPEWRITER_SPEED}
                              startImmediately={true}
                              delay={EXPLANATION_DELAY_MS}
                            />
                          ) : (
                            <div className="explanation-loading">No explanation available</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="clause-placeholder">Extracting clause text...</div>
                    )}
                  </div>
                ))}
              {loading && getCompletedClauseCount(result?.clauses) === 0 && (
                <div className="loading-message">
                  Analyzing contract... Clauses will appear here as they are processed.
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

export default App
