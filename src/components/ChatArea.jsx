import { useEffect, useRef } from 'react'
import WelcomeScreen from './WelcomeScreen'
import { getFileIcon } from '../utils/helpers'

function UserMessage({ text, files }) {
  return (
    <div className="message user">
      <div className="msg-bubble">
        {files?.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            {files.map(f => (
              <div key={f.name} className="msg-file-chip">
                <span dangerouslySetInnerHTML={{ __html: getFileIcon(f.name) }} />
                <span>{f.name}</span>
              </div>
            ))}
          </div>
        )}
        {text && text.split('\n').map((line, i, arr) => (
          <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
        ))}
      </div>
    </div>
  )
}

function AssistantMessage({ text, code, onOpenCodePanel, onCopy, onDownload }) {
  const preRef = useRef(null)

  useEffect(() => {
    if (preRef.current && code?.liquid) {
      preRef.current.textContent = code.liquid
    }
  }, [code])

  return (
    <div className="message assistant">
      <div className="msg-avatar">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.5L8.75 5.5L13 6.25L10 9.25L10.5 13.5L7 11.5L3.5 13.5L4 9.25L1 6.25L5.25 5.5L7 1.5Z" fill="#00D084"/>
        </svg>
      </div>
      <div className="msg-body">
        <div className="msg-name">LiquidAI</div>
        <div className="msg-text" dangerouslySetInnerHTML={{ __html: text }} />

        {code?.liquid && (
          <div className="msg-code-block">
            <div className="msg-code-header">
              <span className="msg-code-lang">.liquid</span>
              <div className="msg-code-actions">
                <button className="msg-code-btn" onClick={onOpenCodePanel}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Open in panel
                </button>
                <button className="msg-code-btn" onClick={onCopy}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                    <path d="M4 4V2.5A1.5 1.5 0 012.5 1H1.5A1.5 1.5 0 000 2.5V8A1.5 1.5 0 001.5 9.5H3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                  </svg>
                  Copy
                </button>
              </div>
            </div>
            <div className="msg-code-body">
              <pre ref={preRef} />
            </div>
          </div>
        )}

        <div className="msg-actions">
          <button className="msg-action-btn" onClick={() => {
            const raw = text.replace(/<[^>]*>/g, '')
            navigator.clipboard.writeText(raw)
          }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <path d="M4 4V3a1 1 0 00-1-1H3a1 1 0 00-1 1v5a1 1 0 001 1h1" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
            Copy response
          </button>
          {code && (
            <button className="msg-action-btn" onClick={onDownload}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v6M3.5 6L6 8.5 8.5 6M2 10h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              Download .liquid
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function TypingIndicator({ status }) {
  return (
    <div className="message assistant">
      <div className="msg-avatar">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.5L8.75 5.5L13 6.25L10 9.25L10.5 13.5L7 11.5L3.5 13.5L4 9.25L1 6.25L5.25 5.5L7 1.5Z" fill="#00D084"/>
        </svg>
      </div>
      <div className="msg-body">
        <div className="msg-name">LiquidAI</div>
        <div className="typing-indicator">
          <div className="typing-dots">
            <span /><span /><span />
          </div>
          {status && <span className="typing-status">{status}</span>}
        </div>
      </div>
    </div>
  )
}

export default function ChatArea({
  chatActive, messages, isLoading, loadingStatus,
  currentCode, onQuickAction, onShowToast, onOpenCodePanel, onDownload,
}) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  if (!chatActive) {
    return <WelcomeScreen onQuickAction={onQuickAction} />
  }

  return (
    <div className="messages-container">
      <div className="messages">
        {messages.map(msg => {
          if (msg.role === 'user') {
            return <UserMessage key={msg.id} text={msg.text} files={msg.files} />
          }
          return (
            <AssistantMessage
              key={msg.id}
              text={msg.text}
              code={msg.code}
              onOpenCodePanel={onOpenCodePanel}
              onCopy={() => {
                navigator.clipboard.writeText(currentCode.liquid || '')
                onShowToast('Copied!')
              }}
              onDownload={onDownload}
            />
          )
        })}
        {isLoading && <TypingIndicator status={loadingStatus} />}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
