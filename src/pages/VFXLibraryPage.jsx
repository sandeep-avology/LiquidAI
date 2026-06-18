import { useState } from 'react'
import './VFXLibraryPage.css'

const CATEGORIES = ['All', 'Transitions', 'Screen FX', 'Overlays', 'VFX Library Browse', 'Film & Grain']

const VFX_ITEMS = [
  {
    id: 1,
    title: 'Circuit Breaker',
    category: 'Transitions',
    gradient: 'linear-gradient(135deg, #0a1a0a 0%, #0d2a0d 40%, #003300 100%)',
    overlay: 'radial-gradient(ellipse 80% 40% at 50% 60%, rgba(0,230,80,0.18) 0%, transparent 70%)',
    svgAccent: 'waveform',
  },
  {
    id: 2,
    title: 'Shadow Protocol',
    category: 'Transitions',
    gradient: 'linear-gradient(160deg, #080c10 0%, #0c1520 50%, #0a1018 100%)',
    overlay: 'radial-gradient(ellipse 100% 60% at 30% 70%, rgba(20,60,100,0.4) 0%, transparent 60%)',
    svgAccent: 'mountain',
  },
  {
    id: 3,
    title: 'Nebula Drift',
    category: 'Atmospheric',
    gradient: 'linear-gradient(135deg, #08080f 0%, #0e0a1a 50%, #100815 100%)',
    overlay: 'radial-gradient(ellipse 90% 70% at 60% 40%, rgba(80,20,120,0.35) 0%, transparent 65%)',
    svgAccent: 'mic',
  },
  {
    id: 4,
    title: 'World Reveal',
    category: 'Transitions',
    gradient: 'linear-gradient(170deg, #060a0e 0%, #0a1220 60%, #0d1828 100%)',
    overlay: 'radial-gradient(ellipse 110% 50% at 50% 80%, rgba(15,40,80,0.5) 0%, transparent 55%)',
    svgAccent: 'terrain',
  },
  {
    id: 5,
    title: 'Human Story',
    category: 'Transitions',
    gradient: 'linear-gradient(155deg, #0a0808 0%, #180e0a 50%, #100a06 100%)',
    overlay: 'radial-gradient(ellipse 70% 80% at 55% 35%, rgba(80,40,20,0.3) 0%, transparent 60%)',
    svgAccent: 'portrait',
  },
  {
    id: 6,
    title: 'Epic Action',
    category: 'Action',
    gradient: 'linear-gradient(145deg, #0a0a0a 0%, #14100a 50%, #1a1008 100%)',
    overlay: 'radial-gradient(ellipse 100% 60% at 40% 60%, rgba(80,50,10,0.35) 0%, transparent 60%)',
    svgAccent: 'explosion',
  },
]

function CardSvgAccent({ type }) {
  if (type === 'waveform') return (
    <svg width="100%" height="100%" viewBox="0 0 200 80" preserveAspectRatio="none" style={{ position:'absolute', inset:0, opacity:0.7 }}>
      {[30,50,65,45,70,55,40,60,35,50,45,65,38,55,48].map((h, i) => (
        <rect key={i} x={8 + i * 13} y={(80 - h) / 2} width="7" height={h} rx="3" fill="#00e050" fillOpacity="0.7" />
      ))}
    </svg>
  )
  if (type === 'mountain') return (
    <svg width="100%" height="100%" viewBox="0 0 200 120" preserveAspectRatio="none" style={{ position:'absolute', inset:0, opacity:0.5 }}>
      <path d="M0 120 L60 30 L110 80 L150 20 L200 120 Z" fill="rgba(30,60,100,0.6)" />
      <path d="M0 120 L80 50 L130 90 L200 120 Z" fill="rgba(15,35,70,0.7)" />
      <path d="M0 100 Q50 60 100 80 Q150 100 200 60 L200 120 L0 120 Z" fill="rgba(10,20,40,0.5)" />
    </svg>
  )
  if (type === 'mic') return (
    <svg width="100%" height="100%" viewBox="0 0 200 150" preserveAspectRatio="xMidYMid meet" style={{ position:'absolute', inset:0, opacity:0.45 }}>
      <ellipse cx="160" cy="60" rx="18" ry="30" fill="rgba(160,100,200,0.3)" stroke="rgba(160,100,200,0.5)" strokeWidth="2" />
      <rect x="154" y="30" width="12" height="40" rx="6" fill="rgba(200,150,230,0.4)" />
      <line x1="160" y1="90" x2="160" y2="115" stroke="rgba(160,100,200,0.5)" strokeWidth="2" />
      <line x1="145" y1="115" x2="175" y2="115" stroke="rgba(160,100,200,0.5)" strokeWidth="2" />
      <path d="M140 60 Q160 80 180 60" fill="none" stroke="rgba(160,100,200,0.4)" strokeWidth="1.5" />
    </svg>
  )
  if (type === 'terrain') return (
    <svg width="100%" height="100%" viewBox="0 0 200 120" preserveAspectRatio="none" style={{ position:'absolute', inset:0, opacity:0.5 }}>
      <path d="M0 120 L30 55 L70 85 L100 30 L140 65 L170 40 L200 70 L200 120 Z" fill="rgba(20,50,90,0.6)" />
      <path d="M0 120 L50 80 L90 60 L130 90 L200 50 L200 120 Z" fill="rgba(10,30,60,0.7)" />
      <circle cx="100" cy="25" r="18" fill="rgba(255,220,100,0.15)" />
      <circle cx="100" cy="25" r="10" fill="rgba(255,220,100,0.2)" />
    </svg>
  )
  if (type === 'portrait') return (
    <svg width="100%" height="100%" viewBox="0 0 200 150" preserveAspectRatio="xMidYMid meet" style={{ position:'absolute', inset:0, opacity:0.4 }}>
      <ellipse cx="100" cy="55" rx="30" ry="38" fill="rgba(150,90,60,0.35)" />
      <path d="M60 150 Q80 100 100 95 Q120 100 140 150 Z" fill="rgba(100,60,40,0.3)" />
      <ellipse cx="100" cy="42" rx="18" ry="22" fill="rgba(180,120,80,0.3)" />
    </svg>
  )
  return (
    <svg width="100%" height="100%" viewBox="0 0 200 120" preserveAspectRatio="none" style={{ position:'absolute', inset:0, opacity:0.45 }}>
      <circle cx="90" cy="65" r="35" fill="rgba(180,100,20,0.2)" />
      {[0,1,2,3,4,5,6,7].map(i => (
        <line key={i} x1="90" y1="65"
          x2={90 + Math.cos(i * Math.PI / 4) * 55}
          y2={65 + Math.sin(i * Math.PI / 4) * 45}
          stroke="rgba(220,140,30,0.25)" strokeWidth="2" />
      ))}
      <circle cx="90" cy="65" r="12" fill="rgba(220,160,50,0.4)" />
    </svg>
  )
}

export default function VFXLibraryPage({ onBack }) {
  const [activeCategory, setActiveCategory] = useState('All')
  const [bookmarked, setBookmarked] = useState(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const filtered = activeCategory === 'All'
    ? VFX_ITEMS
    : VFX_ITEMS.filter(item => item.category === activeCategory)

  const toggleBookmark = (id) => {
    setBookmarked(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="vfx-shell">
      {/* Mobile header */}
      <header className="vfx-mobile-header">
        <button className="vfx-menu-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <span className="vfx-mobile-title">VFX Library</span>
        {onBack && (
          <button className="vfx-back-btn" onClick={onBack} aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M11 4L6 9l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </header>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div className="vfx-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`vfx-sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="vfx-sidebar-inner">
          {onBack && (
            <button className="vfx-back-desktop" onClick={onBack}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
          )}
          <p className="vfx-cat-label">CATEGORY</p>
          <nav className="vfx-cat-nav">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`vfx-cat-item${activeCategory === cat ? ' active' : ''}`}
                onClick={() => { setActiveCategory(cat); setSidebarOpen(false) }}
              >
                {cat}
              </button>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main content */}
      <main className="vfx-main">
        <div className="vfx-content">
          <h1 className="vfx-heading">VFX Library Browse</h1>

          {filtered.length === 0 ? (
            <div className="vfx-empty">
              <span>No items in this category yet.</span>
            </div>
          ) : (
            <div className="vfx-grid">
              {filtered.map(item => (
                <article key={item.id} className="vfx-card">
                  <div className="vfx-card-thumb" style={{ background: item.gradient }}>
                    <div className="vfx-card-overlay" style={{ background: item.overlay }} />
                    <CardSvgAccent type={item.svgAccent} />
                    <button
                      className={`vfx-bookmark${bookmarked.has(item.id) ? ' saved' : ''}`}
                      onClick={() => toggleBookmark(item.id)}
                      aria-label={bookmarked.has(item.id) ? 'Remove bookmark' : 'Bookmark'}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 2h8a1 1 0 0 1 1 1v9l-5-3-5 3V3a1 1 0 0 1 1-1Z"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinejoin="round"
                          fill={bookmarked.has(item.id) ? 'currentColor' : 'none'}
                        />
                      </svg>
                    </button>
                  </div>
                  <div className="vfx-card-info">
                    <span className="vfx-card-title">{item.title}</span>
                    <span className="vfx-card-cat">{item.category}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
