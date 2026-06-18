/* ── helpers ── */
function getToken() { return localStorage.getItem('liquidai_token') || ''; }

async function parseJSON(res) {
  const text = await res.text();
  if (text.trim().startsWith('<')) {
    // Server returned HTML — most likely not running
    throw new Error('Cannot reach the server. Make sure it is running: npm run dev');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Server returned an unexpected response. Try restarting: npm run dev');
  }
}

/* ── auth ── */
export async function authRegister({ name, email, password }) {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await parseJSON(res);
  if (!res.ok) throw new Error(data.error || 'Registration failed');
  return data;
}

export async function authLogin({ email, password }) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJSON(res);
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

export async function authLogout() {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}` },
  }).catch(() => {});
}

export async function authMe() {
  const res = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error('Not authenticated');
  const data = await parseJSON(res);
  return data;
}

/* ── code generation ── */
export async function callChatAPI({ message, imageBase64, mediaType, format = 'html', colorPalette, history = [], signal, onStatus }) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({
      message,
      imageBase64,
      mediaType,
      format,
      colorPalette,
      // Never send conversation history with image uploads — each screenshot is a fresh request
      history: imageBase64 ? [] : history.slice(-10),
      imageSessionId: imageBase64 ? Date.now() : undefined,
    }),
    signal,
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('SESSION_EXPIRED');
    throw new Error(`Server error: ${res.status}`);
  }
  return readSSE(res, onStatus);
}

export async function fetchVisionStatus() {
  const res = await fetch('/api/vision-status', {
    headers: { Authorization: `Bearer ${getToken()}` },
  }).catch(() => null);
  if (!res?.ok) {
    return { serverReachable: false, visionEnabled: false, apiKeyConfigured: false, apiKeyStatus: 'missing' };
  }
  return parseJSON(res);
}

export function cleanApiKeyInput(value) {
  let k = String(value || '').replace(/[\uFEFF\u200B-\u200D]/g, '').trim();
  // Strip file path prefix e.g. ".env:" or "path/.env:"
  k = k.replace(/^.*?\.env\s*[:\s]+/i, '');
  // Strip export keyword
  k = k.replace(/^export\s+/i, '');
  // Strip variable name prefix (any known key name followed by =)
  k = k.replace(/^(?:GEMINI_API_KEY|GOOGLE_API_KEY|XAI_API_KEY|GROK_API_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY|ANTHROPIC_AUTH_TOKEN)\s*=\s*/i, '');
  // Strip Bearer prefix
  k = k.replace(/^Bearer\s+/i, '');
  // Strip surrounding quotes
  k = k.replace(/^['"`]|['"`]$/g, '');
  // Remove all whitespace
  return k.replace(/\s+/g, '');
}

export async function saveApiKey(apiKey) {
  const res = await fetch('/api/settings/api-key', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ apiKey }),
  });
  const data = await parseJSON(res);
  if (!res.ok) throw new Error(data.error || 'Failed to save API key');
  return data;
}

export async function callAnalyzeImageAPI({ imageBase64, mediaType, userPrompt, format = 'html', colorPalette, signal, onStatus }) {
  const res = await fetch('/api/analyze-image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({
      imageBase64,
      mediaType,
      userPrompt,
      format,
      colorPalette,
      imageSessionId: Date.now(),
    }),
    signal,
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('SESSION_EXPIRED');
    throw new Error(`Server error: ${res.status}`);
  }
  return readSSE(res, onStatus);
}

async function readSSE(res, onStatus) {
  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      let evt;
      try { evt = JSON.parse(raw); } catch { continue; }
      if (evt.type === 'status')        onStatus?.(evt.message);
      else if (evt.type === 'complete') return evt.data;
      else if (evt.type === 'error')    throw new Error(evt.message);
    }
  }
  throw new Error('Stream ended without a complete event');
}
