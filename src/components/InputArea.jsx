import { useState, useRef, useEffect, useCallback } from 'react'
import { getFileIcon } from '../utils/helpers'

const FORMAT_OPTIONS = [
  { value: 'html',     label: 'HTML + CSS' },
  { value: 'html-js',  label: 'HTML + CSS + JS' },
  { value: 'shopify',  label: 'Shopify Liquid' },
  { value: 'react',    label: 'React Component' },
  { value: 'vue',      label: 'Vue Component' },
]

function FileChip({ file, onRemove }) {
  const [imgSrc, setImgSrc] = useState(null)

  useEffect(() => {
    if (file.type?.startsWith('image/')) {
      const url = URL.createObjectURL(file)
      setImgSrc(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [file])

  return (
    <div className="file-preview-chip">
      {imgSrc
        ? <img src={imgSrc} className="chip-img" alt={file.name} />
        : <span dangerouslySetInnerHTML={{ __html: getFileIcon(file.name) }} />
      }
      <span className="chip-name">{file.name}</span>
      <button className="chip-remove" onClick={() => onRemove(file.name)}>×</button>
    </div>
  )
}

export default function InputArea({
  attachedFiles, pendingImageFile,
  isFigmaMode, isCodeMode, isLoading,
  outputFormat, onFormatChange,
  onSend, onAddFile, onRemoveFile,
  onToggleFigma, onToggleCode,
  onOpenAnalysis, onShowToast,
}) {
  const [text, setText]           = useState('')
  const [figmaUrl, setFigmaUrl]   = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const textareaRef = useRef(null)
  const fileInputRef = useRef(null)

  const autoResize = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [])

  useEffect(() => { autoResize() }, [text, autoResize])

  const handleSend = useCallback(() => {
    if (isLoading) return
    if (!text.trim() && attachedFiles.length === 0) return
    onSend(text.trim(), [...attachedFiles], outputFormat)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }, [text, attachedFiles, isLoading, outputFormat, onSend])

  const handleKeyDown = useCallback(e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend])

  const handleFiles = useCallback(files => {
    Array.from(files).forEach(onAddFile)
  }, [onAddFile])

  const handleDragOver  = e => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = e => { if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false) }
  const handleDrop      = e => { e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files) }

  const attachFigma = () => {
    if (!figmaUrl.trim()) return
    if (!figmaUrl.includes('figma.com')) { onShowToast('Please enter a valid Figma URL'); return }
    onAddFile({ name: 'figma-design.fig', type: 'figma', url: figmaUrl })
    setFigmaUrl('')
    onToggleFigma()
    onShowToast('Figma link attached')
  }

  const hasImage = !!pendingImageFile
  const fmtLabel = FORMAT_OPTIONS.find(o => o.value === outputFormat)?.label || 'HTML + CSS'

  return (
    <div
      className="input-area"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* File previews */}
      {attachedFiles.length > 0 && (
        <div className="file-previews">
          {attachedFiles.map(f => (
            <FileChip key={f.name} file={f} onRemove={onRemoveFile} />
          ))}
        </div>
      )}

      {/* Drag overlay */}
      <div className={`drag-overlay${isDragging ? ' active' : ''}`}>
        <div className="drag-content">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <path d="M16 20V8M10 14L16 8L22 14M6 24h20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Drop files here</span>
        </div>
      </div>

      {/* Format selector */}
      <div className="format-selector-bar">
        <span className="format-label">Output format:</span>
        <div className="format-tabs">
          {FORMAT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              className={`format-tab${outputFormat === opt.value ? ' active' : ''}`}
              onClick={() => onFormatChange(opt.value)}
              title={opt.label}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main input box */}
      <div className="input-box">
        <textarea
          ref={textareaRef}
          className="chat-input"
          placeholder={isCodeMode
            ? 'Paste your HTML / CSS / Liquid code here...'
            : `Describe what to build — output will be ${fmtLabel}…`}
          rows={1}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="input-toolbar">
          <div className="input-tools-left">
            {/* Attach */}
            <button className="tool-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
              <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                <path d="M14.5 8L8.5 14C7.12 15.38 4.88 15.38 3.5 14C2.12 12.62 2.12 10.38 3.5 9L9.5 3C10.33 2.17 11.67 2.17 12.5 3C13.33 3.83 13.33 5.17 12.5 6L6.5 12C6.08 12.42 5.42 12.42 5 12C4.58 11.58 4.58 10.92 5 10.5L10.5 5"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".liquid,.html,.css,.js,.json,.png,.jpg,.jpeg,.webp,.gif"
              style={{ display: 'none' }}
              onChange={e => { handleFiles(e.target.files); e.target.value = '' }}
            />

            {/* Figma */}
            <button
              className={`tool-btn tool-btn-text${isFigmaMode ? ' active' : ''}`}
              onClick={onToggleFigma}
              title="Paste Figma link"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="2" y="2" width="4" height="4" rx="1" fill="currentColor" opacity="0.6"/>
                <rect x="8" y="2" width="4" height="4" rx="2" fill="currentColor" opacity="0.8"/>
                <rect x="2" y="8" width="4" height="4" rx="2" fill="currentColor" opacity="0.6"/>
                <circle cx="10" cy="10" r="2" fill="currentColor"/>
              </svg>
              Figma
            </button>

            {/* Analyze image */}
            {hasImage && (
              <button className="analyze-image-trigger visible" onClick={onOpenAnalysis}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1.5L8.75 5.5L13 6.25L10 9.25L10.5 13.5L7 11.5L3.5 13.5L4 9.25L1 6.25L5.25 5.5L7 1.5Z" fill="currentColor"/>
                </svg>
                Analyze Design
              </button>
            )}

            {/* Code mode */}
            <button
              className={`tool-btn tool-btn-text${isCodeMode ? ' active' : ''}`}
              onClick={onToggleCode}
              title="Code mode"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M4 4L1 7L4 10M10 4L13 7L10 10M7 2L7.5 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Code
            </button>
          </div>

          <div className="input-tools-right">
            <span className="char-count">{text.length > 50 ? text.length : ''}</span>
            <button
              className="send-btn"
              onClick={handleSend}
              disabled={isLoading || (!text.trim() && attachedFiles.length === 0)}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 3L8 13M4 7L8 3L12 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Figma panel */}
      {isFigmaMode && (
        <div className="figma-panel">
          <div className="figma-input-wrap">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M6 2H4a2 2 0 000 4h2M6 2v4M6 2h2a2 2 0 010 4H6M10 6a2 2 0 012 2 2 2 0 01-2 2M6 10H4a2 2 0 000 4h2v-4zm0 0h2a2 2 0 010 4H6"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              className="figma-url-input"
              placeholder="Paste Figma URL (figma.com/file/...)"
              value={figmaUrl}
              onChange={e => setFigmaUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && attachFigma()}
            />
            <button className="figma-attach-btn" onClick={attachFigma}>Attach</button>
          </div>
        </div>
      )}

      <p className="input-disclaimer">
        Review generated code before deploying to production.
      </p>
    </div>
  )
}
