'use strict';

const { parseAiJson }    = require('./parseAiJson');
const { resolveApiKey, resolveGeminiKeys, isApiKeyConfigured, getApiProvider } = require('./env');
const quota = require('./quota');

const GROK_MODEL    = 'grok-4';
const GROK_BASE_URL = 'https://api.x.ai/v1';

const ANTHROPIC_VISION_MODEL = 'claude-sonnet-4-6';
const ANTHROPIC_BASE_URL     = 'https://api.anthropic.com/v1/messages';

// Only models confirmed working with AQ. key format — ordered by capability
const GEMINI_MODELS    = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
const GEMINI_BASE_URLS = [
  'https://generativelanguage.googleapis.com/v1beta/models',
  'https://generativelanguage.googleapis.com/v1/models',
];

/* ─── unified API caller ─────────────────────────────────────── */
async function callAI({ system, messages, maxTokens = 16000 }) {
  const apiKey  = resolveApiKey();
  if (!apiKey) return { ok: false, error: 'missing_key' };

  const provider = getApiProvider(apiKey);

  if (provider === 'gemini') {
    const keys = resolveGeminiKeys();
    if (keys.length <= 1) return callGemini({ apiKey, system, messages, maxTokens });
    for (const key of keys) {
      const result = await callGemini({ apiKey: key, system, messages, maxTokens });
      if (result.ok || result.error !== 'api_429') return result;
      console.warn(`Gemini key ...${key.slice(-6)} hit 429, trying next key…`);
    }
    return { ok: false, error: 'api_429' };
  }
  if (provider === 'grok')   return callGrok({ apiKey, system, messages, maxTokens });
  return callAnthropic({ apiKey, system, messages, maxTokens });
}

/* ─── Google Gemini ──────────────────────────────────────────── */
async function callGemini({ apiKey, system, messages, maxTokens }) {
  // Check if ALL models are on cooldown before making any requests
  if (quota.allExhausted(GEMINI_MODELS)) return { ok: false, error: 'api_429' };

  let lastError = 'api_503';

  for (const model of GEMINI_MODELS) {
    // Skip this model if it's individually on cooldown
    if (quota.isExhausted(model)) continue;

    const result = await callGeminiModel({ apiKey, model, system, messages, maxTokens });
    if (result.ok) { quota.reset(model); return result; }

    if (result.error === 'api_404') continue;
    if (result.error === 'api_503') { lastError = 'api_503'; continue; }

    if (result.error === 'api_429') {
      lastError = 'api_429';
      quota.markExhausted(model); // only cooldown THIS model, not others
      continue;
    }
    return result; // 400, 401, 500 — surface immediately
  }
  return { ok: false, error: lastError };
}

async function callGeminiModel({ apiKey, model, system, messages, maxTokens }) {
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: Array.isArray(m.content)
      ? m.content.map(part => {
          if (part.type === 'image') {
            return { inline_data: { mime_type: part.source.media_type, data: part.source.data } };
          }
          return { text: part.text || '' };
        })
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
      return { ok: true, text, stopReason: json.candidates?.[0]?.finishReason };
    }

    const errText = await res.text();
    if (res.status === 404) {
      console.warn(`Gemini ${model} 404 on ${baseUrl.includes('v1beta') ? 'v1beta' : 'v1'}, trying next…`);
      continue; // try next base URL
    }
    if (res.status === 503) {
      console.warn(`Gemini ${model} 503 (busy), trying next model…`);
      return { ok: false, error: 'api_503', detail: errText.slice(0, 200) };
    }
    if (res.status === 429) {
      console.warn(`Gemini ${model} 429`);
    } else {
      console.error(`Gemini API ${res.status}:`, errText.slice(0, 300));
    }
    return { ok: false, error: `api_${res.status}`, detail: errText.slice(0, 200) };
  }

  return { ok: false, error: 'api_404' }; // exhausted all base URLs
}

/* ─── Grok (xAI) — OpenAI-compatible /v1/chat/completions ───── */
async function callGrok({ apiKey, system, messages, maxTokens }) {
  const payload = {
    model: GROK_MODEL,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      ...messages.map(m => ({
        role: m.role,
        content: Array.isArray(m.content)
          ? m.content.map(part => {
              if (part.type === 'image') {
                return {
                  type: 'image_url',
                  image_url: {
                    url: `data:${part.source.media_type};base64,${part.source.data}`,
                  },
                };
              }
              return { type: 'text', text: part.text };
            })
          : m.content,
      })),
    ],
  };

  const res = await fetch(`${GROK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Grok API ${res.status}:`, errText.slice(0, 300));
    return { ok: false, error: `api_${res.status}`, detail: errText.slice(0, 200) };
  }

  const json = await res.json();
  const text = (json.choices?.[0]?.message?.content || '').trim();
  return { ok: true, text, stopReason: json.choices?.[0]?.finish_reason };
}

/* ─── Anthropic (legacy fallback) ───────────────────────────── */
async function callAnthropic({ apiKey, system, messages, maxTokens }) {
  const res = await fetch(ANTHROPIC_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_VISION_MODEL,
      max_tokens: maxTokens,
      system,
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Anthropic API ${res.status}:`, errText.slice(0, 300));
    return { ok: false, error: `api_${res.status}`, detail: errText.slice(0, 200) };
  }

  const json = await res.json();
  const text = (json.content || [])
    .filter(p => p.type === 'text')
    .map(p => p.text)
    .join('')
    .trim();
  return { ok: true, text, stopReason: json.stop_reason };
}

/* ─── helpers ────────────────────────────────────────────────── */
function hasVisionKey() { return isApiKeyConfigured(); }

function imageBlock(imageBase64, mediaType) {
  return {
    type: 'image',
    source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 },
  };
}

function formatGuide(format) {
  const guides = {
    html:     'Produce ONE file named index.html — complete HTML page with ALL CSS in a <style> block inside <head>. No external CSS files.',
    'html-js':'Produce TWO files: index.html (HTML + embedded <style> in <head> + <script src="script.js"> before </body>) and script.js (all JavaScript).',
    shopify:  'Produce THREE files: section.liquid (markup + {% style %}...{% endstyle %} + {% schema %}...{% endschema %}), schema.json (schema object only), styles.css (raw CSS mirror).',
    react:    'Produce TWO files: Component.jsx (React functional component with className) and Component.module.css (CSS module).',
    vue:      'Produce ONE file: Component.vue (Vue 3 SFC with <template>, <style scoped>, <script setup>).',
  };
  return guides[format] || guides.html;
}

function formatFileExamples(format) {
  const examples = {
    html: `===FILE:index.html===\n[complete single HTML file with embedded CSS]\n===END===`,
    'html-js': `===FILE:index.html===\n[complete HTML file]\n===END===\n===FILE:script.js===\n[complete JS file]\n===END===`,
    shopify: `===FILE:section.liquid===\n[complete Shopify section]\n===END===\n===FILE:schema.json===\n[schema JSON object]\n===END===\n===FILE:styles.css===\n[raw CSS]\n===END===`,
    react: `===FILE:Component.jsx===\n[complete React component]\n===END===\n===FILE:Component.module.css===\n[complete CSS module]\n===END===`,
    vue: `===FILE:Component.vue===\n[complete Vue SFC]\n===END===`,
  };
  return examples[format] || examples.html;
}

function parseMarkdownCodeBlocks(raw) {
  const files  = [];
  const rx     = /```(\w+)?\s*\n([\s\S]*?)```/g;
  const langMap = { html:'html', css:'css', javascript:'js', js:'js', jsx:'jsx', tsx:'tsx', vue:'vue', liquid:'liquid', json:'json' };
  let m;
  while ((m = rx.exec(raw)) !== null) {
    const lang    = (m[1] || '').toLowerCase();
    const content = m[2].trim();
    if (!content) continue;
    let name = 'index.html';
    if (lang === 'css' || lang === 'scss') name = lang === 'scss' ? 'styles.scss' : 'style.css';
    else if (lang === 'javascript' || lang === 'js') name = 'script.js';
    else if (lang === 'jsx') name = 'Component.jsx';
    else if (lang === 'tsx') name = 'Component.tsx';
    else if (lang === 'vue') name = 'Component.vue';
    else if (lang === 'liquid') name = 'section.liquid';
    else if (lang === 'json') name = 'schema.json';
    files.push({ name, content, lang: langMap[lang] || lang || 'text' });
  }
  return files.length ? files : null;
}

function parseDelimitedResponse(raw, format) {
  function extract(tag) {
    const rx = new RegExp(`===\\s*${tag}\\s*===([\\s\\S]*?)===\\s*END\\s*===`, 'i');
    const m  = raw.match(rx);
    return m ? m[1].trim() : '';
  }

  const title       = extract('TITLE')       || 'Generated from Screenshot';
  const description = extract('DESCRIPTION') || 'Code generated from uploaded screenshot.';
  const sectionName = extract('SLUG')        || 'screenshot-output';

  const fileRx = /===\s*FILE:\s*([^\s=]+)\s*===([\s\S]*?)===\s*END\s*===/gi;
  const files  = [];
  let m;
  while ((m = fileRx.exec(raw)) !== null) {
    const name    = m[1].trim();
    const content = m[2].trim();
    const ext     = name.split('.').pop().toLowerCase();
    const langMap = { html:'html', css:'css', js:'js', jsx:'jsx', tsx:'tsx', vue:'vue', liquid:'liquid', json:'json', scss:'scss' };
    files.push({ name, content, lang: langMap[ext] || ext });
  }

  if (!files.length) {
    const mdFiles = parseMarkdownCodeBlocks(raw);
    if (mdFiles) files.push(...mdFiles);
  }
  if (!files.length) return null;

  const hf = files.find(f => f.lang === 'html' || f.name.endsWith('.html'));
  const cf = files.find(f => f.lang === 'css'  || f.name.endsWith('.css'));
  const jf = files.find(f => (f.lang === 'js'  || f.name.endsWith('.js')) && !f.name.endsWith('.jsx'));

  let preview_html = '';
  if (hf) {
    preview_html = /<html/i.test(hf.content)
      ? hf.content
      : `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${cf ? `<style>${cf.content}</style>` : ''}</head><body>${hf.content}${jf ? `<script>${jf.content}</script>` : ''}</body></html>`;
  } else {
    const fc  = files[0]?.content || '';
    const tm  = fc.match(/<template>([\s\S]*?)<\/template>/i);
    const sm  = fc.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (tm) {
      preview_html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${sm ? `<style>${sm[1]}</style>` : ''}</head><body>${tm[1]}</body></html>`;
    }
  }

  return {
    type: 'code', format, section_name: sectionName, title, description,
    message: `<p>✦ Generated <strong>${title}</strong> directly from your screenshot using AI vision.</p><p>${description}</p><p>Files: ${files.map(f => `<code>${f.name}</code>`).join(', ')}</p>`,
    files, preview_html,
  };
}

/* ─── Step 1: Analyze screenshot ─────────────────────────────── */
async function analyzeScreenshot(imageBase64, mediaType, sendStatus) {
  sendStatus('Step 1/2: Analyzing layout, colors, typography, components…');

  const system = `You are an expert UI/UX and Frontend Developer acting as a screenshot-to-code analysis engine.

YOUR ONLY JOB: analyze the uploaded screenshot carefully and return precise structured JSON.

ABSOLUTE RULES — NEVER BREAK:
- Screenshot is the SINGLE SOURCE OF TRUTH — analyze ONLY what is physically visible
- Do NOT add, suggest, or invent elements not visible in the image
- Do NOT reference prior conversations, cached outputs, or templates
- Do NOT use any predefined templates, default layouts, placeholder sections, or generic designs
- Scope must match EXACTLY what is shown — one section visible = one section in JSON
- Count the EXACT number of columns, cards, buttons, and text blocks visible
- Extract EVERY exact text string visible in the image (top-to-bottom, left-to-right)
- Extract exact hex color values from every visible element
- Measure approximate spacing, padding, margin, and border-radius values
- If any element is partially hidden, infer it logically based on surrounding UI
- CRITICAL: Return ONLY raw JSON — no markdown fences, no backticks, no explanation text

Return ONLY valid raw JSON (no markdown, no backticks, no text before or after):
{
  "designType": "section|homepage|shopify-section|mobile-app|component|landing-page|card|form|navbar|hero|grid|pricing|contact",
  "scope": "exact precise description of ONLY what is visible — nothing more",
  "totalSections": 0,
  "sections": [{"name":"","layout":"","elements":[],"position":"","columnCount":0}],
  "layout": {"type":"flex|grid|block","columns":0,"rows":0,"maxWidth":"","alignment":"","gaps":"","padding":"","margins":""},
  "colors": {"backgrounds":[],"text":[],"accents":[],"borders":[],"cards":[],"buttons":[]},
  "typography": {"fonts":[],"headingSizes":[],"bodySizes":[],"weights":[],"lineHeights":[]},
  "spacing": {"sectionPadding":"","elementGaps":"","cardPadding":"","borderRadius":"","boxShadow":""},
  "components": [{"type":"","label":"","styles":"","position":"","count":0}],
  "visibleText": ["every exact text string visible in order top-to-bottom left-to-right"],
  "images": [{"description":"","aspectRatio":"","position":"","hasOverlay":false}],
  "navigation": {"present":false,"items":[],"style":""},
  "buttons": [{"label":"","variant":"primary|secondary|outline|ghost","color":"","size":""}],
  "forms": [{"fields":[],"layout":"","submitLabel":""}],
  "icons": [{"type":"","position":"","size":""}],
  "responsiveHints": "observed breakpoints or stacking behavior"
}`;

  const result = await callAI({
    system,
    maxTokens: 4096,
    messages: [{
      role: 'user',
      content: [
        imageBlock(imageBase64, mediaType),
        { type: 'text', text: 'Analyze ONLY this screenshot. Return raw JSON only — no markdown fences, no backticks, no explanation. Start your response with { and end with }.' },
      ],
    }],
  });

  if (!result.ok) return { ok: false, error: result.error, detail: result.detail };

  // Strip any markdown fences the model added despite instructions
  let cleaned = result.text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const analysis = parseAiJson(cleaned);
  if (!analysis || analysis.error) {
    console.warn('Vision analysis JSON parse failed — falling back to direct generation. Raw:', cleaned.slice(0, 200));
    return { ok: false, error: 'analysis_parse_failed', fallbackToDirectGeneration: true };
  }
  return { ok: true, analysis };
}

/* ─── Shared code-generation system prompt ───────────────────── */
function buildCodeGenSystem(format) {
  return `You are an expert UI/UX Designer and Senior Frontend Developer.

YOUR ONLY TASK: generate production-ready code that EXACTLY recreates the uploaded screenshot.

══════════════════════════════════════════════════
STRICT RULES — DO NOT BREAK ANY OF THESE
══════════════════════════════════════════════════
1. The uploaded screenshot is the SINGLE SOURCE OF TRUTH.
2. Do NOT use any predefined templates, generic layouts, placeholder sections, or random UI components.
3. Analyze the screenshot carefully — recreate ONLY what is physically visible in the image.
4. If the user asks for a Header, return ONLY the header code.
   If the user asks for a Banner/Hero, return ONLY the banner code.
   If the user asks for a Footer, return ONLY the footer code.
   Never add extra sections that are not present in the screenshot.
5. Match EXACTLY: layout, spacing, colors, typography, alignment, and component hierarchy.
6. Do NOT invent content, sections, images, menus, buttons, cards, or features not visible in the screenshot.
7. If any element is partially hidden or unclear, infer it logically from the visual structure — do not replace with a generic template.
8. Reproduce the exact color palette — do not change, simplify, or substitute any colors.
9. Reproduce the exact layout — do not add columns, remove sections, or rearrange elements.
10. Never generate a generic hero, generic cards, or any default website template.
11. Generate a fully responsive version: Desktop (pixel-perfect match) → Tablet ≤1024px → Mobile ≤768px.
12. Use semantic, production-ready HTML with optimized CSS. No TODOs, no placeholders.
13. Use the responsive breakpoints ONLY to adjust layout — the visual identity must stay identical.

FAILURE CONDITION: Generating a generic template, unrelated section, or different design than the screenshot is an INCORRECT response. Always prioritize image analysis over any template.

══════════════════════════════════════════════════
OUTPUT FORMAT: ${format.toUpperCase()}
${formatGuide(format)}
══════════════════════════════════════════════════

RESPONSE FORMAT — use EXACTLY these delimiters, NO text/markdown/explanations outside them:

===TITLE===
[short name of exactly what is shown in the screenshot]
===END===
===DESCRIPTION===
[one sentence describing the exact UI visible in the screenshot]
===END===
===SLUG===
[kebab-case-slug]
===END===
${formatFileExamples(format)}`;
}

/* ─── Step 2: Generate code from screenshot (with analysis) ─── */
async function generateCodeFromScreenshot(imageBase64, mediaType, analysis, userPrompt, format, sendStatus) {
  sendStatus('Step 2/2: Generating pixel-perfect code from your design…');

  const userText = [
    'Recreate this screenshot exactly. Do NOT use templates or generic components.',
    '',
    'SCREENSHOT ANALYSIS (use this to guide your implementation):',
    JSON.stringify(analysis, null, 2),
    userPrompt ? `\nUSER REQUEST: ${userPrompt}` : '',
    '',
    'Generate complete production-ready code now. Match every visual detail visible in the screenshot.',
  ].filter(Boolean).join('\n');

  const result = await callAI({
    system: buildCodeGenSystem(format),
    maxTokens: 16000,
    messages: [{
      role: 'user',
      content: [
        imageBlock(imageBase64, mediaType),
        { type: 'text', text: userText },
      ],
    }],
  });

  if (!result.ok) return { ok: false, error: result.error, detail: result.detail };

  const parsed = parseDelimitedResponse(result.text, format);
  if (!parsed) {
    console.error('Code parse failed. Raw (first 400):', result.text.slice(0, 400));
    if (result.stopReason === 'max_tokens' || result.stopReason === 'length') {
      return { ok: false, error: 'response_truncated' };
    }
    return { ok: false, error: 'code_parse_failed' };
  }
  return { ok: true, data: parsed };
}

/* ─── Direct generation (fallback — no JSON analysis step) ──── */
async function generateCodeDirect(imageBase64, mediaType, userPrompt, format, sendStatus) {
  sendStatus('Analyzing screenshot and generating code directly…');

  const userText = [
    'Look carefully at this screenshot. Recreate it exactly — do NOT use templates or generic designs.',
    userPrompt ? `USER REQUEST: ${userPrompt}` : '',
    '',
    'Before generating code, briefly describe (1–2 sentences) the layout, colors, and key components you can see.',
    'Then generate complete production-ready code that matches the screenshot precisely.',
  ].filter(Boolean).join('\n');

  const result = await callAI({
    system: buildCodeGenSystem(format),
    maxTokens: 16000,
    messages: [{
      role: 'user',
      content: [
        imageBlock(imageBase64, mediaType),
        { type: 'text', text: userText },
      ],
    }],
  });

  if (!result.ok) return { ok: false, error: result.error, detail: result.detail };

  const parsed = parseDelimitedResponse(result.text, format);
  if (!parsed) {
    console.error('Direct code parse failed. Raw (first 400):', result.text.slice(0, 400));
    if (result.stopReason === 'max_tokens' || result.stopReason === 'length') {
      return { ok: false, error: 'response_truncated' };
    }
    return { ok: false, error: 'code_parse_failed' };
  }
  return { ok: true, data: parsed };
}

/* ─── Main vision pipeline ───────────────────────────────────── */
async function claudeVision(imageBase64, mediaType, userPrompt, format, sendStatus) {
  if (!hasVisionKey()) {
    const { getApiKeyStatus, resolveApiKey } = require('./env');
    const status = getApiKeyStatus(resolveApiKey());
    return { ok: false, error: status === 'placeholder' ? 'placeholder_key' : 'missing_key' };
  }

  const analysisResult = await analyzeScreenshot(imageBase64, mediaType, sendStatus);

  // If analysis step produced a parseable JSON, use it to guide code generation
  if (analysisResult.ok) {
    return generateCodeFromScreenshot(
      imageBase64, mediaType,
      analysisResult.analysis,
      userPrompt, format, sendStatus,
    );
  }

  // If analysis failed but the API itself worked, fall back to direct single-step generation
  // instead of showing an error — this handles models that wrap JSON in markdown fences
  if (analysisResult.fallbackToDirectGeneration) {
    console.warn('Analysis step failed — falling back to direct generation');
    return generateCodeDirect(imageBase64, mediaType, userPrompt, format, sendStatus);
  }

  // Hard API errors (missing key, 401, 429, etc.) — surface them to the user
  return analysisResult;
}

function visionErrorMessage(error) {
  const messages = {
    missing_key:          'No API key set. Add GEMINI_API_KEY=AIza... to your .env file (free key at aistudio.google.com) then restart the server.',
    placeholder_key:      'Your .env still has the placeholder key. Paste your real API key.',
    api_400:              'Bad request — the image may be too large or in an unsupported format. Try a smaller/cropped image.',
    api_401:              'Invalid API key — authentication failed. Check your API key in .env.',
    api_403:              'API access denied. Check your API key has the right permissions or has available quota.',
    api_429:              'Gemini free-tier quota exhausted for today. Options: (1) wait until midnight Pacific time for quota to reset, (2) add a second free key — GEMINI_API_KEY_2=AIza… in .env from a different Google account, or (3) upgrade to a paid Gemini plan at aistudio.google.com.',
    api_500:              'AI API server error. Please try again shortly.',
    analysis_parse_failed:'AI could not analyze the screenshot. Try a clearer image or a smaller crop.',
    code_parse_failed:    'AI generated a response but it could not be parsed. Please try again.',
    response_truncated:   'The design was too large and the response was truncated. Try uploading a single section instead of a full page.',
  };
  if (messages[error]) return messages[error];
  if (error?.startsWith('api_')) return `API error (${error.replace('api_', '')}). Please try again.`;
  return 'Image-to-code generation failed. Please try again.';
}

module.exports = {
  hasVisionKey,
  claudeVision,
  parseDelimitedResponse,
  visionErrorMessage,
};
