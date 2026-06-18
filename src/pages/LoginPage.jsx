import { useState } from 'react'
import { authLogin } from '../utils/api'

export default function LoginPage({ onLogin, onGoRegister }) {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPw, setShowPw]     = useState(false)

  const validate = () => {
    if (!email.trim())    return 'Email is required.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Enter a valid email address.'
    if (!password)        return 'Password is required.'
    return null
  }

  const handleSubmit = async e => {
    e.preventDefault()
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setLoading(true)
    try {
      const data = await authLogin({ email: email.trim().toLowerCase(), password })
      localStorage.setItem('liquidai_token', data.token)
      localStorage.setItem('liquidai_user', JSON.stringify(data.user))
      onLogin(data.user)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

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

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your account to continue</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label className="auth-label" htmlFor="login-email">Email address</label>
            <input
              id="login-email"
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
            <label className="auth-label" htmlFor="login-pw">Password</label>
            <div className="auth-input-wrap">
              <input
                id="login-pw"
                className="auth-input"
                type={showPw ? 'text' : 'password'}
                placeholder="Your password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError('') }}
                autoComplete="current-password"
                disabled={loading}
              />
              <button type="button" className="auth-pw-toggle" onClick={() => setShowPw(v => !v)} tabIndex={-1}>
                {showPw
                  ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2L14 14M6.5 6.6A1.5 1.5 0 009.4 9.5M1.5 8s2-4.5 6.5-4.5M14.5 8s-2 4.5-6.5 4.5c-1.1 0-2-.2-2.8-.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  : <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1.5 8s2-4.5 6.5-4.5S14.5 8 14.5 8s-2 4.5-6.5 4.5S1.5 8 1.5 8z" stroke="currentColor" strokeWidth="1.4"/><circle cx="8" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.4"/></svg>
                }
              </button>
            </div>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-btn" type="submit" disabled={loading}>
            {loading
              ? <span className="auth-spinner" />
              : 'Sign In'
            }
          </button>
        </form>

        <p className="auth-switch">
          Don't have an account?{' '}
          <button className="auth-link" onClick={onGoRegister}>Create one</button>
        </p>
      </div>
    </div>
  )
}
