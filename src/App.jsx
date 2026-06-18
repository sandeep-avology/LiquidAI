import { useState, useEffect } from 'react'
import LoginPage      from './pages/LoginPage'
import RegisterPage   from './pages/RegisterPage'
import MainApp        from './pages/MainApp'
import VFXLibraryPage from './pages/VFXLibraryPage'
import { authMe }     from './utils/api'

export default function App() {
  const [user, setUser]         = useState(null)
  const [authPage, setAuthPage] = useState('login')
  const [checking, setChecking] = useState(true)
  const [page, setPage]         = useState('main')

  useEffect(() => {
    const token      = localStorage.getItem('liquidai_token')
    const cachedUser = localStorage.getItem('liquidai_user')
    if (!token) { setChecking(false); return }
    if (cachedUser) { try { setUser(JSON.parse(cachedUser)) } catch {} }
    authMe()
      .then(data => {
        setUser(data.user)
        localStorage.setItem('liquidai_user', JSON.stringify(data.user))
      })
      .catch(() => {
        localStorage.removeItem('liquidai_token')
        localStorage.removeItem('liquidai_user')
        setUser(null)
      })
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <div className="auth-page">
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16, color:'var(--text-secondary)' }}>
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" style={{ animation:'spin 0.9s linear infinite', transformOrigin:'center' }}>
            <circle cx="18" cy="18" r="14" stroke="rgba(0,208,132,0.15)" strokeWidth="3"/>
            <path d="M18 4a14 14 0 0 1 14 14" stroke="#00D084" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize:13 }}>Loading…</span>
        </div>
      </div>
    )
  }

  if (!user) {
    return authPage === 'login'
      ? <LoginPage    onLogin={setUser} onGoRegister={() => setAuthPage('register')} />
      : <RegisterPage onLogin={setUser} onGoLogin={()   => setAuthPage('login')}    />
  }

  if (page === 'vfx') return <VFXLibraryPage onBack={() => setPage('main')} />

  return <MainApp user={user} onLogout={() => { setUser(null); setAuthPage('login') }} onOpenVFX={() => setPage('vfx')} />
}
