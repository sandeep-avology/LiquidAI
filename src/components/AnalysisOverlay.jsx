import { useState, useRef, useEffect } from 'react'
import { fileToBase64, extractImageColors } from '../utils/helpers'
import { callAnalyzeImageAPI } from '../utils/api'

const FORMAT_OPTIONS = [
  { value: 'html',    label: 'HTML + CSS' },
  { value: 'html-js', label: 'HTML + CSS + JS' },
  { value: 'shopify', label: 'Shopify Liquid' },
  { value: 'react',   label: 'React Component' },
  { value: 'vue',     label: 'Vue Component' },
]

const LOG_STEPS = [
  'Step 1/2: Reading image structure and layout…',
  'Step 1/2: Detecting colors, typography, spacing…',
  'Step 1/2: Identifying UI components and sections…',
  'Step 2/2: Writing HTML markup from screenshot…',
  'Step 2/2: Generating CSS styles…',
  'Step 2/2: Finalising responsive code…',
]

export default function AnalysisOverlay({ imageFile, outputFormat, onClose, onComplete, onSwitchToFile, onShowToast }) {
  const [step, setStep]                 = useState(1)   // 1=setup  2=running  3=done  4=no-key
  const [imageSrc, setImageSrc]         = useState('')
  const [prompt, setPrompt]             = useState('')
  const [fmt, setFmt]                   = useState(outputFormat || 'html')
  const [statusText, setStatusText]     = useState(LOG_STEPS[0])
  const [logIndex, setLogIndex]         = useState(0)
  const [successData, setSuccessData]   = useState(null)
  const [errorMsg, setErrorMsg]         = useState('')
  const [visionEnabled, setVisionEnabled] = useState(null) // null = checking
  const abortRef  = useRef(null)
  const timerRef  = useRef(null)

  // Load image preview
  useEffect(() => {
    if (!imageFile) return
    const reader = new FileReader()
    reader.onload = e => setImageSrc(e.target.result)
    reader.readAsDataURL(imageFile)
  }, [imageFile])

  // Check if API key is configured
  useEffect(() => {
    fetch('/api/vision-status', { headers: { Authorization: `Bearer ${localStorage.getItem('liquidai_token') || ''}` } })
      .then(r => r.json())
      .then(d => setVisionEnabled(d.visionEnabled))
      .catch(() => setVisionEnabled(false))
  }, [])

  // Cycle through log steps during generation
  useEffect(() => {
    if (step !== 2) return
    setLogIndex(0)
    setStatusText(LOG_STEPS[0])
    let i = 0
    timerRef.current = setInterval(() => {
      i = Math.min(i + 1, LOG_STEPS.length - 1)
      setLogIndex(i)
      setStatusText(LOG_STEPS[i])
    }, 2200)
    return () => clearInterval(timerRef.current)
  }, [step])

  const handleRun = async () => {
    if (!imageFile) return
    setStep(2); setErrorMsg('')

    try {
      const [{ base64, mediaType }, colorPalette] = await Promise.all([
        fileToBase64(imageFile),
        extractImageColors(imageFile),
      ])

      abortRef.current = new AbortController()

      const data = await callAnalyzeImageAPI({
        imageBase64: base64,
        mediaType,
        userPrompt:   prompt.trim(),
        format:       fmt,
        colorPalette,
        signal:       abortRef.current.signal,
        onStatus:     msg => setStatusText(msg),
      })

      clearInterval(timerRef.current)
      setSuccessData(data)
      setStep(3)
    } catch (err) {
      clearInterval(timerRef.current)
      if (err.name === 'AbortError') return
      if (err.message === 'SESSION_EXPIRED') { handleClose(); return }
      setStep(1)
      setErrorMsg(err.message || 'Something went wrong. Please try again.')
    }
  }

  const handleClose = () => {
    abortRef.current?.abort()
    clearInterval(timerRef.current)
    onClose()
  }

  const handleViewCode = () => {
    if (successData) {
      onComplete(successData)
      const first = successData.files?.[0]?.name
      if (first) onSwitchToFile?.(first)
    }
  }

  const handleOpenPreview = () => {
    if (successData) {
      onComplete(successData)
      onSwitchToFile?.('__preview__')
    }
  }

  // ── Shared card shell ──────────────────────────────────────
  const Card = ({ children }) => (
    <div className="analysis-overlay" onClick={e => e.target === e.currentTarget && handleClose()}>
      <div className="analysis-card">
        <button className="analysis-close" onClick={handleClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 3L13 13M13 3L3 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
          </svg>
        </button>
        {children}
      </div>
    </div>
  )

  // ── Step 1: Setup ─────────────────────────────────────────
  if (step === 1) return (
    <Card>
      <div className="analysis-step">
        <div className="analysis-header">
          <div className="analysis-icon">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="7" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M2 14l4-4 3 3 3-3 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h3 className="analysis-title">Analyze Design</h3>
            <p className="analysis-subtitle">Generate code that matches your screenshot</p>
          </div>
        </div>

        {/* Image preview */}
        {imageSrc && (
          <div className="analysis-image-wrap">
            <img src={imageSrc} alt="Uploaded design" className="analysis-image-preview" />
            <div className="analysis-image-overlay">
              <span className="analysis-image-badge">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 7l3-3 2 2 3-4 2 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Ready to analyze
              </span>
            </div>
          </div>
        )}

        {/* Vision key banner */}
        {visionEnabled === false && (
          <div style={{
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 10, padding: '12px 14px', marginTop: 14,
          }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: '#f59e0b', marginBottom: 6 }}>
              ⚡ AI Vision not configured
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              For pixel-perfect image analysis, add your API key to a <code style={{ background:'rgba(255,255,255,0.1)', padding:'1px 5px', borderRadius:4 }}>.env</code> file in the project root:
            </p>
            <pre style={{
              margin: '8px 0 0', background: 'rgba(0,0,0,0.3)', borderRadius: 6,
              padding: '8px 12px', fontSize: 12, color: '#e0e0e0', overflowX: 'auto',
            }}>ANTHROPIC_API_KEY=sk-ant-your-key-here</pre>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Without a valid API key, image uploads cannot be converted to code. Generic templates are no longer used as a fallback.
            </p>
          </div>
        )}

        {visionEnabled === true && (
          <div style={{
            background: 'rgba(0,208,132,0.06)', border: '1px solid rgba(0,208,132,0.25)',
            borderRadius: 10, padding: '10px 14px', marginTop: 14,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="#00D084" strokeWidth="1.3"/>
              <path d="M4 7l2 2 4-4" stroke="#00D084" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize: 12, color: '#00D084', fontWeight: 600 }}>AI Vision active — will generate pixel-perfect code from your image</span>
          </div>
        )}

        {/* Output format */}
        <div style={{ marginTop: 16 }}>
          <label className="analysis-prompt-label" style={{ display:'block', marginBottom:7 }}>Output format</label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {FORMAT_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => setFmt(opt.value)} style={{
                padding:'5px 11px', borderRadius:6, fontSize:12, fontWeight:500, cursor:'pointer',
                border:     fmt === opt.value ? '1px solid #00D084' : '1px solid var(--border-mid)',
                background: fmt === opt.value ? 'rgba(0,208,132,0.12)' : 'var(--bg-elevated)',
                color:      fmt === opt.value ? '#00D084' : 'var(--text-secondary)',
              }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Additional prompt */}
        <div className="analysis-prompt-wrap" style={{ marginTop: 14 }}>
          <label className="analysis-prompt-label">Additional instructions (optional)</label>
          <textarea
            className="analysis-prompt-input"
            placeholder="E.g. Dark mode, add hover animations, use Inter font, make it a Shopify section…"
            rows={2}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
          />
        </div>

        {errorMsg && (
          <div style={{
            background:'rgba(255,80,80,0.08)', border:'1px solid rgba(255,80,80,0.3)',
            borderRadius:10, padding:'12px 14px', marginTop:14, fontSize:13, color:'#ff6b6b',
          }}>
            <strong>⚠ Error</strong><br/>
            <span style={{ color:'var(--text-secondary)' }}>{errorMsg}</span>
          </div>
        )}

        <div className="analysis-actions">
          <button className="analysis-btn-secondary" onClick={handleClose}>Cancel</button>
          <button className="analysis-btn-primary" onClick={handleRun}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M7.5 1.5L9.5 6.5L14.5 7.5L11 11L12 14.5L7.5 12.5L3 14.5L4 11L0.5 7.5L5.5 6.5L7.5 1.5Z"
                stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            </svg>
            {visionEnabled ? 'Analyze & Generate Code' : 'Generate Code'}
          </button>
        </div>
      </div>
    </Card>
  )

  // ── Step 2: Running ───────────────────────────────────────
  if (step === 2) return (
    <Card>
      <div className="analysis-step">
        <div className="analysis-progress-wrap">
          <div className="analysis-spinner">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <circle cx="22" cy="22" r="17" stroke="rgba(0,208,132,0.12)" strokeWidth="3"/>
              <path d="M22 5a17 17 0 0 1 17 17" stroke="#00D084" strokeWidth="3" strokeLinecap="round" className="spinner-arc"/>
            </svg>
          </div>
          <p className="analysis-status-text">{statusText}</p>
          <div className="analysis-progress-bar" style={{ marginTop: 14 }}>
            <div className="analysis-progress-fill" style={{ width: `${Math.min(95, ((logIndex + 1) / LOG_STEPS.length) * 100)}%`, transition: 'width 2s ease' }} />
          </div>
          <div className="analysis-stream-log" style={{ marginTop: 18 }}>
            {LOG_STEPS.map((s, i) => (
              <div key={i} className={`stream-log-item${i === logIndex ? ' active' : ''}${i < logIndex ? ' done' : ''}`}>
                <span className="log-dot" />
                <span>{s}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => { abortRef.current?.abort(); clearInterval(timerRef.current); setStep(1) }}
            style={{ marginTop:20, background:'none', border:'1px solid var(--border-mid)', color:'var(--text-muted)', borderRadius:7, padding:'6px 16px', fontSize:12, cursor:'pointer' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </Card>
  )

  // ── Step 3: Success ───────────────────────────────────────
  if (step === 3 && successData) return (
    <Card>
      <div className="analysis-step">
        <div className="analysis-success">
          <div className="analysis-success-icon">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="#00D084" strokeWidth="2"/>
              <path d="M9 16l5 5 9-9" stroke="#00D084" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h3 className="analysis-success-title">Code Generated!</h3>
          <p className="analysis-success-desc">{successData.description || `"${successData.title}" is ready.`}</p>
          <div className="analysis-success-files">
            {(successData.files || []).map(f => (
              <span key={f.name} className="analysis-file-badge">{f.name}</span>
            ))}
          </div>
          <div className="analysis-actions" style={{ marginTop:22 }}>
            <button className="analysis-btn-secondary" onClick={handleViewCode}>View Code</button>
            <button className="analysis-btn-primary" onClick={handleOpenPreview}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 7s2.5-4.5 6-4.5S13 7 13 7s-2.5 4.5-6 4.5S1 7 1 7z" stroke="currentColor" strokeWidth="1.3"/>
                <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
              Open Preview
            </button>
          </div>
        </div>
      </div>
    </Card>
  )

  return null
}
