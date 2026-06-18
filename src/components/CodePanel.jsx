import { useMemo } from 'react'

const LANG_ICONS = {
  html:   { color:'#e34c26', label:'HTML'   },
  css:    { color:'#264de4', label:'CSS'    },
  js:     { color:'#f0db4f', label:'JS'     },
  jsx:    { color:'#61dafb', label:'JSX'    },
  tsx:    { color:'#61dafb', label:'TSX'    },
  vue:    { color:'#42b883', label:'Vue'    },
  liquid: { color:'#00b4d8', label:'Liquid' },
  json:   { color:'#ffe566', label:'JSON'   },
  scss:   { color:'#cc6699', label:'SCSS'   },
}

function LangBadge({ lang }) {
  const info = LANG_ICONS[lang] || { color:'#8a8a9a', label:(lang||'').toUpperCase() }
  return (
    <span style={{
      display:'inline-block', padding:'1px 5px',
      background: info.color + '22', color: info.color,
      borderRadius:3, fontSize:10, fontWeight:700,
      letterSpacing:'.04em', marginLeft:5, verticalAlign:'middle'
    }}>
      {info.label}
    </span>
  )
}

const PLACEHOLDERS = {
  liquid:  'No Liquid code yet.\n\nUpload a screenshot or ask to generate a section.',
  html:    'No HTML yet.\n\nUpload a screenshot or describe what you want to build.',
  css:     'No CSS yet.\n\nGenerated styles will appear here.',
  js:      'No JavaScript yet.\n\nInteractivity code will appear here.',
  json:    'No schema yet.\n\nThe Shopify schema JSON will appear here.',
  jsx:     'No React component yet.\n\nSelect the React format and generate.',
  vue:     'No Vue component yet.\n\nSelect the Vue format to generate.',
  default: 'No code yet.\n\nGenerate code by uploading a design or describing what you need.',
}

export default function CodePanel({ open, activeFile, currentCode, onFileChange, onClose, onCopy, onDownload, onDownloadAll }) {
  const files      = currentCode?.files || []
  const isPreview  = activeFile === '__preview__'
  const activeData = files.find(f => f.name === activeFile)
  const code       = activeData?.content || ''
  const lang       = activeData?.lang || ''
  const placeholder = PLACEHOLDERS[lang] || PLACEHOLDERS.default

  const lineNumbers = useMemo(() => {
    if (!code || isPreview) return ''
    return Array.from({ length: code.split('\n').length }, (_, i) => i + 1).join('\n')
  }, [code, isPreview])

  return (
    <div className={`code-panel${open ? ' open' : ''}`}>
      {/* ── header ── */}
      <div className="code-panel-header">
        <div className="code-panel-tabs">
          {files.map(f => (
            <button
              key={f.name}
              className={`code-tab${activeFile === f.name ? ' active' : ''}`}
              onClick={() => onFileChange(f.name)}
              title={f.name}
            >
              {f.name}
              <LangBadge lang={f.lang} />
            </button>
          ))}

          {currentCode?.preview_html && (
            <button
              className={`code-tab code-tab--preview${isPreview ? ' active' : ''}`}
              onClick={() => onFileChange('__preview__')}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M1 6s1.8-4 5-4 5 4 5 4-1.8 4-5 4-5-4-5-4z" stroke="currentColor" strokeWidth="1.3"/>
                <circle cx="6" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
              </svg>
              {' '}Preview
            </button>
          )}
        </div>

        <div className="code-panel-actions">
          {files.length > 1 && (
            <button className="code-action-btn" onClick={onDownloadAll} title="Download all files">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 2v7M4 6.5L7 9.5 10 6.5M2.5 11.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              All
            </button>
          )}
          <button className="code-action-btn" onClick={onCopy} title="Copy active file">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="4.5" y="4.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M4.5 9.5H3A1.5 1.5 0 011.5 8V3A1.5 1.5 0 013 1.5h5A1.5 1.5 0 019.5 3v1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            Copy
          </button>
          <button className="code-action-btn" onClick={onDownload} title="Download active file">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v7M4 6.5L7 9.5 10 6.5M2.5 11.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Save
          </button>
          <button className="icon-btn" onClick={onClose} title="Close panel">
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M3 3L12 12M12 3L3 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
      </div>

      {/* ── body ── */}
      <div className={`code-panel-body${isPreview ? ' show-preview' : ''}`}>
        <div className="code-editor-wrap">
          <div className="line-numbers" aria-hidden="true">{lineNumbers}</div>
          <pre className={`code-display${!code ? ' is-empty' : ''}`}>
            <code id="codeContent">{code || placeholder}</code>
          </pre>
        </div>

        <iframe
          className="preview-frame"
          title="Live Preview"
          sandbox="allow-scripts"
          srcDoc={
            currentCode?.preview_html ||
            `<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0c0c0e;color:#555;text-align:center"><div><p style="font-size:15px;color:#888">No preview yet.</p><p style="font-size:13px;margin-top:8px;color:#555">Generate code to see a live preview here.</p></div></body></html>`
          }
        />
      </div>
    </div>
  )
}
