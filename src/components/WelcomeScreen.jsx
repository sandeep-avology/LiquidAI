const CAPABILITIES = [
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M6 9h8M6 12h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    title: 'Generate Section',
    desc:  'Hero, product, collection sections with schema',
    prompt: 'Generate a hero banner Shopify section with image, heading, subheading, button, and full schema settings',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 6L2 10L4 14M16 6L18 10L16 14M8 4L12 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    title: 'HTML → Liquid',
    desc:  'Convert static HTML to dynamic Shopify sections',
    prompt: 'Convert this HTML layout to a Shopify Liquid section with proper schema and settings',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 6h14M3 10h14M3 14h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="15" cy="14" r="2.5" stroke="currentColor" strokeWidth="1.5"/></svg>,
    title: 'Create Schema',
    desc:  'Generate complete section schemas with all settings',
    prompt: 'Generate a complete Shopify section schema with all common setting types',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="10" cy="11" r="7" stroke="currentColor" strokeWidth="1.5"/></svg>,
    title: 'Debug Errors',
    desc:  'Identify and fix Liquid template errors',
    prompt: 'Debug and fix Liquid template errors with explanations',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="2" y="5" width="16" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M7 9l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    title: 'Responsive CSS',
    desc:  'Mobile-first CSS for Shopify themes',
    prompt: 'Generate responsive CSS for a Shopify theme with mobile-first approach',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3L12.5 8.5L18 9.5L14 13.5L15 19L10 16.25L5 19L6 13.5L2 9.5L7.5 8.5L10 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/></svg>,
    title: 'Optimize Code',
    desc:  'Improve Liquid performance and best practices',
    prompt: 'Optimize my Shopify Liquid code for better performance and faster load times',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M10 6v1.5M8.5 8C8.5 7.17 9.17 6.5 10 6.5s1.5.67 1.5 1.5c0 1-1.5 1.5-1.5 2.5M10 14v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    title: 'FAQ Section',
    desc:  'Interactive FAQ accordion with Liquid logic',
    prompt: 'Generate an FAQ section for Shopify with accordion functionality and schema',
  },
  {
    icon: <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/><path d="M10 7v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    title: 'Theme Settings',
    desc:  'Customize colors, typography, and layout settings',
    prompt: 'Generate theme customization settings for Shopify with color schemes, typography, and layout options',
  },
]

export default function WelcomeScreen({ onQuickAction }) {
  return (
    <div className="welcome-screen">
      <div className="welcome-hero">
        <div className="welcome-logo-big">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <path d="M24 4L29.5 16.5L43 18.5L33.5 27.5L36 41L24 34.5L12 41L14.5 27.5L5 18.5L18.5 16.5L24 4Z"
              fill="#00D084" stroke="#00D084" strokeWidth="2" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="welcome-title">What can I build for you?</h1>
        <p className="welcome-subtitle">
          Your AI-powered Shopify development partner. Generate Liquid sections, debug errors, convert HTML, and more.
        </p>
      </div>

      <div className="capability-grid">
        {CAPABILITIES.map(({ icon, title, desc, prompt }) => (
          <button key={title} className="capability-card" onClick={() => onQuickAction(prompt)}>
            <div className="cap-icon">{icon}</div>
            <div className="cap-content">
              <span className="cap-title">{title}</span>
              <span className="cap-desc">{desc}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="upload-hint">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 9.5V2M4.5 4.5L7 2L9.5 4.5M2.5 11.5h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Upload screenshots, Liquid files, or HTML — I'll analyze and help you build
      </div>
    </div>
  )
}
