import { useState } from 'react'
import { authRegister } from '../utils/api'

export default function RegisterPage({ onLogin, onGoLogin }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPw, setShowPw]     = useState(false)

  const validate = () => {
    if (!name.trim())    return 'Full name is required.'
    if (name.trim().length < 2) return 'Name must be at least 2 characters.'
    if (!email.trim())   return 'Email is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.'
    if (!password)       return 'Password is required.'
    if (password.length < 6) return 'Password must be at least 6 characters.'
    if (password !== confirm)  return 'Passwords do not match.'
    return null
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setLoading(true)
    try {
      const data = await authRegister({ name: name.trim(), email: email.trim().toLowerCase(), password })
      localStorage.setItem('liquidai_token', data.token)
      localStorage.setItem('liquidai_user', JSON.stringify(data.user))
      onLogin(data.user)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const pwStrength = password.length === 0 ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3
  const pwColors   = ['', '#ef4444', '#f59e0b', '#00D084']
  const pwLabels   = ['', 'Weak', 'Fair', 'Strong']

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="auth-logo-mark">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2L13.5 8L20 9L15.5 13.5L16.5 20L11 17L5.5 20L6.5 13.5L2 9L8.5 8L11 2Z"
                fill="#00D084" stroke="#00D084" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="auth-logo-text">LiquidAI</span>
        </div>

        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">Start generating production-ready code instantly</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-name">Full name</label>
            <input
              id="reg-name"
              className="auth-input"
              type="text"
              placeholder="Jane Smith"
              value={name}
              onChange={e => { setName(e.target.value); setError('') }}
              autoComplete="name"
              disabled={loading}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-email">Email address</label>
            <input
              id="reg-email"
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-pw">Password</label>
            <div className="auth-input-wrap">
              <input
                id="reg-pw"
                className="auth-input"
                type={showPw ? 'text' : 'password'}
                placeholder="At least 6 characters"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                autoComplete="new-password"
                disabled={loading}
              />
              <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                {showPw
                  ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2L14 14M6.5 6.6A1.5 1.5 0 019.4 9.5M1.5 8s2-4.5 6.5-4.5M14.5 8s-2 4.5-6.5 4.5c-1.1 0-2-.2-2.8-.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.5 8s2-4.5 6.5-4.5S14.5 8 14.5 8s-2 4.5-6.5 4.5S1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.4"/><circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.4"/></svg>
                }
              </button>
            </div>
            {password.length > 0 && (
              <div className="auth-pw-strength">
                <div className="auth-pw-bars">
                  {[1,2,3].map(n => (
                    <div key={n} className="auth-pw-bar" style={{ background: n <= pwStrength ? pwColors[pwStrength] : 'var(--border-mid)' }} />
                  ))}
                </div>
                <span style={{ color: pwColors[pwStrength], fontSize: 11 }}>{pwLabels[pwStrength]}</span>
              </div>
            )}
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="reg-confirm">Confirm password</label>
            <input
              id="reg-confirm"
              className="auth-input"
              type={showPw ? 'text' : 'password'}
              placeholder="Re-enter your password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); setError('') }}
              autoComplete="new-password"
              disabled={loading}
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? <span className="auth-spinner" /> : 'Create Account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <button className="auth-link" onClick={onGoLogin}>Sign in</button>
        </p>
      </div>
    </div>
  )
}
