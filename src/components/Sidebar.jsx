const QUICK_ACTIONS = [
  { label: 'Generate Section', prompt: 'Generate a Shopify Liquid section with schema' },
  { label: 'HTML → Liquid',    prompt: 'Convert this HTML to a Shopify Liquid section' },
  { label: 'Debug Liquid',     prompt: 'Debug this Shopify Liquid error' },
  { label: 'Product Page',     prompt: 'Generate a product page section with all features' },
  { label: 'Collection Page',  prompt: 'Generate a collection page with filtering' },
  { label: 'Optimize Code',    prompt: 'Optimize my Liquid code for performance' },
]

const HISTORY = [
  { group: 'Today', items: ['Hero Section with Metafields', 'Product Card Carousel', 'FAQ Accordion Section'] },
  { group: 'Yesterday', items: ['Mega Menu Navigation', 'Custom Cart Drawer', 'Testimonials with Schema'] },
]

export default function Sidebar({
  collapsed, mobileOpen,
  onToggleCollapse, onCloseMobile,
  onNewChat, onQuickAction, onLoadChat, onToggleTheme,
  user, onLogout, onOpenVFX,
}) {
  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}${mobileOpen ? ' mobile-open' : ''}`}>
      <div className="sidebar-header">
        <div className="logo">
          <div className="logo-mark">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M11 2L13.5 7.5L19.5 8.5L15.25 12.5L16.25 18.5L11 15.75L5.75 18.5L6.75 12.5L2.5 8.5L8.5 7.5L11 2Z"
                fill="#00D084" stroke="#00D084" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="logo-text">LiquidAI</span>
        </div>
        <button className="icon-btn sidebar-toggle" onClick={onToggleCollapse} title="Toggle sidebar">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2" y="3"    width="14" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="2" y="8.25" width="14" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="2" y="13.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
          </svg>
        </button>
      </div>

      <button className="new-chat-btn" onClick={onNewChat}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 3.5V12.5M3.5 8H12.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
        </svg>
        New Chat
      </button>

      <div className="sidebar-search">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <input type="text" placeholder="Search chats..." />
      </div>

      <div className="sidebar-section">
        <div className="sidebar-section-label">Quick Actions</div>
        <div className="quick-actions-list">
          {QUICK_ACTIONS.map(({ label, prompt }) => (
            <button key={label} className="quick-action-item" onClick={() => onQuickAction(prompt)}>
              <span className="qa-icon">⬡</span> {label}
            </button>
          ))}
        </div>
      </div>

      {onOpenVFX && (
        <button className="quick-action-item" onClick={onOpenVFX} style={{ margin:'0 12px 4px', borderRadius:8, background:'var(--accent-dim)', color:'var(--accent)', border:'1px solid var(--accent-glow)' }}>
          <span className="qa-icon" style={{ color:'var(--accent)' }}>▶</span> VFX Library Browse
        </button>
      )}

      <div className="sidebar-section" style={{ flex: 1, minHeight: 0 }}>
        <div className="sidebar-section-label">Chat History</div>
        <div className="chat-history">
          {HISTORY.map(({ group, items }) => (
            <div key={group}>
              <div className="history-group-label">{group}</div>
              {items.map((title, i) => (
                <button
                  key={title}
                  className={`history-item${i === 0 && group === 'Today' ? ' active' : ''}`}
                  onClick={() => onLoadChat(title)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 2.5h10M2 5.5h10M2 8.5h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <span>{title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="sidebar-footer">
        <div className="upgrade-card">
          <div className="upgrade-badge">PRO</div>
          <p className="upgrade-title">Unlock unlimited generations</p>
          <button className="upgrade-btn">Upgrade Plan</button>
        </div>
        <div className="user-profile">
          <div className="user-avatar">{initials}</div>
          <div className="user-info">
            <span className="user-name">{user?.name || 'User'}</span>
            <span className="user-email">{user?.email || ''}</span>
          </div>
          <button className="icon-btn" onClick={onToggleTheme} title="Toggle theme">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
          {onLogout && (
            <button className="icon-btn topbar-logout" onClick={onLogout} title="Sign out">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M6 14H3a1 1 0 01-1-1V3a1 1 0 011-1h3M10.5 11.5L14 8l-3.5-3.5M5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
