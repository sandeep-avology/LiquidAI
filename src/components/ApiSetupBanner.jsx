import { useState } from 'react'
import { saveApiKey, cleanApiKeyInput } from '../utils/api'

export default function ApiSetupBanner({
  serverReachable,
  apiKeyConfigured,
  apiKeyStatus,
  quotaExhausted,
  quotaResetsAt,
  onDismiss,
  onKeySaved,
}) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  // Quota-exhausted banner (key is fine, but free-tier limit reached)
  if (apiKeyConfigured && quotaExhausted) {
    const resetTime = quotaResetsAt
      ? new Date(quotaResetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null
    return (
      <div className="api-setup-banner api-setup-banner--quota" role="alert">
        <div className="api-setup-banner__content">
          <strong>⚡ AI quota reached — running in local mode</strong>
          <p>
            Gemini free-tier daily quota is exhausted.
            {resetTime ? ` Auto-retry resumes at ${resetTime}.` : ''}
            {' '}Text generation uses built-in templates; screenshot-to-code is paused until quota resets.
          </p>
          <p style={{ marginTop: '0.5rem', fontSize: '0.82rem', opacity: 0.8 }}>
            To restore AI now: add a second free Gemini key as <code>GEMINI_API_KEY_2=…</code> in your <code>.env</code> (from a different Google account) then restart the server.
          </p>
        </div>
        <button type="button" className="api-setup-banner__close" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    )
  }

  // No key configured — show setup form
  if (apiKeyConfigured) return null

  const isPlaceholder = apiKeyStatus === 'placeholder'

  const handleSave = async e => {
    e.preventDefault()
    const cleaned = cleanApiKeyInput(apiKey)
    if (!cleaned) {
      setError('Paste your Gemini API key first.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await saveApiKey(cleaned)
      setApiKey('')
      onKeySaved?.()
    } catch (err) {
      setError(err.message || 'Could not save API key.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="api-setup-banner" role="alert">
      <div className="api-setup-banner__content">
        <strong>
          {isPlaceholder
            ? '⚠ Replace the placeholder API key to enable AI Vision'
            : '⚠ Setup required — Add a Gemini API key to enable screenshot → code'}
        </strong>
        {!serverReachable ? (
          <p>
            The API server is not running. Run <code>npm run dev</code> in the project folder.
          </p>
        ) : isPlaceholder ? (
          <p>
            Your <code>.env</code> still has the placeholder. Paste your real Gemini key below or edit <code>.env</code> manually.
          </p>
        ) : (
          <p>Add a Google Gemini API key (free) to analyze screenshots and generate pixel-perfect matching code:</p>
        )}
        {serverReachable && (
          <>
            <form className="api-setup-form" onSubmit={handleSave}>
              <input
                type="text"
                className="api-setup-input"
                placeholder="Paste your Gemini key here (AIzaSy… or AQ.…)"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                onPaste={e => {
                  const pasted = e.clipboardData.getData('text')
                  if (pasted.includes('GEMINI_API_KEY') || pasted.includes('XAI_API_KEY') || pasted.includes('ANTHROPIC_API_KEY')) {
                    e.preventDefault()
                    setApiKey(cleanApiKeyInput(pasted))
                  }
                }}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="api-setup-save" disabled={saving}>
                {saving ? 'Saving…' : 'Save Key'}
              </button>
            </form>
            {error && <p className="api-setup-error">{error}</p>}
            <ol className="api-setup-steps">
              <li>Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a></li>
              <li>Paste it above and click <strong>Save Key</strong> — no restart needed</li>
            </ol>
          </>
        )}
      </div>
      <button type="button" className="api-setup-banner__close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
