'use strict';
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const crypto  = require('crypto');
const fs      = require('fs');
const { loadEnvFiles, logStartup, saveApiKey, getVisionStatus, isApiKeyConfigured } = require('./lib/env');
const { hasVisionKey, claudeVision, visionErrorMessage, parseDelimitedResponse } = require('./lib/vision');
const { claudeChat } = require('./lib/chat');
const { startApp } = require('./lib/port');

const loadedEnvFiles = loadEnvFiles();

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

/* ══════════════════════════════════════════════════
   AUTH SYSTEM  (file-based, no external DB)
══════════════════════════════════════════════════ */
const USERS_FILE = path.join(__dirname, '.users.json');
const sessions   = new Map();                          // token → user object

function loadUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch { return []; }
}
function saveUsers(list) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2));
}
function hashPw(pw) {
  return crypto.createHash('sha256').update(pw + ':liquidai-2024').digest('hex');
}
function makeToken() { return crypto.randomBytes(32).toString('hex'); }

function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  if (!token || !sessions.has(token)) return res.status(401).json({ error: 'Unauthorised' });
  req.user = sessions.get(token);
  next();
}

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  const users = loadUsers();
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
    return res.status(409).json({ error: 'That email is already registered.' });
  const user = { id: Date.now().toString(), name: name.trim(), email: email.toLowerCase(), password: hashPw(password), createdAt: new Date().toISOString() };
  users.push(user);
  saveUsers(users);
  const token = makeToken();
  sessions.set(token, { id: user.id, name: user.name, email: user.email });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  const user = loadUsers().find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === hashPw(password));
  if (!user) return res.status(401).json({ error: 'Incorrect email or password.' });
  const token = makeToken();
  sessions.set(token, { id: user.id, name: user.name, email: user.email });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

/* ══════════════════════════════════════════════════
   LOCAL CODE GENERATOR
══════════════════════════════════════════════════ */
const sleep = ms => new Promise(r => setTimeout(r, ms));

function detectType(text) {
  const t = (text || '').toLowerCase();
  // High-specificity checks first to avoid false matches (e.g. "shop" inside "shopify")
  if (/\bfaq\b|accordion|\bquestion\b|\banswer\b|\bhelp\b|\bsupport\b/.test(t)) return 'faq';
  if (/\bnewsletter\b|\bsubscribe\b|\bmailing\b|\bjoin\b/.test(t)) return 'newsletter';
  if (/\btestimonial\b|\breview\b|\bquote\b|\bcustomer\b|\bfeedback\b|\bopinion\b/.test(t)) return 'testimonials';
  if (/\bpricing\b|\bpric\b|\bplan\b|\btier\b|\bpackage\b|\bsubscription\b/.test(t)) return 'pricing';
  if (/\bcontact\b|\bform\b|\breach\b|\binquiry\b/.test(t)) return 'contact';
  if (/\bstat\b|\bcounter\b|\bmetric\b|\bachievement\b/.test(t)) return 'stats';
  if (/\bhero\b|\bbanner\b|\blanding\b|surf|watersport|beach|ocean|adventure/.test(t)) return 'hero';
  // Use word boundary for "shop" so "shopify" doesn't trigger product-grid
  if (/\bproduct\b|\bgrid\b|\bcollection\b|\bshop\b|\bcatalog\b|\bcard\b/.test(t)) return 'product-grid';
  if (/\bfeature\b|\bbenefit\b|\bwhy\b|\breason\b|\bservice\b/.test(t)) return 'features';
  if (/\babout\b|\bstory\b|image.*text|text.*image/.test(t)) return 'image-text';
  return 'hero';
}

/* ── BASE CONTENT BLOCKS (format-agnostic) ── */
const BLOCKS = {
  hero: {
    name: 'hero-banner', title: 'Hero Banner',
    desc: 'Full-width hero with heading, subheading, dual CTA buttons and background image support. Mobile-first responsive.',
    html: `<section class="hero">
  <div class="hero__bg" aria-hidden="true"></div>
  <div class="hero__inner">
    <div class="hero__content">
      <span class="hero__badge">New Collection</span>
      <h1 class="hero__heading">Ride the Wave<br>of Adventure</h1>
      <p class="hero__sub">Premium watersports gear crafted for those who live for the ocean. Explore our latest collection.</p>
      <div class="hero__btns">
        <a href="#" class="hero__btn hero__btn--primary">Shop Now</a>
        <a href="#" class="hero__btn hero__btn--secondary">Learn More</a>
      </div>
    </div>
    <div class="hero__media">
      <div class="hero__img-placeholder" aria-hidden="true"></div>
    </div>
  </div>
</section>`,
    css: `.hero {
  position: relative;
  min-height: 85vh;
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #0a1628 0%, #0d2137 60%, #071525 100%);
  overflow: hidden;
  padding: 80px 0;
}
.hero__bg {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at 65% 50%, rgba(0,180,216,.18) 0%, transparent 65%);
  pointer-events: none;
}
.hero__inner {
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  gap: 60px;
  width: 100%;
}
.hero__content { flex: 1; }
.hero__badge {
  display: inline-block;
  padding: 5px 14px;
  background: #00b4d8;
  color: #fff;
  border-radius: 100px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
  margin-bottom: 22px;
}
.hero__heading {
  font-size: clamp(36px, 5vw, 64px);
  font-weight: 800;
  line-height: 1.08;
  color: #fff;
  margin: 0 0 18px;
}
.hero__sub {
  font-size: clamp(15px, 1.8vw, 19px);
  line-height: 1.65;
  color: rgba(255,255,255,.8);
  margin: 0 0 36px;
  max-width: 500px;
}
.hero__btns { display: flex; flex-wrap: wrap; gap: 12px; }
.hero__btn {
  display: inline-flex;
  align-items: center;
  padding: 13px 30px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: transform .2s ease, box-shadow .2s ease;
}
.hero__btn--primary {
  background: #00b4d8;
  color: #fff;
  box-shadow: 0 4px 20px rgba(0,180,216,.35);
}
.hero__btn--primary:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,180,216,.45); }
.hero__btn--secondary {
  background: transparent;
  color: #fff;
  border: 2px solid rgba(255,255,255,.5);
}
.hero__btn--secondary:hover { border-color: #fff; transform: translateY(-2px); }
.hero__media { flex: 0 0 44%; }
.hero__img-placeholder {
  width: 100%;
  aspect-ratio: 4/3;
  background: linear-gradient(145deg, rgba(0,180,216,.15), rgba(0,100,180,.25));
  border-radius: 20px;
  border: 1px solid rgba(0,180,216,.2);
}
@media (max-width: 768px) {
  .hero__inner { flex-direction: column; text-align: center; gap: 40px; }
  .hero__btns { justify-content: center; }
  .hero__sub { margin-left: auto; margin-right: auto; }
  .hero__media { width: 100%; max-width: 420px; }
}`,
    js: `// Hero section interactivity
document.querySelectorAll('.hero__btn').forEach(btn => {
  btn.addEventListener('click', e => {
    if (btn.getAttribute('href') === '#') e.preventDefault();
  });
});`,
    schemaSettings: [
      '{ "type": "text", "id": "badge", "label": "Badge text", "default": "New Collection" }',
      '{ "type": "text", "id": "heading", "label": "Heading", "default": "Ride the Wave of Adventure" }',
      '{ "type": "textarea", "id": "subheading", "label": "Subheading", "default": "Premium watersports gear crafted for those who live for the ocean." }',
      '{ "type": "text", "id": "btn1_label", "label": "Primary button label", "default": "Shop Now" }',
      '{ "type": "url", "id": "btn1_url", "label": "Primary button URL" }',
      '{ "type": "text", "id": "btn2_label", "label": "Secondary button label", "default": "Learn More" }',
      '{ "type": "url", "id": "btn2_url", "label": "Secondary button URL" }',
      '{ "type": "image_picker", "id": "bg_image", "label": "Background image" }',
      '{ "type": "color", "id": "color_bg", "label": "Background", "default": "#0a1628" }',
      '{ "type": "color", "id": "color_accent", "label": "Accent", "default": "#00b4d8" }',
      '{ "type": "range", "id": "padding_top", "label": "Padding top", "min": 0, "max": 120, "step": 4, "default": 80, "unit": "px" }',
      '{ "type": "range", "id": "padding_bottom", "label": "Padding bottom", "min": 0, "max": 120, "step": 4, "default": 80, "unit": "px" }'
    ]
  },

  features: {
    name: 'features-grid', title: 'Features Grid',
    desc: 'Three-column feature cards with icon, title, description. Hover animations and block-based for the Shopify theme editor.',
    html: `<section class="features">
  <div class="features__wrap">
    <div class="features__header">
      <h2 class="features__title">Why Choose Us</h2>
      <p class="features__sub">Everything you need to build an outstanding online presence.</p>
    </div>
    <div class="features__grid">
      <div class="features__card">
        <div class="features__icon">⚡</div>
        <h3 class="features__card-title">Lightning Fast</h3>
        <p class="features__card-text">Optimised for speed with lazy loading and minimal CSS overhead.</p>
      </div>
      <div class="features__card">
        <div class="features__icon">🎨</div>
        <h3 class="features__card-title">Fully Customisable</h3>
        <p class="features__card-text">Every colour, font, and spacing controlled from the settings panel.</p>
      </div>
      <div class="features__card">
        <div class="features__icon">📱</div>
        <h3 class="features__card-title">Mobile First</h3>
        <p class="features__card-text">Pixel-perfect on every device from phone to ultrawide monitor.</p>
      </div>
      <div class="features__card">
        <div class="features__icon">🛡️</div>
        <h3 class="features__card-title">Secure by Default</h3>
        <p class="features__card-text">Built with best practices, no external scripts or trackers.</p>
      </div>
      <div class="features__card">
        <div class="features__icon">🔌</div>
        <h3 class="features__card-title">Easy Integration</h3>
        <p class="features__card-text">Works with any platform — just drop in the component file.</p>
      </div>
      <div class="features__card">
        <div class="features__icon">📈</div>
        <h3 class="features__card-title">SEO Optimised</h3>
        <p class="features__card-text">Semantic HTML, alt tags, and structured data out of the box.</p>
      </div>
    </div>
  </div>
</section>`,
    css: `.features {
  background: #f8f9fa;
  padding: 80px 0;
}
.features__wrap {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}
.features__header {
  text-align: center;
  margin-bottom: 48px;
}
.features__title {
  font-size: clamp(24px, 3vw, 40px);
  font-weight: 700;
  color: #111827;
  margin: 0 0 12px;
}
.features__sub {
  font-size: 17px;
  color: #6b7280;
  max-width: 560px;
  margin: 0 auto;
  line-height: 1.6;
}
.features__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
.features__card {
  background: #fff;
  border-radius: 14px;
  padding: 32px 24px;
  border: 1px solid #f0f0f0;
  transition: transform .2s ease, box-shadow .2s ease;
}
.features__card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 32px rgba(0,0,0,.08);
}
.features__icon {
  font-size: 28px;
  margin-bottom: 18px;
  display: block;
}
.features__card-title {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
  margin: 0 0 10px;
}
.features__card-text {
  font-size: 14px;
  line-height: 1.65;
  color: #6b7280;
  margin: 0;
}
@media (max-width: 900px) { .features__grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 540px) { .features__grid { grid-template-columns: 1fr; } }`,
    js: `// Animate cards on scroll
const cards = document.querySelectorAll('.features__card');
const obs = new IntersectionObserver(entries => {
  entries.forEach((e, i) => {
    if (e.isIntersecting) {
      setTimeout(() => e.target.style.opacity = '1', i * 80);
      obs.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });
cards.forEach(c => { c.style.opacity = '0'; c.style.transition = 'opacity .4s ease, transform .2s ease'; obs.observe(c); });`,
    schemaSettings: [
      '{ "type": "text", "id": "heading", "label": "Heading", "default": "Why Choose Us" }',
      '{ "type": "textarea", "id": "subheading", "label": "Subheading", "default": "Everything you need." }',
      '{ "type": "select", "id": "columns", "label": "Columns", "default": "3", "options": [{"value":"2","label":"2"},{"value":"3","label":"3"},{"value":"4","label":"4"}] }',
      '{ "type": "color", "id": "color_bg", "label": "Background", "default": "#f8f9fa" }',
      '{ "type": "color", "id": "color_accent", "label": "Accent", "default": "#00b4d8" }',
      '{ "type": "range", "id": "padding_top", "label": "Padding top", "min": 0, "max": 120, "step": 4, "default": 80, "unit": "px" }',
      '{ "type": "range", "id": "padding_bottom", "label": "Padding bottom", "min": 0, "max": 120, "step": 4, "default": 80, "unit": "px" }'
    ]
  },

  faq: {
    name: 'faq-accordion', title: 'FAQ Accordion',
    desc: 'Accessible accordion FAQ with animated chevron, ARIA attributes, and vanilla JS toggle. Block-based for unlimited Q&A pairs.',
    html: `<section class="faq">
  <div class="faq__wrap">
    <div class="faq__header">
      <h2 class="faq__title">Frequently Asked Questions</h2>
      <p class="faq__sub">Everything you need to know. Can't find an answer? Contact us.</p>
    </div>
    <div class="faq__list">
      <div class="faq__item">
        <button class="faq__q" aria-expanded="false">
          <span>What is your return policy?</span>
          <svg class="faq__chevron" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="faq__a" hidden>
          <div class="faq__a-inner">We offer a 30-day hassle-free return policy. Contact our team and we'll sort it out quickly.</div>
        </div>
      </div>
      <div class="faq__item">
        <button class="faq__q" aria-expanded="false">
          <span>How long does shipping take?</span>
          <svg class="faq__chevron" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="faq__a" hidden>
          <div class="faq__a-inner">Standard shipping takes 3–5 business days. Express options are available at checkout.</div>
        </div>
      </div>
      <div class="faq__item">
        <button class="faq__q" aria-expanded="false">
          <span>Do you ship internationally?</span>
          <svg class="faq__chevron" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="faq__a" hidden>
          <div class="faq__a-inner">Yes! We ship to over 50 countries. International orders typically arrive in 7–14 business days.</div>
        </div>
      </div>
      <div class="faq__item">
        <button class="faq__q" aria-expanded="false">
          <span>How do I track my order?</span>
          <svg class="faq__chevron" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        <div class="faq__a" hidden>
          <div class="faq__a-inner">You'll receive a tracking link via email as soon as your order ships.</div>
        </div>
      </div>
    </div>
  </div>
</section>`,
    css: `.faq {
  background: #fff;
  padding: 80px 0;
}
.faq__wrap {
  max-width: 760px;
  margin: 0 auto;
  padding: 0 24px;
}
.faq__header {
  text-align: center;
  margin-bottom: 48px;
}
.faq__title {
  font-size: clamp(24px, 3vw, 40px);
  font-weight: 700;
  color: #111827;
  margin: 0 0 12px;
}
.faq__sub {
  font-size: 17px;
  color: #6b7280;
  line-height: 1.6;
}
.faq__item { border-bottom: 1px solid #e5e7eb; }
.faq__q {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  font-weight: 600;
  color: #111827;
  text-align: left;
  font-family: inherit;
}
.faq__chevron {
  flex-shrink: 0;
  color: #00b4d8;
  transition: transform .3s ease;
}
.faq__q[aria-expanded="true"] .faq__chevron { transform: rotate(180deg); }
.faq__a { overflow: hidden; }
.faq__a-inner {
  padding: 0 0 20px;
  font-size: 15px;
  line-height: 1.7;
  color: #6b7280;
}`,
    js: `(function () {
  document.querySelectorAll('.faq__q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      var answer = btn.nextElementSibling;
      btn.setAttribute('aria-expanded', String(!expanded));
      answer.hidden = expanded;
    });
  });
})();`,
    schemaSettings: [
      '{ "type": "text", "id": "heading", "label": "Heading", "default": "Frequently Asked Questions" }',
      '{ "type": "textarea", "id": "subheading", "label": "Subheading", "default": "Everything you need to know." }',
      '{ "type": "color", "id": "color_bg", "label": "Background", "default": "#ffffff" }',
      '{ "type": "color", "id": "color_accent", "label": "Accent", "default": "#00b4d8" }',
      '{ "type": "range", "id": "padding_top", "label": "Padding top", "min": 0, "max": 120, "step": 4, "default": 80, "unit": "px" }',
      '{ "type": "range", "id": "padding_bottom", "label": "Padding bottom", "min": 0, "max": 120, "step": 4, "default": 80, "unit": "px" }'
    ]
  },

  newsletter: {
    name: 'newsletter-section', title: 'Newsletter Signup',
    desc: 'Email signup section with inline submit button, success state, and disclaimer text. Dark background variant.',
    html: `<section class="nl">
  <div class="nl__wrap">
    <h2 class="nl__title">Stay in the Loop</h2>
    <p class="nl__sub">Get exclusive deals, new arrivals, and tips straight to your inbox.</p>
    <form class="nl__form" id="newsletterForm">
      <input class="nl__input" type="email" placeholder="Enter your email" required autocomplete="email">
      <button class="nl__btn" type="submit">Subscribe</button>
    </form>
    <p class="nl__success" id="nlSuccess" hidden>✓ Thanks for subscribing!</p>
    <p class="nl__disclaimer">No spam, ever. Unsubscribe at any time.</p>
  </div>
</section>`,
    css: `.nl {
  background: #0a1628;
  padding: 80px 0;
}
.nl__wrap {
  max-width: 640px;
  margin: 0 auto;
  padding: 0 24px;
  text-align: center;
}
.nl__title {
  font-size: clamp(24px, 3vw, 40px);
  font-weight: 700;
  color: #fff;
  margin: 0 0 14px;
}
.nl__sub {
  font-size: 17px;
  line-height: 1.6;
  color: rgba(255,255,255,.75);
  margin: 0 0 32px;
}
.nl__form {
  display: flex;
  gap: 10px;
}
.nl__input {
  flex: 1;
  padding: 13px 16px;
  border: 2px solid rgba(255,255,255,.2);
  border-radius: 8px;
  font-size: 15px;
  background: rgba(255,255,255,.08);
  color: #fff;
  outline: none;
  font-family: inherit;
  transition: border-color .2s;
}
.nl__input:focus { border-color: #00b4d8; }
.nl__input::placeholder { color: rgba(255,255,255,.4); }
.nl__btn {
  padding: 13px 24px;
  background: #00b4d8;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  white-space: nowrap;
  transition: opacity .2s;
}
.nl__btn:hover { opacity: .88; }
.nl__success {
  margin-top: 16px;
  color: #4ade80;
  font-weight: 600;
  font-size: 15px;
}
.nl__disclaimer {
  margin-top: 14px;
  font-size: 12px;
  color: rgba(255,255,255,.4);
}
@media (max-width: 480px) { .nl__form { flex-direction: column; } }`,
    js: `document.getElementById('newsletterForm').addEventListener('submit', function (e) {
  e.preventDefault();
  this.style.display = 'none';
  document.getElementById('nlSuccess').hidden = false;
});`,
    schemaSettings: [
      '{ "type": "text", "id": "heading", "label": "Heading", "default": "Stay in the Loop" }',
      '{ "type": "textarea", "id": "subheading", "label": "Subheading", "default": "Get exclusive deals and tips straight to your inbox." }',
      '{ "type": "text", "id": "placeholder", "label": "Input placeholder", "default": "Enter your email" }',
      '{ "type": "text", "id": "button_label", "label": "Button label", "default": "Subscribe" }',
      '{ "type": "color", "id": "color_bg", "label": "Background", "default": "#0a1628" }',
      '{ "type": "color", "id": "color_accent", "label": "Accent", "default": "#00b4d8" }',
      '{ "type": "range", "id": "padding_top", "label": "Padding top", "min": 0, "max": 120, "step": 4, "default": 80, "unit": "px" }',
      '{ "type": "range", "id": "padding_bottom", "label": "Padding bottom", "min": 0, "max": 120, "step": 4, "default": 80, "unit": "px" }'
    ]
  },

  testimonials: {
    name: 'testimonials', title: 'Testimonials',
    desc: 'Three-column testimonial cards with star ratings and author avatars. Block-based for unlimited reviews.',
    html: `<section class="tes">
  <div class="tes__wrap">
    <div class="tes__header">
      <h2 class="tes__title">What Our Customers Say</h2>
      <p class="tes__sub">Real feedback from real people who love our products.</p>
    </div>
    <div class="tes__grid">
      <div class="tes__card">
        <div class="tes__stars">★★★★★</div>
        <blockquote class="tes__quote">"Outstanding quality and fast shipping. Will definitely buy again!"</blockquote>
        <div class="tes__author"><div class="tes__av">A</div><div><div class="tes__name">Alex Johnson</div><div class="tes__role">Verified Buyer</div></div></div>
      </div>
      <div class="tes__card">
        <div class="tes__stars">★★★★★</div>
        <blockquote class="tes__quote">"The best purchase I've made this year. Highly recommended."</blockquote>
        <div class="tes__author"><div class="tes__av">S</div><div><div class="tes__name">Sarah Chen</div><div class="tes__role">Loyal Customer</div></div></div>
      </div>
      <div class="tes__card">
        <div class="tes__stars">★★★★☆</div>
        <blockquote class="tes__quote">"Great product, excellent customer support, very happy overall."</blockquote>
        <div class="tes__author"><div class="tes__av">M</div><div><div class="tes__name">Marcus Williams</div><div class="tes__role">Verified Buyer</div></div></div>
      </div>
    </div>
  </div>
</section>`,
    css: `.tes {
  background: #f9fafb;
  padding: 80px 0;
}
.tes__wrap {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}
.tes__header {
  text-align: center;
  margin-bottom: 48px;
}
.tes__title {
  font-size: clamp(24px, 3vw, 40px);
  font-weight: 700;
  color: #111827;
  margin: 0 0 12px;
}
.tes__sub {
  font-size: 17px;
  color: #6b7280;
  max-width: 540px;
  margin: 0 auto;
  line-height: 1.6;
}
.tes__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
}
.tes__card {
  background: #fff;
  border-radius: 14px;
  padding: 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid #f0f0f0;
}
.tes__stars { color: #f59e0b; font-size: 18px; letter-spacing: 2px; }
.tes__quote {
  font-size: 15px;
  line-height: 1.7;
  color: #374151;
  font-style: italic;
  flex: 1;
  margin: 0;
}
.tes__author { display: flex; align-items: center; gap: 12px; }
.tes__av {
  width: 40px; height: 40px;
  border-radius: 50%;
  background: #00b4d8;
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 15px; flex-shrink: 0;
}
.tes__name { font-size: 14px; font-weight: 600; color: #111827; }
.tes__role { font-size: 12px; color: #9ca3af; margin-top: 2px; }
@media (max-width: 900px) { .tes__grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 540px) { .tes__grid { grid-template-columns: 1fr; } }`,
    js: `// No JavaScript required for this component`,
    schemaSettings: [
      '{ "type": "text", "id": "heading", "label": "Heading", "default": "What Our Customers Say" }',
      '{ "type": "textarea", "id": "subheading", "label": "Subheading", "default": "Real feedback from real people." }',
      '{ "type": "color", "id": "color_bg", "label": "Background", "default": "#f9fafb" }',
      '{ "type": "color", "id": "color_accent", "label": "Accent", "default": "#00b4d8" }',
      '{ "type": "range", "id": "padding_top", "label": "Padding top", "min": 0, "max": 120, "step": 4, "default": 80, "unit": "px" }',
      '{ "type": "range", "id": "padding_bottom", "label": "Padding bottom", "min": 0, "max": 120, "step": 4, "default": 80, "unit": "px" }'
    ]
  }
};

/* ── PRODUCT PAGE SECTION ── */
BLOCKS['product-grid'] = {
  name: 'product-page-section', title: 'Product Page Section',
  desc: 'Full-featured product page section: image gallery, title, price, variants, quantity, Add to Cart, badges, description, and shipping info.',
  html: `<section class="pp">
  <div class="pp__wrap">

    <!-- Gallery -->
    <div class="pp__gallery">
      <div class="pp__main-img" id="ppMainImg">
        <div class="pp__img-inner" style="background:linear-gradient(135deg,#e8f4f8,#c9e8f0)">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style="opacity:.25">
            <rect width="80" height="80" rx="12" fill="#00b4d8"/>
            <path d="M20 56l12-16 10 12 8-10 10 14H20Z" fill="#fff"/>
            <circle cx="54" cy="28" r="6" fill="#fff"/>
          </svg>
        </div>
        <span class="pp__badge">Sale</span>
      </div>
      <div class="pp__thumbs">
        ${[1,2,3,4].map(i=>`<button class="pp__thumb${i===1?' active':''}" data-idx="${i}" aria-label="View image ${i}">
          <div style="background:linear-gradient(135deg,#e0eef4,#c0d8e8);width:100%;height:100%;border-radius:6px"></div>
        </button>`).join('\n        ')}
      </div>
    </div>

    <!-- Info -->
    <div class="pp__info">
      <div class="pp__breadcrumb"><a href="#">Home</a> / <a href="#">Products</a> / Pro Wave Board</div>

      <h1 class="pp__title">Pro Wave Board — Carbon Series</h1>

      <div class="pp__meta">
        <div class="pp__stars" aria-label="4.8 out of 5 stars">
          ★★★★★ <span class="pp__review-count">(124 reviews)</span>
        </div>
        <span class="pp__sku">SKU: WB-C2024-PRO</span>
      </div>

      <div class="pp__price-row">
        <span class="pp__price">$349.00</span>
        <span class="pp__original">$449.00</span>
        <span class="pp__discount">22% OFF</span>
      </div>

      <p class="pp__short-desc">Engineered for serious surfers. Ultra-light carbon fibre construction with responsive flex pattern for maximum speed and control in all wave conditions.</p>

      <div class="pp__option">
        <div class="pp__option-label">Size <span class="pp__option-hint">— Size Guide</span></div>
        <div class="pp__size-btns" role="group" aria-label="Board size">
          ${['5\'6"','5\'10"','6\'2"','6\'6"','7\'0"'].map((s,i)=>`<button class="pp__size${i===1?' active':''}">${s}</button>`).join('')}
        </div>
      </div>

      <div class="pp__option">
        <div class="pp__option-label">Colour</div>
        <div class="pp__colours" role="group" aria-label="Colour">
          ${[['#0a1628','Ocean Blue'],['#1a1a1a','Matte Black'],['#e8f4f0','Pearl White'],['#c0392b','Coral Red']].map(([c,l],i)=>`<button class="pp__colour${i===0?' active':''}" style="background:${c}" aria-label="${l}" title="${l}"></button>`).join('')}
        </div>
      </div>

      <div class="pp__qty-row">
        <div class="pp__qty" role="group" aria-label="Quantity">
          <button class="pp__qty-btn" id="ppQtyMinus" aria-label="Decrease">−</button>
          <input class="pp__qty-input" type="number" id="ppQtyVal" value="1" min="1" max="99" aria-label="Quantity">
          <button class="pp__qty-btn" id="ppQtyPlus" aria-label="Increase">+</button>
        </div>
        <span class="pp__stock">✓ In stock — ships in 24 h</span>
      </div>

      <div class="pp__actions">
        <button class="pp__atc" id="ppAtc">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M3 3h2l2.5 8h7l2-5H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="8" cy="14.5" r="1.2" fill="currentColor"/>
            <circle cx="14" cy="14.5" r="1.2" fill="currentColor"/>
          </svg>
          Add to Cart
        </button>
        <button class="pp__buy">Buy it Now</button>
        <button class="pp__wish" aria-label="Save to wishlist">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 17S2 12 2 6.5A4.5 4.5 0 0 1 10 4.07 4.5 4.5 0 0 1 18 6.5C18 12 10 17 10 17Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- Feature badges -->
      <div class="pp__badges">
        <div class="pp__badge-item">🚚 Free shipping over $200</div>
        <div class="pp__badge-item">🔄 30-day returns</div>
        <div class="pp__badge-item">🔒 Secure checkout</div>
      </div>

      <!-- Accordion details -->
      <div class="pp__accordion" id="ppAccordion">
        <div class="pp__ac-item">
          <button class="pp__ac-q" aria-expanded="true">Product Details</button>
          <div class="pp__ac-a">
            <ul class="pp__spec-list">
              <li><strong>Material:</strong> T700 Carbon Fibre + Fibreglass</li>
              <li><strong>Weight:</strong> 2.4 kg</li>
              <li><strong>Fin System:</strong> FCS II compatible</li>
              <li><strong>Rocker:</strong> Medium-low for speed</li>
              <li><strong>Suitable for:</strong> Intermediate to advanced</li>
            </ul>
          </div>
        </div>
        <div class="pp__ac-item">
          <button class="pp__ac-q" aria-expanded="false">Shipping &amp; Returns</button>
          <div class="pp__ac-a" hidden>
            <p>Free standard shipping on orders over $200. Express next-day available. 30-day hassle-free returns on unused items in original packaging.</p>
          </div>
        </div>
        <div class="pp__ac-item">
          <button class="pp__ac-q" aria-expanded="false">Customer Reviews</button>
          <div class="pp__ac-a" hidden>
            <div class="pp__review-summary">
              <div class="pp__review-score">4.8 <span>/ 5</span></div>
              <div class="pp__review-bars">
                ${[[5,88],[4,8],[3,3],[2,0],[1,1]].map(([star,pct])=>`<div class="pp__rb-row"><span>${star}★</span><div class="pp__rb-track"><div class="pp__rb-fill" style="width:${pct}%"></div></div><span>${pct}%</span></div>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</section>`,
  css: `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
.pp {
  background: #fff;
  padding: 40px 0 80px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #111827;
  font-size: 14px;
  line-height: 1.6;
}
.pp__wrap {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 56px;
  align-items: start;
}
/* ── Gallery ── */
.pp__gallery { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 20px; }
.pp__main-img {
  position: relative;
  border-radius: 14px;
  overflow: hidden;
  background: #f3f4f6;
  aspect-ratio: 1;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #e5e7eb;
}
.pp__img-inner {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
}
.pp__badge {
  position: absolute; top: 14px; left: 14px;
  background: #ef4444; color: #fff;
  font-size: 11px; font-weight: 700; letter-spacing: .06em;
  padding: 4px 10px; border-radius: 100px; text-transform: uppercase;
}
.pp__thumbs { display: flex; gap: 10px; }
.pp__thumb {
  flex: 1; aspect-ratio: 1;
  border-radius: 8px; overflow: hidden;
  border: 2px solid transparent;
  cursor: pointer; background: #f3f4f6;
  padding: 0; transition: border-color .15s;
}
.pp__thumb.active { border-color: #00b4d8; }
.pp__thumb:hover  { border-color: #bde0e8; }
/* ── Info ── */
.pp__info { display: flex; flex-direction: column; gap: 18px; }
.pp__breadcrumb { font-size: 12px; color: #9ca3af; }
.pp__breadcrumb a { color: #9ca3af; text-decoration: none; }
.pp__breadcrumb a:hover { color: #00b4d8; }
.pp__title { font-size: clamp(20px, 2.5vw, 28px); font-weight: 700; line-height: 1.2; color: #111827; }
.pp__meta { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.pp__stars { color: #f59e0b; font-size: 15px; }
.pp__review-count { color: #6b7280; font-size: 13px; margin-left: 4px; }
.pp__sku { font-size: 12px; color: #9ca3af; }
.pp__price-row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.pp__price    { font-size: 28px; font-weight: 700; color: #111827; }
.pp__original { font-size: 16px; color: #9ca3af; text-decoration: line-through; }
.pp__discount { font-size: 13px; font-weight: 600; color: #ef4444; background: #fef2f2; padding: 3px 8px; border-radius: 6px; }
.pp__short-desc { font-size: 14px; line-height: 1.7; color: #4b5563; }
.pp__option { display: flex; flex-direction: column; gap: 10px; }
.pp__option-label { font-size: 13px; font-weight: 600; color: #374151; }
.pp__option-hint { font-weight: 400; color: #00b4d8; text-decoration: underline; cursor: pointer; margin-left: 8px; }
.pp__size-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.pp__size {
  padding: 8px 14px; border-radius: 8px;
  border: 1.5px solid #d1d5db; background: #fff;
  font-size: 13px; font-weight: 500; color: #374151;
  cursor: pointer; transition: border-color .15s, background .15s, color .15s;
}
.pp__size.active { border-color: #00b4d8; background: #e6f7fc; color: #0284c7; }
.pp__size:hover:not(.active) { border-color: #9ca3af; }
.pp__colours { display: flex; gap: 10px; }
.pp__colour {
  width: 30px; height: 30px; border-radius: 50%;
  border: 2px solid transparent; cursor: pointer;
  transition: transform .15s, box-shadow .15s;
  outline-offset: 2px;
}
.pp__colour.active { box-shadow: 0 0 0 3px #fff, 0 0 0 5px #00b4d8; }
.pp__colour:hover:not(.active) { transform: scale(1.12); }
.pp__qty-row { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.pp__qty { display: flex; align-items: center; border: 1.5px solid #d1d5db; border-radius: 8px; overflow: hidden; }
.pp__qty-btn {
  width: 40px; height: 44px; background: #f9fafb; border: none;
  font-size: 20px; font-weight: 300; color: #374151; cursor: pointer;
  transition: background .15s;
}
.pp__qty-btn:hover { background: #f0f0f0; }
.pp__qty-input {
  width: 52px; height: 44px; border: none; border-left: 1.5px solid #d1d5db; border-right: 1.5px solid #d1d5db;
  text-align: center; font-size: 15px; font-weight: 600; color: #111827;
  font-family: inherit; background: #fff;
}
.pp__qty-input:focus { outline: none; }
.pp__stock { font-size: 13px; color: #16a34a; font-weight: 500; }
.pp__actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.pp__atc {
  flex: 1; min-width: 180px;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 14px 24px; background: #00b4d8; color: #fff;
  border: none; border-radius: 10px; font-size: 15px; font-weight: 600;
  cursor: pointer; font-family: inherit;
  transition: background .2s, transform .15s, box-shadow .2s;
  box-shadow: 0 4px 14px rgba(0,180,216,.3);
}
.pp__atc:hover { background: #0099bb; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,180,216,.35); }
.pp__atc:active { transform: translateY(0); }
.pp__buy {
  flex: 1; min-width: 140px;
  padding: 14px 24px; background: #111827; color: #fff;
  border: none; border-radius: 10px; font-size: 15px; font-weight: 600;
  cursor: pointer; font-family: inherit;
  transition: background .2s;
}
.pp__buy:hover { background: #1f2937; }
.pp__wish {
  width: 48px; height: 48px;
  display: flex; align-items: center; justify-content: center;
  border: 1.5px solid #d1d5db; border-radius: 10px;
  background: #fff; cursor: pointer; color: #6b7280;
  transition: border-color .15s, color .15s;
}
.pp__wish:hover { border-color: #ef4444; color: #ef4444; }
.pp__badges { display: flex; gap: 8px; flex-wrap: wrap; }
.pp__badge-item {
  font-size: 12px; color: #374151;
  background: #f9fafb; border: 1px solid #e5e7eb;
  border-radius: 6px; padding: 6px 12px;
}
/* ── Accordion ── */
.pp__accordion { border-top: 1px solid #e5e7eb; }
.pp__ac-item { border-bottom: 1px solid #e5e7eb; }
.pp__ac-q {
  width: 100%; text-align: left; background: none; border: none;
  padding: 16px 0; font-size: 14px; font-weight: 600; color: #111827;
  cursor: pointer; font-family: inherit;
  display: flex; align-items: center; justify-content: space-between;
  transition: color .15s;
}
.pp__ac-q::after { content: '+'; font-size: 20px; font-weight: 300; color: #9ca3af; transition: transform .2s; }
.pp__ac-q[aria-expanded="true"]::after { content: '−'; }
.pp__ac-a { overflow: hidden; }
.pp__ac-a p, .pp__ac-a ul { padding-bottom: 16px; font-size: 14px; color: #4b5563; line-height: 1.7; }
.pp__spec-list { padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.pp__spec-list li { font-size: 14px; color: #4b5563; }
/* ── Reviews summary ── */
.pp__review-summary { display: flex; gap: 24px; align-items: flex-start; padding-bottom: 16px; }
.pp__review-score { font-size: 40px; font-weight: 700; color: #111827; line-height: 1; }
.pp__review-score span { font-size: 16px; color: #9ca3af; font-weight: 400; }
.pp__review-bars { flex: 1; display: flex; flex-direction: column; gap: 5px; }
.pp__rb-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b7280; }
.pp__rb-track { flex: 1; height: 6px; background: #f3f4f6; border-radius: 3px; overflow: hidden; }
.pp__rb-fill  { height: 100%; background: #f59e0b; border-radius: 3px; }
/* ── Responsive ── */
@media (max-width: 900px) {
  .pp__wrap { grid-template-columns: 1fr; gap: 32px; }
  .pp__gallery { position: static; }
}
@media (max-width: 480px) {
  .pp { padding: 20px 0 60px; }
  .pp__wrap { padding: 0 14px; }
  .pp__actions { flex-direction: column; }
  .pp__atc, .pp__buy { width: 100%; }
  .pp__wish { width: 100%; border-radius: 10px; height: 44px; }
}`,
  js: `(function () {
  // Quantity stepper
  var qtyInput = document.getElementById('ppQtyVal');
  document.getElementById('ppQtyMinus').addEventListener('click', function () {
    var v = parseInt(qtyInput.value, 10);
    if (v > 1) qtyInput.value = v - 1;
  });
  document.getElementById('ppQtyPlus').addEventListener('click', function () {
    var v = parseInt(qtyInput.value, 10);
    if (v < 99) qtyInput.value = v + 1;
  });

  // Size selector
  document.querySelectorAll('.pp__size').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.pp__size').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

  // Colour selector
  document.querySelectorAll('.pp__colour').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.pp__colour').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

  // Thumbnail selector
  document.querySelectorAll('.pp__thumb').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.pp__thumb').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

  // Wishlist toggle
  var wish = document.querySelector('.pp__wish');
  if (wish) {
    wish.addEventListener('click', function () {
      var active = wish.getAttribute('data-active') === '1';
      wish.setAttribute('data-active', active ? '0' : '1');
      wish.style.color    = active ? '' : '#ef4444';
      wish.style.borderColor = active ? '' : '#ef4444';
    });
  }

  // Add to Cart feedback
  var atcBtn = document.getElementById('ppAtc');
  if (atcBtn) {
    atcBtn.addEventListener('click', function () {
      var orig = atcBtn.textContent;
      atcBtn.textContent = '✓ Added!';
      atcBtn.style.background = '#16a34a';
      setTimeout(function () {
        atcBtn.textContent = orig;
        atcBtn.style.background = '';
      }, 1800);
    });
  }

  // Accordion
  document.querySelectorAll('.pp__ac-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      var panel = btn.nextElementSibling;
      panel.hidden = expanded;
    });
  });
})();`,
  schemaSettings: [
    '{ "type": "text",         "id": "title",       "label": "Product title",    "default": "Pro Wave Board — Carbon Series" }',
    '{ "type": "text",         "id": "price",       "label": "Price",            "default": "$349.00" }',
    '{ "type": "text",         "id": "compare_price","label": "Compare-at price","default": "$449.00" }',
    '{ "type": "product",      "id": "product",     "label": "Product" }',
    '{ "type": "image_picker", "id": "image_1",     "label": "Gallery image 1" }',
    '{ "type": "image_picker", "id": "image_2",     "label": "Gallery image 2" }',
    '{ "type": "image_picker", "id": "image_3",     "label": "Gallery image 3" }',
    '{ "type": "image_picker", "id": "image_4",     "label": "Gallery image 4" }',
    '{ "type": "color",        "id": "color_accent","label": "Accent colour",    "default": "#00b4d8" }',
    '{ "type": "checkbox",     "id": "show_reviews","label": "Show reviews",     "default": true }',
    '{ "type": "checkbox",     "id": "show_shipping","label": "Show shipping info","default": true }'
  ]
};

BLOCKS['image-text']   = { ...BLOCKS.hero,         name: 'image-text-split', title: 'Image + Text Split',  desc: '50/50 split layout with image and content panel.' };
BLOCKS.stats           = { ...BLOCKS.features,     name: 'stats-counter',   title: 'Stats Counter',        desc: 'Animated count-up stats triggered on scroll.' };
BLOCKS.pricing         = { ...BLOCKS.testimonials, name: 'pricing-table',   title: 'Pricing Table',        desc: 'Three-tier pricing with featured plan highlight.' };
BLOCKS.contact         = { ...BLOCKS.newsletter,   name: 'contact-form',    title: 'Contact Form',         desc: 'Contact form with name, email, message fields.' };

/* ── FORMAT BUILDERS ── */
function buildHtml(block, includeJs) {
  const htmlPage = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${block.title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
${block.html}
${includeJs ? '\n  <script src="script.js"></script>' : ''}
</body>
</html>`;

  const files = [
    { name: 'index.html', lang: 'html', content: htmlPage },
    { name: 'style.css',  lang: 'css',  content: `/* ${block.title} — style.css */\n${block.css}` },
  ];
  if (includeJs && block.js && !block.js.includes('No JavaScript')) {
    files.push({ name: 'script.js', lang: 'js', content: `/* ${block.title} — script.js */\n${block.js}` });
  }
  return files;
}

function buildShopify(block) {
  const schemaJson = `{
  "name": "${block.title}",
  "tag": "section",
  "class": "section-${block.name}",
  "disabled_on": { "groups": ["header","footer"] },
  "settings": [
    ${block.schemaSettings.join(',\n    ')}
  ],
  "presets": [{ "name": "${block.title}" }]
}`;

  const liquidFile = `${block.html}

{% style %}
${block.css}
{% endstyle %}
${(!block.js.includes('No JavaScript')) ? `
{% javascript %}
${block.js}
{% endjavascript %}
` : ''}
{% schema %}
${schemaJson}
{% endschema %}`;

  const cssExtract = block.css.replace(/\./g, '.shopify-section-').substring(0, 200) + '\n/* Full CSS is embedded in the {% style %} block above */';

  return [
    { name: `${block.name}.liquid`, lang: 'liquid', content: liquidFile },
    { name: 'schema.json',          lang: 'json',   content: schemaJson },
    { name: 'styles.css',           lang: 'css',    content: block.css },
  ];
}

function buildReact(block) {
  const compName = block.name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
  const jsxContent = `import React from 'react';
import styles from './${compName}.module.css';

/**
 * ${block.title}
 * ${block.desc}
 */
export default function ${compName}() {
  return (
${block.html
  .replace(/class=/g, 'className=')
  .replace(/for=/g, 'htmlFor=')
  .replace(/<!--[\s\S]*?-->/g, '')
  .split('\n')
  .map(l => '    ' + l)
  .join('\n')}
  );
}
`;

  const moduleCSS = `/* ${compName}.module.css — CSS Module for ${block.title} */
${block.css}`;

  return [
    { name: `${compName}.jsx`,          lang: 'jsx', content: jsxContent },
    { name: `${compName}.module.css`,   lang: 'css', content: moduleCSS },
    { name: `${compName}.stories.jsx`,  lang: 'jsx', content: `import ${compName} from './${compName}';
export default { title: 'Components/${compName}', component: ${compName} };
export const Default = () => <${compName} />;` },
  ];
}

function buildVue(block) {
  const compName = block.name.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');
  const vueContent = `<template>
${block.html.split('\n').map(l => '  ' + l).join('\n')}
</template>

<script>
export default {
  name: '${compName}',
  // Add props here to make the component configurable
};
</script>

<style scoped>
${block.css}
</style>`;

  return [
    { name: `${compName}.vue`, lang: 'vue', content: vueContent },
  ];
}

function buildPreviewHtml(block, includeJs) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${block.title} — Preview</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    ${block.css}
  </style>
</head>
<body>
${block.html}
${includeJs && !block.js.includes('No JavaScript') ? `<script>${block.js}</script>` : ''}
</body>
</html>`;
}

async function runVisionPipeline(imageBase64, mediaType, userPrompt, format, sendStatus) {
  const result = await claudeVision(imageBase64, mediaType, userPrompt, format, sendStatus);
  if (result.ok) return result.data;
  return { error: result.error || 'vision_failed' };
}

/* ══════════════════════════════════════════════════
   COLOR-AWARE LOCAL GENERATOR  (fallback, no API key)
══════════════════════════════════════════════════ */
function generateWithColors(typeHint, format, palette) {
  const p      = palette || {};
  const bg     = p.background || null;
  const fg     = p.foreground || null;
  const accent = p.primary    || null;
  const muted  = p.muted      || null;
  const border = p.border     || null;
  const card   = p.card       || null;

  const type  = detectType(typeHint);
  const base  = BLOCKS[type] || BLOCKS.hero;

  // Inject extracted colors into the template CSS (only when palette provided)
  let css = base.css;
  if (bg) {
    // Dark palette replacements
    css = css.replace(/#0a1628|#0d2137|#071525|#0a0a12/gi, bg);
    // Light palette replacements
    css = css.replace(/(?<![0-9a-f])#f8f9fa|#f9fafb(?![0-9a-f])/gi, bg);
  }
  if (fg) {
    css = css.replace(/#111827|#1f2937|#374151/gi, fg);
    css = css.replace(/color:\s*#fff(?=[;\s}])/g, `color: ${fg}`);
  }
  if (accent) {
    css = css.replace(/#00b4d8/gi, accent);
  }
  if (muted) {
    css = css.replace(/#6b7280|#9ca3af/gi, muted);
  }
  if (border) {
    css = css.replace(/#e5e7eb|#e0e0e0|#f0f0f0/gi, border);
  }
  if (card) {
    css = css.replace(/background:\s*#fff(?=[;\s}])/g, `background: ${card}`);
  }

  const customBlock = { ...base, css };
  const incJs = format === 'html-js' || format === 'shopify' || format === 'react';

  let files;
  switch (format) {
    case 'shopify': files = buildShopify(customBlock); break;
    case 'react':   files = buildReact(customBlock);   break;
    case 'vue':     files = buildVue(customBlock);      break;
    default:        files = buildHtml(customBlock, format === 'html-js'); break;
  }

  const preview   = buildPreviewHtml(customBlock, incJs);
  const fmtLabel  = { html:'HTML + CSS', 'html-js':'HTML + CSS + JS', shopify:'Shopify Liquid', react:'React Component', vue:'Vue Component' }[format] || 'HTML + CSS';

  const paletteNote = bg
    ? `<li>✦ <strong>Colors extracted</strong> from your screenshot and applied</li>`
    : `<li>✦ Add <code>XAI_API_KEY</code> to .env for AI-powered pixel-perfect analysis</li>`;

  return {
    type: 'code', format,
    section_name: customBlock.name,
    title:        customBlock.title,
    description:  customBlock.desc,
    message: `<p>Generated <strong>${customBlock.title}</strong> as <em>${fmtLabel}</em>.</p><p>${customBlock.desc}</p><ul>${paletteNote}<li>✦ <strong>Live Preview</strong> — see it rendered</li><li>✦ Download or copy any file</li></ul>`,
    files,
    preview_html: preview,
  };
}

function generate(typeHint, format) {
  const type  = detectType(typeHint);
  const block = BLOCKS[type] || BLOCKS.hero;
  const incJs = format === 'html-js' || format === 'shopify' || format === 'react';

  let files;
  switch (format) {
    case 'shopify': files = buildShopify(block); break;
    case 'react':   files = buildReact(block);   break;
    case 'vue':     files = buildVue(block);      break;
    default:        files = buildHtml(block, format === 'html-js'); break;
  }

  const preview = buildPreviewHtml(block, incJs);

  const formatLabel = { html:'HTML + CSS', 'html-js':'HTML + CSS + JS', shopify:'Shopify Liquid', react:'React Component', vue:'Vue Component' }[format] || 'HTML + CSS';

  return {
    type:         'code',
    format,
    section_name: block.name,
    title:        block.title,
    description:  block.desc,
    message: `<p>Generated <strong>${block.title}</strong> as <em>${formatLabel}</em>.</p><p>${block.desc}</p><ul><li>✦ <strong>Live Preview</strong> tab — see it rendered</li><li>✦ <strong>${files[0].name}</strong> — ready to use</li><li>✦ Download individual files or copy from any tab</li></ul>`,
    files,
    preview_html: preview,
  };
}

function generateTextResponse(message) {
  const t = (message || '').toLowerCase();
  if (/debug|fix|error|issue|problem|broken/.test(t)) {
    return { type:'text', message:`<p>Common Liquid/HTML issues and fixes:</p><ul><li><strong>Undefined variable:</strong> wrap in <code>{% if var != blank %}</code></li><li><strong>Missing endtag:</strong> every <code>{% if %}</code>/<code>{% for %}</code> needs a closing tag</li><li><strong>Schema JSON error:</strong> no trailing commas, all keys quoted</li><li><strong>Image not showing:</strong> use <code>image | image_url: width: 800 | image_tag</code></li></ul><p>Paste your code and describe the problem for a specific fix.</p>` };
  }
  if (/schema/.test(t)) {
    return { type:'text', message:`<p>Shopify schema setting types:</p><ul><li><code>text</code>, <code>textarea</code>, <code>richtext</code></li><li><code>image_picker</code>, <code>video</code>, <code>url</code></li><li><code>color</code>, <code>range</code>, <code>select</code>, <code>checkbox</code>, <code>number</code></li><li><code>collection</code>, <code>product</code>, <code>blog</code>, <code>page</code></li></ul><p>Use <code>"header"</code> type to group settings with a divider label.</p>` };
  }
  return { type:'text', message:`<p>I can generate production-ready code for you. Try one of the quick actions, or describe what you need — I'll match the layout, colours, and components from your description.</p><ul><li>Upload a screenshot to match a design exactly</li><li>Select your output format (HTML, Shopify, React)</li><li>Describe the section (hero, features, FAQ, newsletter, etc.)</li></ul>` };
}

/* ══════════════════════════════════════════════════
   SSE ENDPOINTS
══════════════════════════════════════════════════ */
app.post('/api/analyze-image', requireAuth, async (req, res) => {
  const { imageBase64, mediaType, userPrompt, format = 'html', colorPalette } = req.body;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const send       = d   => res.write(`data: ${JSON.stringify(d)}\n\n`);
  const sendStatus = msg => send({ type: 'status', message: msg });

  if (!imageBase64) {
    send({ type: 'error', message: 'No image provided. Upload a screenshot first.' });
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  sendStatus('Starting fresh screenshot analysis…');
  await sleep(100);

  const visionResult = await runVisionPipeline(imageBase64, mediaType, userPrompt, format, sendStatus);
  if (visionResult.error) {
    const err = visionResult.error;
    if (err === 'api_503') {
      send({ type: 'complete', data: {
        type: 'text',
        message: `<p><strong>⚡ Gemini servers are temporarily busy (503)</strong></p><p>All models returned "Service Unavailable". This is a temporary overload — please wait 1–2 minutes and try again.</p><p><strong>Text requests work normally right now</strong> — try: <em>"Generate a hero section"</em>, <em>"Generate a product page"</em>, etc.</p>`,
      }});
    } else if (['api_429', 'api_401', 'api_403'].includes(err)) {
      send({ type: 'complete', data: {
        type: 'text',
        message: `<p><strong>AI quota reached</strong> — screenshot analysis requires a working API key.</p><ul><li>Your Gemini free-tier quota is exhausted for today. It resets at midnight Pacific time.</li><li>To add a second free key: put <code>GEMINI_API_KEY_2=AIza…</code> in <code>.env</code> (use a different Google account at <strong>aistudio.google.com</strong>), then restart the server.</li><li>In the meantime, <strong>text requests work normally</strong> — try: <em>"Generate a hero section"</em>, <em>"Generate a product page"</em>, etc.</li></ul>`,
      }});
    } else {
      send({ type: 'error', message: visionErrorMessage(err) });
    }
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  send({ type: 'complete', data: visionResult });
  res.write('data: [DONE]\n\n');
  res.end();
});

app.post('/api/chat', requireAuth, async (req, res) => {
  const { message, imageBase64, mediaType, format = 'html', history = [], colorPalette } = req.body;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  const send       = d   => res.write(`data: ${JSON.stringify(d)}\n\n`);
  const sendStatus = msg => send({ type: 'status', message: msg });

  if (imageBase64) {
    sendStatus('Starting fresh screenshot analysis…');
    await sleep(100);

    const visionResult = await runVisionPipeline(imageBase64, mediaType, message, format, sendStatus);
    if (visionResult.error) {
      const err = visionResult.error;
      if (err === 'api_503') {
        send({ type: 'complete', data: {
          type: 'text',
          message: `<p><strong>⚡ Gemini servers are temporarily busy (503)</strong></p><p>All models returned "Service Unavailable". Please wait 1–2 minutes and try uploading your screenshot again.</p><p><strong>Text requests work normally right now</strong> — try: <em>"Generate a hero section"</em>, <em>"Generate a product page"</em>, etc.</p>`,
        }});
      } else if (['api_429', 'api_401', 'api_403'].includes(err)) {
        send({ type: 'complete', data: {
          type: 'text',
          message: `<p><strong>AI quota reached</strong> — screenshot analysis is temporarily unavailable.</p><ul><li>Your Gemini free-tier quota is exhausted for today. It resets at midnight Pacific time.</li><li>Add a second free key: <code>GEMINI_API_KEY_2=AIza…</code> in <code>.env</code> from a different Google account at <strong>aistudio.google.com</strong>, then restart the server.</li><li><strong>Text requests still work</strong> — describe what you want and I'll generate the code: <em>"Generate a hero section"</em>, <em>"Generate a product page with all features"</em>, etc.</li></ul>`,
        }});
      } else {
        send({ type: 'error', message: visionErrorMessage(err) });
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    send({ type: 'complete', data: visionResult });
  } else if (isApiKeyConfigured()) {
    sendStatus('Thinking with AI…');
    const chatResult = await claudeChat(message || '', format, history);

    if (chatResult.ok) {
      send({ type: 'complete', data: chatResult.data });
    } else {
      // Quota / auth errors → silently fall back to the local generator
      const quotaOrAuth = ['api_429', 'api_401', 'api_403', 'api_503', 'missing_key', 'placeholder_key'].includes(chatResult.error);
      const msg         = message || '';
      const codeIntent  = /create|build|generate|make|add|show|give|hero|banner|section|component|html|css|react|shopify|layout|template|navbar|footer|pricing|faq|newsletter|features|testimonial|product|grid|landing|page|card|form|button|slider|carousel|gallery|menu|nav|header/i.test(msg);

      if (quotaOrAuth && codeIntent) {
        sendStatus('Generating code…');
        await sleep(200);
        send({ type: 'complete', data: generateWithColors(msg, format, colorPalette) });
      } else if (quotaOrAuth) {
        sendStatus('Thinking…');
        await sleep(200);
        send({ type: 'complete', data: generateTextResponse(msg) });
      } else {
        // Non-quota errors (network issues, bad responses) — surface them
        send({ type: 'error', message: visionErrorMessage(chatResult.error) || 'AI request failed. Please try again.' });
        res.write('data: [DONE]\n\n');
        return res.end();
      }
    }
  } else {
    const msg = message || '';
    const codeIntent = /create|build|generate|make|add|show|give|hero|banner|section|component|html|css|react|shopify|layout|template|navbar|footer|pricing|faq|newsletter|features|testimonial|product|grid|landing|page|card|form|button|slider|carousel|gallery|menu|nav|header/i.test(msg);
    if (codeIntent) {
      sendStatus('Generating code…'); await sleep(300);
      send({ type: 'complete', data: generateWithColors(msg, format, colorPalette) });
    } else {
      sendStatus('Thinking…'); await sleep(300);
      send({ type: 'complete', data: generateTextResponse(msg) });
    }
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

app.get('/api/health', (_req, res) => {
  const vision = getVisionStatus();
  res.json({
    ok: true,
    mode: vision.visionEnabled ? 'grok-vision' : 'local-generator',
    auth: true,
    serverReachable: true,
    ...vision,
  });
});

app.get('/api/vision-status', (_req, res) => {
  res.json({ serverReachable: true, ...getVisionStatus() });
});

app.get('/api/list-models', requireAuth, async (_req, res) => {
  const { resolveApiKey } = require('./lib/env');
  const key = resolveApiKey();
  if (!key) return res.json({ error: 'No API key configured' });
  try {
    const r = await fetch('https://api.x.ai/v1/models', {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    const data = await r.json();
    const ids = (data.data || []).map(m => m.id).sort();
    res.json({ ok: true, models: ids, raw: data });
  } catch (e) {
    res.json({ error: e.message });
  }
});

app.post('/api/settings/api-key', requireAuth, (req, res) => {
  const { apiKey } = req.body || {};
  if (!apiKey || !String(apiKey).trim()) {
    return res.status(400).json({ error: 'API key is required.' });
  }
  try {
    const result = saveApiKey(apiKey);
    res.json({ ok: true, ...result, ...getVisionStatus() });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code || 'invalid_key' });
  }
});

/* SPA fallback */
app.get('*', (_req, res) => {
  const idx = path.join(__dirname, 'dist', 'index.html');
  if (fs.existsSync(idx)) res.sendFile(idx);
  else res.status(404).send('Run npm run build first, or use npm run dev');
});

const PORT_PREFERENCE = Number(process.env.PORT) || 3001;

startApp(app, { preferredPort: PORT_PREFERENCE, rootDir: __dirname, maxAttempts: 10 })
  .then(({ srv, port, preferredBusy }) => {
    if (preferredBusy) {
      console.warn(`\n  Port ${preferredBusy} was busy — API started on port ${port} instead.\n`);
    }
    logStartup(loadedEnvFiles, port);
    console.log(`  LiquidAI  →  http://localhost:${port}\n`);

    srv.on('error', err => {
      console.error('Server error:', err.message);
      process.exit(1);
    });
  })
  .catch(err => {
    if (err.code === 'NO_FREE_PORT') {
      console.error(`\n  Could not find a free port starting at ${PORT_PREFERENCE}. Stop other Node processes and retry.\n`);
    } else {
      console.error('\n  Failed to start server:', err.message, '\n');
    }
    process.exit(1);
  });
