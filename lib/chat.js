'use strict';

const { parseDelimitedResponse } = require('./vision');
const { resolveApiKey, resolveGeminiKeys, isApiKeyConfigured, getApiProvider } = require('./env');
const quota = require('./quota');

const GROK_MODEL    = 'grok-4';
const GROK_BASE_URL = 'https://api.x.ai/v1';
const ANTHROPIC_MODEL    = 'claude-sonnet-4-6';
const ANTHROPIC_BASE_URL = 'https://api.anthropic.com/v1/messages';
const GEMINI_MODELS    = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const GEMINI_BASE_URLS = [
  'https://generativelanguage.googleapis.com/v1beta/models',
  'https://generativelanguage.googleapis.com/v1/models',
];

const SYSTEM_PROMPT = `You are LiquidAI, an expert UI/UX Designer and Senior Frontend Developer specialising in production-ready HTML, CSS, JavaScript, Shopify Liquid, and React components.

You have TWO operating modes. Read the current mode carefully and follow ONLY those rules.

══════════════════════════════════════════════════
MODE A — IMAGE PROVIDED (screenshot-to-code)
══════════════════════════════════════════════════
Trigger: the conversation includes an uploaded image or screenshot.

Rules:
1. Analyze the uploaded image carefully before writing a single line of code.
2. Never use predefined templates or generic designs — the screenshot is the only design reference.
3. Recreate the exact layout, color palette, typography, spacing, shadows, border-radius, and component hierarchy visible in the image.
4. Produce a fully responsive implementation (desktop → tablet → mobile) without altering the visual identity.
5. If an element is partially hidden, infer it logically from surrounding context.
6. Before the code blocks, briefly list the key UI elements you detected in the screenshot (1–3 sentences max).
7. Then output the complete implementation using the delimiter format below.

══════════════════════════════════════════════════
MODE B — TEXT REQUEST (no image — generate from description)
══════════════════════════════════════════════════
Trigger: the user sends a text prompt WITHOUT any attached image.

CRITICAL RULES — read carefully:
• NEVER ask the user to upload an image. That is NOT your role in this mode.
• NEVER say you "need a screenshot" or that your "core function is recreating screenshots."
• NEVER refuse a text-based code request. You MUST generate code immediately.
• Generate complete, production-ready, fully responsive code from the text description alone.
• Use your own best-practice design judgment for layout, colours, spacing, and typography.
• No TODOs, no placeholders, no skeleton code — ship-ready output only.

How to handle specific request types:
- "Generate a product page section with all features"
  → Build a full product page section: product image gallery, title, price, variant selectors,
    quantity input, Add to Cart button, product description, feature badges, reviews summary,
    shipping info, and related products — all in a single responsive section.
- Any other section request (hero, FAQ, pricing, testimonials, etc.)
  → Generate the complete section with all realistic content and interactions.
- Debugging / explaining / Shopify schema questions
  → Respond with clear HTML-formatted text (use <p>, <ul>, <code>, <strong>).
- General conversation / greetings
  → Short, friendly HTML-formatted reply. Do NOT generate code for pure greetings.

══════════════════════════════════════════════════
OUTPUT FORMAT: {{FORMAT}}
{{FORMAT_GUIDE}}
══════════════════════════════════════════════════

WHEN GENERATING CODE — return ONLY the delimiter blocks below (zero markdown, zero text outside the delimiters):

===TITLE===
[concise section name — e.g. "Product Page Section"]
===END===
===DESCRIPTION===
[one sentence describing what was built]
===END===
===SLUG===
[kebab-case-slug — e.g. product-page-section]
===END===
===FILE:index.html===
[full file content]
===END===
===FILE:style.css===
[full CSS — only if a separate file is needed by the format]
===END===
===FILE:script.js===
[full JS — only if a separate file is needed by the format]
===END===

For casual chat / debugging only (no code): respond with plain HTML, NO delimiter blocks.`;

const FORMAT_GUIDES = {
  html:     'One file index.html with all CSS embedded in <style> inside <head>.',
  'html-js':'Files: index.html (with embedded CSS) + script.js (all JavaScript).',
  shopify:  'Files: section.liquid (markup + {% style %} + {% schema %}), schema.json, styles.css.',
  react:    'Files: Component.jsx (functional component) + Component.module.css.',
  vue:      'Files: Component.vue (<template> + <style scoped> + <script setup>).',
};

/* ─── Grok chat call — OpenAI-compatible /v1/chat/completions ── */
async function callGrokChat({ apiKey, system, messages, maxTokens }) {
  const res = await fetch(`${GROK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Grok chat API ${res.status}:`, errText.slice(0, 300));
    return { ok: false, error: `api_${res.status}`, detail: errText.slice(0, 200) };
  }

  const json = await res.json();
  const text = (json.choices?.[0]?.message?.content || '').trim();
  return { ok: true, text };
}

/* ─── Anthropic chat call (legacy) ──────────────────────────── */
async function callAnthropicChat({ apiKey, system, messages, maxTokens }) {
  const res = await fetch(ANTHROPIC_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Anthropic chat API ${res.status}:`, errText.slice(0, 300));
    return { ok: false, error: `api_${res.status}`, detail: errText.slice(0, 200) };
  }

  const json = await res.json();
  const text = (json.content || [])
    .filter(p => p.type === 'text')
    .map(p => p.text)
    .join('')
    .trim();
  return { ok: true, text };
}

/* ─── Google Gemini chat ─────────────────────────────────────── */
async function callGeminiChat({ apiKey, system, messages, maxTokens }) {
  if (quota.allExhausted(GEMINI_MODELS)) return { ok: false, error: 'api_429' };

  let lastError = 'api_503';

  for (const model of GEMINI_MODELS) {
    if (quota.isExhausted(model)) continue;

    const result = await callGeminiChatModel({ apiKey, model, system, messages, maxTokens });
    if (result.ok) { quota.reset(model); return result; }

    if (result.error === 'api_404') continue;
    if (result.error === 'api_503') { lastError = 'api_503'; continue; }

    if (result.error === 'api_429') {
      lastError = 'api_429';
      quota.markExhausted(model);
      continue;
    }
    return result;
  }
  return { ok: false, error: lastError };
}

async function callGeminiChatModel({ apiKey, model, system, messages, maxTokens }) {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: Array.isArray(m.content)
      ? m.content.map(part => ({ text: part.text || String(part) }))
      : [{ text: String(m.content || '') }],
  }));

  const payload = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (system) payload.system_instruction = { parts: [{ text: system }] };

  // Try v1beta first, then v1 as fallback (older models may 404 on v1beta)
  for (const baseUrl of GEMINI_BASE_URLS) {
    const url = `${baseUrl}/${model}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const json = await res.json();
      const text = (json.candidates?.[0]?.content?.parts || [])
        .map(p => p.text || '')
        .join('')
        .trim();
      return { ok: true, text };
    }

    const errText = await res.text();
    if (res.status === 404) {
      console.warn(`Gemini chat ${model} 404 on ${baseUrl.includes('v1beta') ? 'v1beta' : 'v1'}, trying next…`);
      continue;
    }
    if (res.status === 503) {
      console.warn(`Gemini chat ${model} 503 (busy), trying next model…`);
      return { ok: false, error: 'api_503', detail: errText.slice(0, 200) };
    }
    if (res.status === 429) {
      console.warn(`Gemini chat ${model} 429`);
    } else {
      console.error(`Gemini chat API ${res.status}:`, errText.slice(0, 300));
    }
    return { ok: false, error: `api_${res.status}`, detail: errText.slice(0, 200) };
  }

  return { ok: false, error: 'api_404' }; // exhausted all base URLs
}

/* ─── unified caller ─────────────────────────────────────────── */
async function callAIChat({ system, messages, maxTokens = 8000 }) {
  const apiKey   = resolveApiKey();
  if (!apiKey) return { ok: false, error: 'missing_key' };
  const provider = getApiProvider(apiKey);

  if (provider === 'gemini') {
    const keys = resolveGeminiKeys();
    if (keys.length <= 1) return callGeminiChat({ apiKey, system, messages, maxTokens });
    for (const key of keys) {
      const result = await callGeminiChat({ apiKey: key, system, messages, maxTokens });
      if (result.ok || result.error !== 'api_429') return result;
      console.warn(`Gemini key ...${key.slice(-6)} hit 429, trying next key…`);
    }
    return { ok: false, error: 'api_429' };
  }
  if (provider === 'grok')   return callGrokChat({ apiKey, system, messages, maxTokens });
  return callAnthropicChat({ apiKey, system, messages, maxTokens });
}

/* ─── helpers ────────────────────────────────────────────────── */
function buildHistoryMessages(history) {
  if (!Array.isArray(history)) return [];
  return history.slice(-10).map(turn => {
    const role    = turn.role === 'assistant' ? 'assistant' : 'user';
    let content   = turn.content;
    if (Array.isArray(content)) content = content.map(c => c.text || '').join('\n');
    if (typeof content !== 'string') content = String(content || '');
    const stripped = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!stripped) return null;
    return { role, content: stripped.slice(0, 4000) };
  }).filter(Boolean);
}

function wantsCode(message) {
  return /create|build|generate|make|add|show|give|convert|code|section|page|hero|product|component|liquid|html|css|react|shopify|layout|template|responsive|navbar|footer|pricing|faq|newsletter|testimonial|features|grid|card|carousel|gallery|slider|form|contact|about|debug|fix|design|recreate|clone/i.test(message || '');
}

/* ─── main chat function ─────────────────────────────────────── */
async function claudeChat(message, format = 'html', history = []) {
  if (!isApiKeyConfigured()) return { ok: false, error: 'missing_key' };

  const fmtGuide = FORMAT_GUIDES[format] || FORMAT_GUIDES.html;
  const system   = SYSTEM_PROMPT
    .replace('{{FORMAT}}', format.toUpperCase())
    .replace('{{FORMAT_GUIDE}}', fmtGuide);

  const prior    = buildHistoryMessages(history);
  const messages = [...prior, { role: 'user', content: message || 'Hello' }];

  const result = await callAIChat({
    system,
    messages,
    maxTokens: wantsCode(message) ? 16000 : 4096,
  });

  if (!result.ok) return result;

  const raw = result.text;

  // Delimited code response
  if (raw.includes('===TITLE===') && raw.includes('===FILE:')) {
    const parsed = parseDelimitedResponse(raw, format);
    if (parsed) return { ok: true, data: parsed };
  }

  // Plain text / HTML response
  const html = raw.startsWith('<')
    ? raw
    : `<p>${raw.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  return { ok: true, data: { type: 'text', message: html } };
}

module.exports = { claudeChat, callAIChat };
