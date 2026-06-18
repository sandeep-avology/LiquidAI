export default function TopBar({ title, codePanelOpen, onToggleCodePanel, onMobileMenu, user, onLogout }) {
  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <header className="topbar">
      <button className="icon-btn mobile-menu-btn" onClick={onMobileMenu} aria-label="Open menu">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="2" y="3"    width="14" height="1.5" rx="0.75" fill="currentColor"/>
          <rect x="2" y="8.25" width="14" height="1.5" rx="0.75" fill="currentColor"/>
          <rect x="2" y="13.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
        </svg>
      </button>

      <div className="topbar-center">
        <span className="topbar-title">{title}</span>
      </div>

      <div className="topbar-actions">
        <div className="model-selector">
          <div className="model-dot" />
          <span>Code Generator</span>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>

        <button className="icon-btn" onClick={onToggleCodePanel} title={codePanelOpen ? 'Hide code panel' : 'Show code panel'}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M6 5L2 9L6 13M12 5L16 9L12 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {user && (
          <div className="topbar-user" title={user.email}>
            <div className="topbar-avatar">{initials}</div>
            <button className="icon-btn topbar-logout" onClick={onLogout} title="Sign out">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M10.5 11.5L14 8l-3.5-3.5M5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
