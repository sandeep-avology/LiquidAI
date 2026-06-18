'use strict';
const fs   = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const ROOT = path.join(__dirname, '..');

function loadEnvFiles() {
  const files  = ['.env.local', '.env'];
  const loaded = [];
  for (const file of files) {
    const fullPath = path.join(ROOT, file);
    if (fs.existsSync(fullPath)) {
      dotenv.config({ path: fullPath, override: true });
      loaded.push(file);
    }
  }
  return loaded;
}

function cleanKey(value) {
  let k = String(value || '');
  k = k.replace(/[﻿​-‍]/g, '').trim();
  // Strip file path prefix e.g. ".env:" or "path/.env:"
  k = k.replace(/^.*?\.env\s*[:\s]+/i, '');
  // Strip export keyword
  k = k.replace(/^export\s+/i, '');
  // Strip variable name prefix
  k = k.replace(/^(?:XAI_API_KEY|GROK_API_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY|ANTHROPIC_AUTH_TOKEN|GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*/i, '');
  // Strip Bearer prefix
  k = k.replace(/^Bearer\s+/i, '');
  // Strip surrounding quotes
  k = k.replace(/^['"`]|['"`]$/g, '');
  // Remove all whitespace
  k = k.replace(/\s+/g, '');
  return k;
}

function getApiKeyStatus(key) {
  if (!key) return 'missing';
  if (key === 'missing-key') return 'missing';
  if (/YOUR_KEY_HERE|YOUR_REAL_KEY|xxx{3,}|changeme|PLACEHOLDER|EXAMPLE/i.test(key) && key.length < 60) return 'placeholder';
  // Google Gemini keys — AIza... (classic) or AQ.... (newer format)
  if (/^AIza[a-zA-Z0-9_-]{30,}$/.test(key)) return 'configured';
  if (/^AQ\.[a-zA-Z0-9_-]{20,}$/.test(key)) return 'configured';
  // xAI Grok keys start with xai-
  if (/^xai-[a-zA-Z0-9_-]{20,}$/.test(key)) return 'configured';
  // Anthropic keys (legacy support)
  if (/^sk-ant-[a-zA-Z0-9_-]{10,}$/.test(key)) return 'configured';
  if (/^sk-[a-zA-Z0-9_-]{20,}$/.test(key)) return 'configured';
  // any long token-like secret (40+ chars)
  if (/^[a-zA-Z0-9_-]{40,}$/.test(key)) return 'configured';
  if (key.length >= 20 && /^[a-zA-Z0-9_.\-]+$/.test(key)) return 'configured';
  return 'invalid_format';
}

function resolveApiKey() {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.ANTHROPIC_API_KEY,
    process.env.ANTHROPIC_AUTH_TOKEN,
    process.env.CLAUDE_API_KEY,
    process.env.XAI_API_KEY,
    process.env.GROK_API_KEY,
  ];
  return candidates.map(cleanKey).find(Boolean) || '';
}

function resolveGeminiKeys() {
  const primary = resolveApiKey();
  if (!primary || getApiProvider(primary) !== 'gemini') return [];
  const extras = [
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ].map(cleanKey).filter(k => k && k !== primary && (
    /^AIza[a-zA-Z0-9_-]{30,}$/.test(k) || /^AQ\.[a-zA-Z0-9_-]{20,}$/.test(k)
  ));
  return [primary, ...extras];
}

function getApiProvider(key) {
  if (!key) return 'none';
  if (/^AIza/.test(key)) return 'gemini';
  if (/^AQ\./.test(key))  return 'gemini';
  if (/^sk-ant-/.test(key)) return 'anthropic';
  if (/^xai-/.test(key)) return 'grok';
  return 'anthropic';
}

function logStartup(loadedFiles, port) {
  const key    = resolveApiKey();
  const status = getApiKeyStatus(key);
  const provider = getApiProvider(key);
  const envFound = loadedFiles.length > 0;

  console.log('\n  ── LiquidAI Startup ──────────────────────────');
  console.log(`  .env found:   ${envFound ? 'yes (' + loadedFiles.join(', ') + ')' : 'no — copy .env.example to .env'}`);
  const providerLabel = { anthropic: 'Anthropic (Claude)', grok: 'Grok (xAI)', gemini: 'Google Gemini' }[provider] || 'none';
  console.log(`  AI Provider:  ${providerLabel}`);
  console.log(`  API Key:      ${status === 'configured' ? 'set (...' + key.slice(-6) + ')' : status}`);
  console.log(`  API port:     ${port}`);
  console.log('  ───────────────────────────────────────────────\n');

  if (status === 'missing') {
    const providerHelp = {
      gemini:    'GEMINI_API_KEY  →  https://aistudio.google.com/apikey',
      grok:      'XAI_API_KEY     →  https://console.x.ai',
      anthropic: 'ANTHROPIC_API_KEY → https://console.anthropic.com',
    };
    console.warn(`  ⚠  No API key found. Add to .env: ${providerHelp[provider] || providerHelp.gemini}\n`);
  } else if (status === 'placeholder' || status === 'invalid_format') {
    console.warn('  ⚠  Replace the placeholder in .env with your real API key.\n');
  }
}

function saveApiKey(rawKey) {
  const key    = cleanKey(rawKey);
  const status = getApiKeyStatus(key);
  if (status !== 'configured') {
    const err = new Error(
      status === 'placeholder'
        ? 'That still looks like the example placeholder. Paste your real key from console.x.ai.'
        : 'Could not recognize that API key. Paste your full Grok key (starts with xai-). Copy only the key, not the whole .env line.'
    );
    err.code = status === 'placeholder' ? 'placeholder_key' : 'invalid_format';
    throw err;
  }

  const envPath = path.join(ROOT, '.env');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  const isGemini = /^AIza/.test(key) || /^AQ\./.test(key);
  const isGrok   = /^xai-/.test(key);
  const varName  = isGemini ? 'GEMINI_API_KEY' : isGrok ? 'XAI_API_KEY' : 'ANTHROPIC_API_KEY';
  const varRx    = new RegExp(`^(?:GEMINI_API_KEY|XAI_API_KEY|ANTHROPIC_API_KEY)=.*$`, 'm');

  if (varRx.test(content)) {
    content = content.replace(varRx, `${varName}=${key}`);
  } else {
    if (content.length && !content.endsWith('\n')) content += '\n';
    content += `${varName}=${key}\n`;
  }

  fs.writeFileSync(envPath, content, 'utf8');
  process.env[varName] = key;
  return { status: 'configured', visionEnabled: true };
}

function getVisionStatus() {
  const key      = resolveApiKey();
  const apiKeyStatus = getApiKeyStatus(key);
  const provider = getApiProvider(key);
  const quota    = require('./quota');
  const MODELS   = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  return {
    visionEnabled:    apiKeyStatus === 'configured',
    apiKeyStatus,
    apiKeyConfigured: apiKeyStatus === 'configured',
    provider,
    quotaExhausted:   quota.allExhausted(MODELS),
    quotaResetsAt:    quota.resetsAt(MODELS),
  };
}

module.exports = {
  ROOT,
  loadEnvFiles,
  resolveApiKey,
  resolveGeminiKeys,
  getApiKeyStatus,
  getApiProvider,
  logStartup,
  saveApiKey,
  getVisionStatus,
  isApiKeyConfigured: () => getApiKeyStatus(resolveApiKey()) === 'configured',
};
