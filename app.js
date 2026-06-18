// ── State ──
let attachedFiles = [];
let currentCode = { liquid: '', schema: '', css: '', js: '' };
let activeTab = 'liquid';
let chatActive = false;
let messageCount = 0;
let isFigmaMode = false;
let isCodeMode = false;
let codePanelOpen = false;
let pendingImageFile = null;   // the image File waiting for analysis
let analysisAbortCtrl = null;  // AbortController for in-flight SSE
let chatHistory = [];          // conversation history for /api/chat
let chatAbortCtrl = null;      // AbortController for in-flight chat SSE

// ── DOM refs ──
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const messagesEl = document.getElementById('messages');
const messagesContainer = document.getElementById('messagesContainer');
const welcomeScreen = document.getElementById('welcomeScreen');
const filePreviews = document.getElementById('filePreviews');
const fileInput = document.getElementById('fileInput');
const codePanel = document.getElementById('codePanel');
const codeContent = document.getElementById('codeContent');
const chatTitle = document.getElementById('chatTitle');
const sidebar = document.getElementById('sidebar');
const dragOverlay = document.getElementById('dragOverlay');
const toast = document.getElementById('toast');

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  setupDragDrop();
  chatInput.addEventListener('input', updateCharCount);

  document.getElementById('codePanelTabs').addEventListener('click', e => {
    const btn = e.target.closest('.code-tab');
    if (!btn) return;
    switchToTab(btn.dataset.tab);
  });

  document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
  });
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
  });

  // Analysis overlay wiring
  document.getElementById('analysisClose').addEventListener('click', closeAnalysis);
  document.getElementById('analysisCancelBtn').addEventListener('click', closeAnalysis);
  document.getElementById('analysisRunBtn').addEventListener('click', runImageAnalysis);

  // Close overlay on backdrop click
  document.getElementById('analysisOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('analysisOverlay')) closeAnalysis();
  });
});

// ── Helpers ──
function showToast(msg, dur = 2000) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), dur);
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 200) + 'px';
}

function updateCharCount() {
  const len = chatInput.value.length;
  const el = document.getElementById('charCount');
  el.textContent = len > 50 ? len : '';
}

function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ── File handling ──
function triggerFileUpload() { fileInput.click(); }

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  files.forEach(addFile);
  fileInput.value = '';
}

function addFile(file) {
  if (attachedFiles.find(f => f.name === file.name)) return;
  attachedFiles.push(file);
  renderFilePreviews();

  // If an image was just attached, store it and reveal the Analyze button
  if (file.type && file.type.startsWith('image/')) {
    pendingImageFile = file;
    document.getElementById('analyzeImageTrigger').classList.add('visible');
  }
}

function removeFile(name) {
  attachedFiles = attachedFiles.filter(f => f.name !== name);
  if (pendingImageFile && pendingImageFile.name === name) {
    pendingImageFile = null;
  }
  const hasImage = attachedFiles.some(f => f.type && f.type.startsWith('image/'));
  if (!hasImage) {
    pendingImageFile = null;
    document.getElementById('analyzeImageTrigger').classList.remove('visible');
  }
  renderFilePreviews();
}

function renderFilePreviews() {
  filePreviews.innerHTML = '';
  attachedFiles.forEach(file => {
    const chip = document.createElement('div');
    chip.className = 'file-preview-chip';
    const icon = getFileIcon(file.name);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      chip.innerHTML = `<img src="${url}" class="chip-img" alt="${file.name}"><span class="chip-name">${file.name}</span><button class="chip-remove" onclick="removeFile('${file.name}')">×</button>`;
    } else {
      chip.innerHTML = `${icon}<span class="chip-name">${file.name}</span><button class="chip-remove" onclick="removeFile('${file.name}')">×</button>`;
    }
    filePreviews.appendChild(chip);
  });
}

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    liquid: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 3L1 7L4 11M10 3L13 7L10 11M7 2L7.5 12" stroke="#00D084" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    html: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2.5L3.5 11.5L7 12.5L10.5 11.5L12 2.5" stroke="#FFA657" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    css: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="#79C0FF" stroke-width="1.4"/></svg>`,
    js: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="2" width="10" height="10" rx="2" stroke="#F0D080" stroke-width="1.4"/></svg>`,
    json: `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7c0-2 1-3 2-3s2 1 2 2-1 2-2 2 2 0 2 2-1 2-2 2-2-1-2-3" stroke="#D2A8FF" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  };
  return icons[ext] || `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 2h5.5L11 4.5V12H3V2z" stroke="currentColor" stroke-width="1.4"/></svg>`;
}

// ── Drag & Drop ──
function setupDragDrop() {
  const inputArea = document.getElementById('inputArea');
  inputArea.addEventListener('dragover', e => { e.preventDefault(); dragOverlay.classList.add('active'); });
  inputArea.addEventListener('dragleave', e => { if (!inputArea.contains(e.relatedTarget)) dragOverlay.classList.remove('active'); });
  inputArea.addEventListener('drop', e => {
    e.preventDefault();
    dragOverlay.classList.remove('active');
    Array.from(e.dataTransfer.files).forEach(addFile);
  });
}

// ── Mode toggles ──
function toggleMode(mode) {
  if (mode === 'figma') {
    isFigmaMode = !isFigmaMode;
    const panel = document.getElementById('figmaPanel');
    const btn = document.getElementById('figmaBtn');
    panel.style.display = isFigmaMode ? 'block' : 'none';
    btn.classList.toggle('active', isFigmaMode);
    if (isFigmaMode) document.getElementById('figmaUrlInput').focus();
  } else if (mode === 'code') {
    isCodeMode = !isCodeMode;
    document.getElementById('codeBtn').classList.toggle('active', isCodeMode);
    chatInput.placeholder = isCodeMode
      ? 'Paste your Liquid / HTML / CSS code here...'
      : 'Ask about Shopify development, paste code, or describe what you need...';
  }
}

function attachFigma() {
  const url = document.getElementById('figmaUrlInput').value.trim();
  if (!url) return;
  if (!url.includes('figma.com')) { showToast('Please enter a valid Figma URL'); return; }
  const pseudo = { name: 'figma-design.fig', type: 'figma', url };
  attachedFiles.push(pseudo);
  renderFilePreviews();
  document.getElementById('figmaUrlInput').value = '';
  toggleMode('figma');
  showToast('Figma link attached');
}

// ── Code Panel ──
function toggleCodePanel() {
  codePanelOpen = !codePanelOpen;
  codePanel.classList.toggle('open', codePanelOpen);
}

function closeCodePanel() {
  codePanelOpen = false;
  codePanel.classList.remove('open');
}

function openCodePanel() {
  codePanelOpen = true;
  codePanel.classList.add('open');
}

function switchToTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.code-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  renderCodePanel();
}

function renderCodePanel() {
  const body  = document.getElementById('codePanelBody');
  const frame = document.getElementById('previewFrame');

  if (activeTab === 'preview') {
    body.classList.add('show-preview');
    frame.srcdoc = currentCode.preview_html ||
      `<html><body style="font-family:system-ui,sans-serif;display:flex;align-items:center;
       justify-content:center;height:100vh;margin:0;background:#0c0c0e;color:#555">
       <div style="text-align:center">
         <p style="font-size:15px;color:#888">No preview yet.</p>
         <p style="font-size:13px;margin-top:8px;color:#555">Upload a design image and click
         <strong style="color:#00d084">Analyze with AI</strong>.</p>
       </div></body></html>`;
    return;
  }

  body.classList.remove('show-preview');
  const code = currentCode[activeTab] || '';

  // ── Raw plain-text only — NO syntax highlighting, NO span wrappers ──
  // textContent sets the exact characters the user typed; the browser
  // escapes < > & automatically so nothing is interpreted as HTML.
  const display = document.getElementById('codeDisplay');
  if (!code) {
    codeContent.textContent = getPlaceholderText(activeTab);
    display.classList.add('is-empty');
  } else {
    codeContent.textContent = code;   // ← exact Liquid/CSS/JS/JSON, no transformation
    display.classList.remove('is-empty');
  }

  // Rebuild line-number gutter
  renderLineNumbers(code);
}

function getPlaceholderText(tab) {
  const map = {
    liquid:  'No Liquid code yet.\n\nUpload a screenshot and click "Analyze with AI"\nto generate a complete .liquid section file.',
    schema:  'No schema yet.\n\nThe {% schema %} block will be extracted here\nafter image analysis.',
    css:     'No CSS yet.\n\nThe {% style %} block will be extracted here\nafter image analysis.',
    js:      'No JavaScript yet.\n\nThe {% javascript %} block will appear here\nif your section requires interactivity.',
  };
  return map[tab] || 'Select a tab above.';
}

function renderLineNumbers(code) {
  const gutter = document.getElementById('lineNumbers');
  if (!gutter) return;
  if (!code) { gutter.textContent = ''; return; }
  const count = code.split('\n').length;
  gutter.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
}

function copyCode() {
  if (activeTab === 'preview') { showToast('Switch to a code tab to copy'); return; }
  const code = currentCode[activeTab] || '';
  if (!code) { showToast('No code to copy'); return; }
  navigator.clipboard.writeText(code).then(() => showToast('Code copied!'));
}

function downloadCode() {
  const slug = (currentCode._name || 'section').replace(/\s+/g, '-').toLowerCase();

  if (activeTab === 'preview') {
    const html = currentCode.preview_html || '';
    if (!html) { showToast('No preview to download'); return; }
    triggerDownload(html, 'text/html', `${slug}-preview.html`);
    return;
  }

  // liquid tab → download the FULL .liquid file (markup + style + js + schema)
  if (activeTab === 'liquid') {
    const file = currentCode.liquid || '';
    if (!file) { showToast('No code to download'); return; }
    triggerDownload(file, 'text/plain', `${slug}.liquid`);
    showToast(`Downloading ${slug}.liquid`);
    return;
  }

  const fileMap = {
    schema: { content: currentCode.schema, name: 'schema.json',      mime: 'application/json' },
    css:    { content: currentCode.css,    name: `${slug}.css`,       mime: 'text/css' },
    js:     { content: currentCode.js,     name: `${slug}.js`,        mime: 'text/javascript' },
  };
  const entry = fileMap[activeTab];
  if (!entry || !entry.content) { showToast('No code to download'); return; }
  triggerDownload(entry.content, entry.mime, entry.name);
  showToast('Downloading ' + entry.name);
}

function triggerDownload(content, mime, filename) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ── Chat ──
function newChat() {
  chatActive = false;
  messageCount = 0;
  attachedFiles = [];
  chatHistory = [];
  if (chatAbortCtrl) { chatAbortCtrl.abort(); chatAbortCtrl = null; }
  renderFilePreviews();
  currentCode = { liquid: '', schema: '', css: '', js: '' };
  messagesEl.innerHTML = '';
  messagesContainer.style.display = 'none';
  welcomeScreen.style.display = 'flex';
  welcomeScreen.style.flexDirection = 'column';
  welcomeScreen.style.alignItems = 'center';
  chatTitle.textContent = 'New Conversation';
  chatInput.value = '';
  autoResize(chatInput);
  closeCodePanel();
  document.querySelectorAll('.history-item').forEach(i => i.classList.remove('active'));
  sidebar.classList.remove('mobile-open');
}

function loadChat(btn) {
  document.querySelectorAll('.history-item').forEach(i => i.classList.remove('active'));
  btn.classList.add('active');
  const title = btn.querySelector('span').textContent;
  chatTitle.textContent = title;
  sidebar.classList.remove('mobile-open');
  showToast('Chat loaded');
}

function quickAction(prompt) {
  chatInput.value = prompt;
  autoResize(chatInput);
  sendMessage();
}

function activateChat() {
  if (!chatActive) {
    chatActive = true;
    welcomeScreen.style.display = 'none';
    messagesContainer.style.display = 'block';
  }
}

async function sendMessage() {
  const text = chatInput.value.trim();
  const files = [...attachedFiles];
  if (!text && files.length === 0) return;

  // Find first image file attached
  const imageFile = files.find(f => f.type && f.type.startsWith('image/'));

  activateChat();
  messageCount++;
  if (messageCount === 1 && text) {
    const t = text.length > 40 ? text.slice(0, 38) + '...' : text;
    chatTitle.textContent = t;
  }

  // User message
  appendUserMessage(text, files);

  // Reset input
  chatInput.value = '';
  autoResize(chatInput);
  attachedFiles = [];
  pendingImageFile = null;
  document.getElementById('analyzeImageTrigger').classList.remove('visible');
  renderFilePreviews();

  // Typing indicator
  const typingId = appendTyping();

  try {
    // Convert image to base64 if present
    let imageBase64 = null;
    let mediaType = null;
    if (imageFile) {
      const result = await fileToBase64(imageFile);
      imageBase64 = result.base64;
      mediaType = result.mediaType;
    }

    // Build non-image file context text
    const fileContext = files
      .filter(f => !f.type.startsWith('image/'))
      .map(f => `[Attached file: ${f.name}]`)
      .join('\n');
    const fullMessage = [fileContext, text].filter(Boolean).join('\n\n');

    // Call real API
    const response = await callChatAPI(fullMessage, imageBase64, mediaType);

    removeTyping(typingId);

    if (response.type === 'code') {
      // Image analysis / code generation result
      handleChatCodeResponse(response);
    } else {
      // Plain text / Liquid snippet response
      appendAssistantMessage(response.message || response.text || '', null);
    }

  } catch (err) {
    removeTyping(typingId);
    if (err.name === 'AbortError') return;
    const isConn = err.message.includes('fetch') || err.message.includes('Failed to fetch') || err.message.includes('NetworkError');
    appendAssistantMessage(
      isConn
        ? `<p>⚠ Cannot connect to the server. Make sure to run <code>npm start</code> in the project folder, then refresh.</p>`
        : `<p>⚠ ${escapeHtml(err.message)}</p>`,
      null
    );
  }

  scrollToBottom();
}

/* ── Real API call via SSE ── */
async function callChatAPI(message, imageBase64, mediaType) {
  chatAbortCtrl = new AbortController();

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      imageBase64,
      mediaType,
      history: chatHistory.slice(-10)   // send last 10 turns for context
    }),
    signal: chatAbortCtrl.signal
  });

  if (!res.ok) throw new Error(`Server error: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastStatus = '';

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

      if (evt.type === 'status') {
        lastStatus = evt.message;
        updateTypingStatus(lastStatus);
      } else if (evt.type === 'complete') {
        return evt.data;
      } else if (evt.type === 'error') {
        throw new Error(evt.message);
      }
    }
  }

  throw new Error('Stream ended without a complete event');
}

/* ── Update the typing indicator text ── */
function updateTypingStatus(msg) {
  const indicators = messagesEl.querySelectorAll('.typing-indicator');
  const last = indicators[indicators.length - 1];
  if (!last) return;
  let statusEl = last.querySelector('.typing-status');
  if (!statusEl) {
    statusEl = document.createElement('span');
    statusEl.className = 'typing-status';
    last.appendChild(statusEl);
  }
  statusEl.textContent = msg;
}

/* ── Handle a code-type response from /api/chat ── */
function handleChatCodeResponse(data) {
  const slug = data.section_name || 'section';
  currentCode._name = slug;
  currentCode.preview_html = data.preview_html || '';

  // Support both legacy { liquid } shape and new { files: [...] } shape
  let liquidFile = data.liquid_file || data.liquid || '';
  let cssFile    = '';
  let jsFile     = '';
  let schemaFile = '';

  if (!liquidFile && Array.isArray(data.files) && data.files.length) {
    const lf = data.files.find(f => f.lang === 'liquid' || f.name.endsWith('.liquid'));
    const hf = data.files.find(f => f.lang === 'html'   || f.name.endsWith('.html'));
    const mf = data.files.find(f => f.lang === 'jsx'    || f.lang === 'vue');
    liquidFile = (lf || hf || mf || data.files[0]).content || '';

    const cf = data.files.find(f => f.lang === 'css' || f.name.endsWith('.css'));
    const jf = data.files.find(f => (f.lang === 'js' || f.name.endsWith('.js')) && !f.name.endsWith('.jsx'));
    const sf = data.files.find(f => f.lang === 'json' || f.name === 'schema.json');
    cssFile    = cf ? cf.content : '';
    jsFile     = jf ? jf.content : '';
    schemaFile = sf ? sf.content : '';
  }

  currentCode.liquid = liquidFile;

  // Extract {% style %} block (Shopify Liquid); fall back to separate CSS file
  const styleMatch = liquidFile.match(/\{%-?\s*style\s*-?%\}([\s\S]*?)\{%-?\s*endstyle\s*-?%\}/i);
  currentCode.css = styleMatch ? styleMatch[1].trim() : cssFile;

  // Extract {% javascript %} block; fall back to separate JS file
  const jsMatch = liquidFile.match(/\{%-?\s*javascript\s*-?%\}([\s\S]*?)\{%-?\s*endjavascript\s*-?%\}/i);
  currentCode.js = jsMatch ? jsMatch[1].trim() : jsFile;

  // Extract and pretty-print {% schema %}; fall back to separate schema.json file
  const schemaMatch = liquidFile.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i);
  if (schemaMatch) {
    try { currentCode.schema = JSON.stringify(JSON.parse(schemaMatch[1].trim()), null, 2); }
    catch { currentCode.schema = schemaMatch[1].trim(); }
  } else if (schemaFile) {
    try { currentCode.schema = JSON.stringify(JSON.parse(schemaFile), null, 2); }
    catch { currentCode.schema = schemaFile; }
  } else {
    currentCode.schema = '';
  }

  // Save to chat history
  chatHistory.push({ role: 'assistant', content: data.message || '' });

  // Update code panel tab labels
  const jsLines = currentCode.js ? currentCode.js.split('\n').length : 0;
  document.querySelectorAll('.code-tab').forEach(t => {
    if (t.dataset.tab === 'liquid') t.textContent = `${slug}.liquid`;
  });
  const jsTab = document.querySelector('.code-tab[data-tab="js"]');
  if (jsTab) jsTab.style.display = jsLines ? '' : 'none';

  // Count settings for chat message
  let settingCount = 0;
  try {
    const s = JSON.parse(currentCode.schema);
    settingCount = (s.settings || []).filter(x => x.type !== 'header').length
                 + (s.blocks || []).reduce((a, b) => a + (b.settings || []).length, 0);
  } catch {}

  const title = data.title || slug;
  chatTitle.textContent = title;

  appendAssistantMessage(
    data.message ||
    `<p>Generated <strong>${title}</strong> — a complete, deployment-ready Shopify section.</p>
     <p>${data.description || ''}</p>
     <p>✦ <strong>Preview tab</strong> — live render matching your design<br>
     ✦ <strong>${slug}.liquid</strong> — full section file<br>
     ✦ <strong>schema.json</strong> — ${settingCount} schema settings<br>
     ✦ Drop into <code>sections/${slug}.liquid</code> in your Shopify theme</p>`,
    { liquid: liquidFile.slice(0, 900) + (liquidFile.length > 900 ? '\n… (full file in code panel →)' : '') }
  );

  renderCodePanel();
  if (!codePanelOpen) openCodePanel();

  // Open preview tab if available
  if (currentCode.preview_html) {
    switchToTab('preview');
  } else {
    switchToTab('liquid');
  }
}

function appendUserMessage(text, files) {
  const div = document.createElement('div');
  div.className = 'message user';
  let fileChips = files.map(f => `
    <div class="msg-file-chip">
      ${getFileIcon(f.name)}
      <span>${f.name}</span>
    </div>`).join('');
  div.innerHTML = `<div class="msg-bubble">${fileChips ? `<div style="margin-bottom:8px">${fileChips}</div>` : ''}${escapeHtml(text).replace(/\n/g,'<br>')}</div>`;
  messagesEl.appendChild(div);
  scrollToBottom();
  // Push user turn to history
  const historyContent = [];
  if (text) historyContent.push({ type: 'text', text });
  if (historyContent.length) chatHistory.push({ role: 'user', content: historyContent });
}

let typingCounter = 0;
function appendTyping() {
  const id = 'typing-' + (++typingCounter);
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = id;
  div.innerHTML = `
    <div class="msg-avatar">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1.5L8.75 5.5L13 6.25L10 9.25L10.5 13.5L7 11.5L3.5 13.5L4 9.25L1 6.25L5.25 5.5L7 1.5Z" fill="#00D084"/>
      </svg>
    </div>
    <div class="msg-body">
      <div class="msg-name">LiquidAI</div>
      <div class="typing-indicator">
        <div class="typing-dots"><span></span><span></span><span></span></div>
      </div>
    </div>`;
  messagesEl.appendChild(div);
  scrollToBottom();
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function appendAssistantMessage(text, code) {
  const div = document.createElement('div');
  div.className = 'message assistant';

  // Unique ID for the inline code preview element
  const preId = 'msgPre_' + Date.now();

  let codeBlockHtml = '';
  if (code && code.liquid) {
    codeBlockHtml = `
      <div class="msg-code-block">
        <div class="msg-code-header">
          <span class="msg-code-lang">.liquid</span>
          <div class="msg-code-actions">
            <button class="msg-code-btn" onclick="openCodePanel();showToast('Opened in code panel')">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8M6 2l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Open in panel
            </button>
            <button class="msg-code-btn" onclick="navigator.clipboard.writeText(currentCode.liquid);showToast('Copied!')">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M4 4V2.5A1.5 1.5 0 012.5 1H1.5A1.5 1.5 0 000 2.5V8A1.5 1.5 0 001.5 9.5H3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
              Copy
            </button>
          </div>
        </div>
        <div class="msg-code-body"><pre id="${preId}"></pre></div>
      </div>`;
  }

  const actionsHtml = `
    <div class="msg-actions">
      <button class="msg-action-btn" onclick="copyMsgText(this)">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="4" y="4" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1.3"/><path d="M4 4V3a1 1 0 00-1-1H3a1 1 0 00-1 1v5a1 1 0 001 1h1" stroke="currentColor" stroke-width="1.3"/></svg>
        Copy response
      </button>
      ${code ? `<button class="msg-action-btn" onclick="downloadCode()">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v6M3.5 6L6 8.5 8.5 6M2 10h8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Download .liquid
      </button>` : ''}
      <button class="msg-action-btn" onclick="regenerate()">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 6a4 4 0 11-1.17-2.83M10 2v3H7" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
        Regenerate
      </button>
    </div>`;

  div.innerHTML = `
    <div class="msg-avatar">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1.5L8.75 5.5L13 6.25L10 9.25L10.5 13.5L7 11.5L3.5 13.5L4 9.25L1 6.25L5.25 5.5L7 1.5Z" fill="#00D084"/>
      </svg>
    </div>
    <div class="msg-body">
      <div class="msg-name">LiquidAI</div>
      <div class="msg-text">${text}</div>
      ${codeBlockHtml}
      ${actionsHtml}
    </div>`;

  messagesEl.appendChild(div);

  // Set raw code via textContent AFTER DOM insertion — no HTML injection
  if (code && code.liquid && preId) {
    const preEl = document.getElementById(preId);
    if (preEl) {
      const snippet = code.liquid.slice(0, 1000);
      const truncated = code.liquid.length > 1000;
      // textContent escapes all HTML — outputs the exact .liquid characters
      preEl.textContent = snippet + (truncated ? '\n\n… full file in code panel →' : '');
    }
  }
}

function copyMsgText(btn) {
  const text = btn.closest('.msg-body').querySelector('.msg-text').innerText;
  navigator.clipboard.writeText(text).then(() => showToast('Copied!'));
}

function regenerate() {
  showToast('Regenerating...');
}

function scrollToBottom() {
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// ── Utilities ──
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── (mock templates removed — now using real Claude API via /api/chat) ──
function _placeholder_removed() {
  const liquid = `{% comment %} Hero Banner Section {% endcomment %}
<section class="hero-banner" style="
  background-color: {{ section.settings.bg_color }};
  min-height: {{ section.settings.section_height }}px;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
">
  {%- if section.settings.bg_image != blank -%}
    <div class="hero-banner__media">
      {{
        section.settings.bg_image
        | image_url: width: 1920
        | image_tag:
          class: 'hero-banner__img',
          loading: 'eager',
          fetchpriority: 'high'
      }}
    </div>
    {%- if section.settings.overlay_opacity > 0 -%}
      <div class="hero-banner__overlay" style="opacity: {{ section.settings.overlay_opacity | divided_by: 100.0 }};"></div>
    {%- endif -%}
  {%- endif -%}

  <div class="page-width hero-banner__content hero-banner__content--{{ section.settings.text_alignment }}">
    {%- if section.settings.subheading != blank -%}
      <p class="hero-banner__subheading">{{ section.settings.subheading }}</p>
    {%- endif -%}
    {%- if section.settings.heading != blank -%}
      <h1 class="hero-banner__heading">{{ section.settings.heading }}</h1>
    {%- endif -%}
    {%- if section.settings.description != blank -%}
      <div class="hero-banner__description">
        {{ section.settings.description }}
      </div>
    {%- endif -%}
    {%- if section.settings.button_label != blank -%}
      <a
        href="{{ section.settings.button_url }}"
        class="btn btn--{{ section.settings.button_style }}"
      >
        {{ section.settings.button_label }}
      </a>
    {%- endif -%}
  </div>
</section>

{% schema %}
{
  "name": "Hero Banner",
  "tag": "section",
  "class": "section-hero-banner",
  "settings": [
    {
      "type": "header",
      "content": "Media"
    },
    {
      "type": "image_picker",
      "id": "bg_image",
      "label": "Background image"
    },
    {
      "type": "color",
      "id": "bg_color",
      "label": "Background color",
      "default": "#1a1a1a"
    },
    {
      "type": "range",
      "id": "overlay_opacity",
      "label": "Overlay opacity",
      "min": 0, "max": 90, "step": 5, "unit": "%",
      "default": 40
    },
    {
      "type": "range",
      "id": "section_height",
      "label": "Section height",
      "min": 300, "max": 900, "step": 50, "unit": "px",
      "default": 600
    },
    {
      "type": "header",
      "content": "Content"
    },
    {
      "type": "text",
      "id": "subheading",
      "label": "Subheading",
      "default": "New Collection"
    },
    {
      "type": "text",
      "id": "heading",
      "label": "Heading",
      "default": "Bold. Beautiful. Shopify."
    },
    {
      "type": "richtext",
      "id": "description",
      "label": "Description",
      "default": "<p>Discover our latest arrivals crafted for the modern world.</p>"
    },
    {
      "type": "header",
      "content": "Button"
    },
    {
      "type": "text",
      "id": "button_label",
      "label": "Button label",
      "default": "Shop Now"
    },
    {
      "type": "url",
      "id": "button_url",
      "label": "Button link"
    },
    {
      "type": "select",
      "id": "button_style",
      "label": "Button style",
      "options": [
        { "value": "primary", "label": "Primary" },
        { "value": "secondary", "label": "Secondary" },
        { "value": "outline", "label": "Outline" }
      ],
      "default": "primary"
    },
    {
      "type": "select",
      "id": "text_alignment",
      "label": "Text alignment",
      "options": [
        { "value": "left", "label": "Left" },
        { "value": "center", "label": "Center" },
        { "value": "right", "label": "Right" }
      ],
      "default": "center"
    }
  ],
  "presets": [
    {
      "name": "Hero Banner",
      "category": "Hero"
    }
  ]
}
{% endschema %}`;

  const css = `.hero-banner {
  position: relative;
  display: flex;
  align-items: center;
}

.hero-banner__media {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.hero-banner__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-banner__overlay {
  position: absolute;
  inset: 0;
  background: #000;
  z-index: 1;
}

.hero-banner__content {
  position: relative;
  z-index: 2;
  padding: 60px 20px;
  width: 100%;
}

.hero-banner__content--center { text-align: center; margin: 0 auto; }
.hero-banner__content--left { text-align: left; }
.hero-banner__content--right { text-align: right; margin-left: auto; }

.hero-banner__subheading {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.7);
  margin-bottom: 16px;
}

.hero-banner__heading {
  font-size: clamp(32px, 5vw, 72px);
  font-weight: 700;
  line-height: 1.1;
  color: #fff;
  margin-bottom: 20px;
}

.hero-banner__description {
  font-size: 16px;
  color: rgba(255,255,255,0.8);
  max-width: 500px;
  margin-bottom: 32px;
  line-height: 1.7;
}

.hero-banner__content--center .hero-banner__description {
  margin-left: auto;
  margin-right: auto;
}

@media (max-width: 768px) {
  .hero-banner__content {
    padding: 40px 16px;
  }
}`;

  const schema = JSON.stringify({
    name: "Hero Banner",
    settings_count: 14,
    presets: 1,
    responsive: true,
    features: ["Background image", "Color overlay", "Heading", "CTA button", "Alignment control"]
  }, null, 2);

  return {
    text: `<p>Here's a fully responsive <code>hero-banner</code> Shopify section with:</p>
<p>✦ <strong>Background image</strong> with color overlay control<br>
✦ <strong>Adjustable height</strong> via range slider (300–900px)<br>
✦ <strong>Subheading, heading, description</strong> with rich text support<br>
✦ <strong>CTA button</strong> with 3 style variants (Primary / Secondary / Outline)<br>
✦ <strong>Text alignment</strong> — Left, Center, or Right<br>
✦ <strong>Mobile-first CSS</strong> with fluid typography using <code>clamp()</code></p>
<p>The schema has 14 settings organized into logical groups. Drop this file into your theme's <code>sections/</code> folder and add it to a page template.</p>`,
    code: { liquid, schema, css }
  };
}

function productPageResponse() {
  const liquid = `{% comment %} Product Page Section {% endcomment %}
{%- assign current_variant = product.selected_or_first_available_variant -%}
{%- assign product_form_id = 'product-form-' | append: section.id -%}

<section class="product-page section-{{ section.id }}">
  <div class="page-width">
    <div class="product-page__grid">

      {%- comment -%} Media Gallery {%- endcomment -%}
      <div class="product-page__media">
        <div class="product-gallery" data-product-gallery>
          {%- if product.media.size > 0 -%}
            <div class="product-gallery__main">
              {%- for media in product.media -%}
                <div class="product-gallery__item{% if forloop.first %} active{% endif %}" data-media-id="{{ media.id }}">
                  {%- case media.media_type -%}
                    {%- when 'image' -%}
                      {{
                        media
                        | image_url: width: 900
                        | image_tag:
                          loading: forloop.first | iif: 'eager', 'lazy',
                          class: 'product-gallery__img',
                          widths: '400, 600, 900'
                      }}
                    {%- when 'video' -%}
                      {{- media | video_tag: autoplay: false, loop: true, muted: true, controls: true -}}
                    {%- when 'model' -%}
                      {{- media | model_viewer_tag -}}
                  {%- endcase -%}
                </div>
              {%- endfor -%}
            </div>
            {%- if product.media.size > 1 -%}
              <div class="product-gallery__thumbnails">
                {%- for media in product.media -%}
                  <button
                    class="product-gallery__thumb{% if forloop.first %} active{% endif %}"
                    data-media-id="{{ media.id }}"
                    aria-label="{{ media.alt | escape }}"
                  >
                    {{
                      media.preview_image
                      | image_url: width: 120
                      | image_tag: loading: 'lazy', class: 'product-gallery__thumb-img'
                    }}
                  </button>
                {%- endfor -%}
              </div>
            {%- endif -%}
          {%- endif -%}
        </div>
      </div>

      {%- comment -%} Product Info {%- endcomment -%}
      <div class="product-page__info">
        {%- if section.settings.show_vendor and product.vendor != blank -%}
          <p class="product-vendor">{{ product.vendor }}</p>
        {%- endif -%}

        <h1 class="product-title">{{ product.title }}</h1>

        {%- if section.settings.show_rating -%}
          <div class="product-rating">
            <span class="product-rating__stars">★★★★★</span>
            <span class="product-rating__count">({{ product.metafields.reviews.rating_count | default: 0 }} reviews)</span>
          </div>
        {%- endif -%}

        <div class="product-price" id="price-{{ section.id }}">
          {%- if current_variant.compare_at_price > current_variant.price -%}
            <span class="price price--sale">{{ current_variant.price | money }}</span>
            <span class="price price--compare">{{ current_variant.compare_at_price | money }}</span>
            <span class="price-badge">Save {{ current_variant.compare_at_price | minus: current_variant.price | money }}</span>
          {%- else -%}
            <span class="price">{{ current_variant.price | money }}</span>
          {%- endif -%}
        </div>

        {%- unless product.has_only_default_variant -%}
          <div class="product-variants">
            {%- for option in product.options_with_values -%}
              <div class="product-option">
                <label class="product-option__label">
                  {{ option.name }}:
                  <span class="product-option__selected" id="option-{{ forloop.index0 }}-label">
                    {{ option.selected_value }}
                  </span>
                </label>
                {%- if option.name == 'Color' or option.name == 'Colour' -%}
                  <div class="option-swatches">
                    {%- for value in option.values -%}
                      <button
                        class="swatch{% if option.selected_value == value %} active{% endif %}"
                        style="background-color: {{ value | handle }};"
                        data-option-index="{{ forloop.parentloop.index0 }}"
                        data-option-value="{{ value }}"
                        aria-label="{{ value }}"
                      ></button>
                    {%- endfor -%}
                  </div>
                {%- else -%}
                  <div class="option-buttons">
                    {%- for value in option.values -%}
                      <button
                        class="option-btn{% if option.selected_value == value %} active{% endif %}"
                        data-option-index="{{ forloop.parentloop.index0 }}"
                        data-option-value="{{ value }}"
                      >{{ value }}</button>
                    {%- endfor -%}
                  </div>
                {%- endif -%}
              </div>
            {%- endfor -%}
          </div>
        {%- endunless -%}

        {%- form 'product', product, id: product_form_id, data-type: 'add-to-cart-form' -%}
          <input type="hidden" name="id" value="{{ current_variant.id }}">
          <div class="product-quantity">
            <label for="quantity-{{ section.id }}">Quantity</label>
            <div class="quantity-selector">
              <button type="button" class="qty-btn" data-action="minus">−</button>
              <input type="number" id="quantity-{{ section.id }}" name="quantity" value="1" min="1" class="qty-input">
              <button type="button" class="qty-btn" data-action="plus">+</button>
            </div>
          </div>
          <button
            type="submit"
            class="btn btn--primary btn--full"
            {% unless current_variant.available %}disabled{% endunless %}
          >
            {%- if current_variant.available -%}
              Add to Cart — {{ current_variant.price | money }}
            {%- else -%}
              Sold Out
            {%- endif -%}
          </button>
        {%- endform -%}

        {%- if section.settings.show_description and product.description != blank -%}
          <div class="product-description rte">
            {{ product.description }}
          </div>
        {%- endif -%}
      </div>
    </div>
  </div>
</section>

{% schema %}
{
  "name": "Product Page",
  "tag": "section",
  "settings": [
    { "type": "checkbox", "id": "show_vendor", "label": "Show vendor", "default": true },
    { "type": "checkbox", "id": "show_rating", "label": "Show rating", "default": true },
    { "type": "checkbox", "id": "show_description", "label": "Show description", "default": true }
  ]
}
{% endschema %}`;

  return {
    text: `<p>Here's a complete <code>product-page</code> section with everything you need:</p>
<p>✦ <strong>Media gallery</strong> — supports images, videos, and 3D models with thumbnails<br>
✦ <strong>Variant selector</strong> — color swatches for Color options, pill buttons for Size/other<br>
✦ <strong>Dynamic pricing</strong> — sale price, compare-at price, savings badge<br>
✦ <strong>Quantity selector</strong> with +/- buttons<br>
✦ <strong>Add to cart form</strong> with sold-out state handling<br>
✦ <strong>Vendor, ratings, description</strong> — all toggleable in schema</p>
<p>The gallery uses <code>data-media-id</code> attributes for easy JS hookup. Variant selection updates the price via DOM targeting.</p>`,
    code: { liquid, schema: '{}', css: '' }
  };
}

function collectionSectionResponse() {
  const liquid = `{% comment %} Collection Grid Section {% endcomment %}
{%- assign products_per_page = section.settings.products_per_page -%}

<section class="collection-section section-{{ section.id }}">
  <div class="page-width">

    {%- if section.settings.show_heading -%}
      <div class="collection-header">
        <h2 class="collection-heading">
          {%- if collection.title != blank -%}
            {{ collection.title }}
          {%- else -%}
            {{ section.settings.heading | default: 'All Products' }}
          {%- endif -%}
        </h2>
        {%- if collection.description != blank and section.settings.show_description -%}
          <p class="collection-description">{{ collection.description }}</p>
        {%- endif -%}
      </div>
    {%- endif -%}

    {%- if section.settings.show_filter -%}
      <div class="collection-toolbar">
        <div class="collection-filter-tags">
          {%- for tag in collection.all_tags | limit: 8 -%}
            {%- if current_tags contains tag -%}
              <a href="{{ collection.url }}/{{ tag | url_encode }}" class="filter-tag active">{{ tag }}</a>
            {%- else -%}
              <a href="{{ collection.url }}/{{ tag | url_encode }}" class="filter-tag">{{ tag }}</a>
            {%- endif -%}
          {%- endfor -%}
        </div>
        <div class="collection-sort">
          <label for="sort-by">Sort:</label>
          <select id="sort-by" class="sort-select" onchange="window.location = this.value">
            {%- assign sort_options = 'manual,best-selling,price-ascending,price-descending,title-ascending,created-descending' | split: ',' -%}
            {%- assign sort_labels = 'Featured,Best Selling,Price: Low → High,Price: High → Low,A–Z,Newest' | split: ',' -%}
            {%- for option in sort_options -%}
              <option
                value="{{ collection.url }}?sort_by={{ option }}"
                {% if collection.sort_by == option %}selected{% endif %}
              >{{ sort_labels[forloop.index0] }}</option>
            {%- endfor -%}
          </select>
        </div>
      </div>
    {%- endif -%}

    {%- paginate collection.products by products_per_page -%}
      <div class="product-grid product-grid--{{ section.settings.columns }}">
        {%- for product in collection.products -%}
          <div class="product-card" data-product-id="{{ product.id }}">
            <a href="{{ product.url }}" class="product-card__media-link">
              <div class="product-card__media">
                {%- if product.featured_media -%}
                  {{
                    product.featured_media
                    | image_url: width: 600
                    | image_tag:
                      class: 'product-card__img',
                      loading: 'lazy',
                      alt: product.featured_media.alt | escape
                  }}
                  {%- if product.media[1] and section.settings.show_second_image -%}
                    {{
                      product.media[1]
                      | image_url: width: 600
                      | image_tag: class: 'product-card__img product-card__img--hover', loading: 'lazy'
                    }}
                  {%- endif -%}
                {%- endif -%}
                {%- if product.available == false -%}
                  <span class="product-badge product-badge--sold-out">Sold Out</span>
                {%- elsif product.compare_at_price > product.price -%}
                  {%- assign discount = product.compare_at_price | minus: product.price | times: 100 | divided_by: product.compare_at_price -%}
                  <span class="product-badge product-badge--sale">-{{ discount }}%</span>
                {%- endif -%}
                {%- if section.settings.show_quick_add -%}
                  <button class="product-card__quick-add" data-product-id="{{ product.id }}">Quick Add</button>
                {%- endif -%}
              </div>
            </a>
            <div class="product-card__info">
              {%- if section.settings.show_vendor -%}
                <p class="product-card__vendor">{{ product.vendor }}</p>
              {%- endif -%}
              <h3 class="product-card__title">
                <a href="{{ product.url }}">{{ product.title }}</a>
              </h3>
              <div class="product-card__price">
                {%- if product.compare_at_price > product.price -%}
                  <span class="price price--sale">{{ product.price | money }}</span>
                  <span class="price price--compare">{{ product.compare_at_price | money }}</span>
                {%- else -%}
                  <span class="price">{{ product.price | money }}</span>
                {%- endif -%}
              </div>
              {%- unless product.has_only_default_variant -%}
                <p class="product-card__variants">{{ product.variants.size }} variants</p>
              {%- endunless -%}
            </div>
          </div>
        {%- else -%}
          <div class="collection-empty">
            <p>No products found in this collection.</p>
          </div>
        {%- endfor -%}
      </div>

      {%- if paginate.pages > 1 -%}
        <div class="pagination">
          {{ paginate | default_pagination }}
        </div>
      {%- endif -%}
    {%- endpaginate -%}
  </div>
</section>

{% schema %}
{
  "name": "Collection Grid",
  "tag": "section",
  "settings": [
    { "type": "checkbox", "id": "show_heading", "label": "Show heading", "default": true },
    { "type": "text", "id": "heading", "label": "Default heading", "default": "All Products" },
    { "type": "checkbox", "id": "show_description", "label": "Show collection description", "default": true },
    { "type": "checkbox", "id": "show_filter", "label": "Show filter & sort", "default": true },
    { "type": "checkbox", "id": "show_vendor", "label": "Show vendor", "default": false },
    { "type": "checkbox", "id": "show_quick_add", "label": "Show quick add button", "default": true },
    { "type": "checkbox", "id": "show_second_image", "label": "Show hover image", "default": true },
    {
      "type": "select",
      "id": "columns",
      "label": "Products per row",
      "options": [
        { "value": "2", "label": "2" },
        { "value": "3", "label": "3" },
        { "value": "4", "label": "4" }
      ],
      "default": "3"
    },
    {
      "type": "range",
      "id": "products_per_page",
      "label": "Products per page",
      "min": 8, "max": 48, "step": 4,
      "default": 12
    }
  ],
  "templates": ["collection"]
}
{% endschema %}`;

  return {
    text: `<p>Here's a complete <code>collection-grid</code> section with advanced features:</p>
<p>✦ <strong>Tag filtering</strong> with active state highlighting<br>
✦ <strong>Sort dropdown</strong> — 6 sort options with redirect<br>
✦ <strong>Hover image swap</strong> — second product image on hover<br>
✦ <strong>Sale badges</strong> — auto-calculates discount percentage<br>
✦ <strong>Quick Add button</strong> — toggleable per merchant<br>
✦ <strong>Pagination</strong> — uses Shopify's built-in paginator<br>
✦ <strong>Empty state</strong> — graceful fallback when no products</p>
<p>The grid columns are configurable (2, 3, or 4 per row) and products per page is adjustable via a range slider.</p>`,
    code: { liquid, schema: '{}', css: '' }
  };
}

function faqSectionResponse() {
  const liquid = `{% comment %} FAQ Accordion Section {% endcomment %}
<section class="faq-section section-{{ section.id }}">
  <div class="page-width">
    {%- if section.settings.heading != blank -%}
      <div class="faq-header">
        <h2 class="faq-heading">{{ section.settings.heading }}</h2>
        {%- if section.settings.subheading != blank -%}
          <p class="faq-subheading">{{ section.settings.subheading }}</p>
        {%- endif -%}
      </div>
    {%- endif -%}

    <div class="faq-list" role="list">
      {%- for block in section.blocks -%}
        {%- case block.type -%}
          {%- when 'faq_item' -%}
            <div
              class="faq-item{% if block.settings.open_by_default %} open{% endif %}"
              role="listitem"
              {{ block.shopify_attributes }}
            >
              <button
                class="faq-question"
                aria-expanded="{{ block.settings.open_by_default }}"
                aria-controls="faq-answer-{{ block.id }}"
              >
                <span class="faq-question__text">{{ block.settings.question }}</span>
                <span class="faq-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 8L10 13L15 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              </button>
              <div
                id="faq-answer-{{ block.id }}"
                class="faq-answer"
                aria-hidden="{{ block.settings.open_by_default | default: 'true' }}"
              >
                <div class="faq-answer__inner">
                  {{ block.settings.answer }}
                </div>
              </div>
            </div>
        {%- endcase -%}
      {%- endfor -%}
    </div>
  </div>
</section>

<script>
  (function() {
    const section = document.querySelector('.section-{{ section.id }}');
    if (!section) return;
    section.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', function() {
        const item = this.closest('.faq-item');
        const isOpen = item.classList.contains('open');
        if ({{ section.settings.one_at_a_time | json }}) {
          section.querySelectorAll('.faq-item').forEach(i => {
            i.classList.remove('open');
            i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
            i.querySelector('.faq-answer').setAttribute('aria-hidden', 'true');
          });
        }
        item.classList.toggle('open', !isOpen);
        this.setAttribute('aria-expanded', !isOpen);
        item.querySelector('.faq-answer').setAttribute('aria-hidden', isOpen);
      });
    });
  })();
</script>

{% schema %}
{
  "name": "FAQ",
  "tag": "section",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Frequently Asked Questions" },
    { "type": "text", "id": "subheading", "label": "Subheading" },
    { "type": "checkbox", "id": "one_at_a_time", "label": "Collapse others on open", "default": true }
  ],
  "blocks": [
    {
      "type": "faq_item",
      "name": "FAQ Item",
      "settings": [
        { "type": "text", "id": "question", "label": "Question", "default": "What is your return policy?" },
        { "type": "richtext", "id": "answer", "label": "Answer", "default": "<p>We offer a 30-day hassle-free return policy on all items.</p>" },
        { "type": "checkbox", "id": "open_by_default", "label": "Open by default", "default": false }
      ]
    }
  ],
  "presets": [
    {
      "name": "FAQ",
      "blocks": [
        { "type": "faq_item" },
        { "type": "faq_item" },
        { "type": "faq_item" }
      ]
    }
  ]
}
{% endschema %}`;

  const css = `.faq-section { padding: 60px 0; }

.faq-header {
  text-align: center;
  margin-bottom: 40px;
}

.faq-heading {
  font-size: clamp(24px, 3vw, 40px);
  font-weight: 700;
  margin-bottom: 12px;
}

.faq-subheading {
  color: #666;
  font-size: 16px;
}

.faq-list { max-width: 720px; margin: 0 auto; }

.faq-item {
  border-bottom: 1px solid #e5e5e5;
}

.faq-question {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 0;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  gap: 16px;
  font-size: 16px;
  font-weight: 500;
  color: inherit;
}

.faq-icon {
  flex-shrink: 0;
  transition: transform 0.3s ease;
  color: #999;
}

.faq-item.open .faq-icon {
  transform: rotate(180deg);
  color: inherit;
}

.faq-answer {
  overflow: hidden;
  max-height: 0;
  transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.faq-item.open .faq-answer { max-height: 600px; }

.faq-answer__inner {
  padding-bottom: 20px;
  font-size: 15px;
  line-height: 1.75;
  color: #555;
}`;

  return {
    text: `<p>Here's a fully accessible FAQ accordion section with:</p>
<p>✦ <strong>ARIA attributes</strong> — <code>aria-expanded</code>, <code>aria-controls</code>, <code>aria-hidden</code> for screen readers<br>
✦ <strong>CSS-driven animation</strong> — smooth max-height transition, no height jumping<br>
✦ <strong>Collapse-others mode</strong> — optional via schema checkbox<br>
✦ <strong>Open by default</strong> — per-block setting for pre-expanded items<br>
✦ <strong>Block-based</strong> — add unlimited FAQ items from the theme editor</p>
<p>The JavaScript is scoped to the section using <code>.section-{{ section.id }}</code> so multiple FAQ sections on the same page won't conflict.</p>`,
    code: { liquid, schema: '{}', css }
  };
}

function htmlConvertResponse(hasFiles, fileNames) {
  const liquid = `{% comment %} Converted from HTML to Shopify Liquid {% endcomment %}
<section class="custom-section section-{{ section.id }}">
  <div class="page-width">
    <div class="custom-section__inner" style="
      padding: {{ section.settings.padding_top }}px 0 {{ section.settings.padding_bottom }}px;
    ">
      {%- if section.settings.badge != blank -%}
        <span class="badge">{{ section.settings.badge }}</span>
      {%- endif -%}

      {%- if section.settings.heading != blank -%}
        <h2 class="section-heading">{{ section.settings.heading }}</h2>
      {%- endif -%}

      {%- if section.settings.body_text != blank -%}
        <div class="section-body rte">{{ section.settings.body_text }}</div>
      {%- endif -%}

      {%- if section.settings.image != blank -%}
        <div class="section-image">
          {{
            section.settings.image
            | image_url: width: 1200
            | image_tag: loading: 'lazy', class: 'section-image__img'
          }}
        </div>
      {%- endif -%}

      {%- if section.settings.button_label != blank -%}
        <a
          href="{{ section.settings.button_url }}"
          class="btn btn--{{ section.settings.button_style }}"
        >
          {{ section.settings.button_label }}
        </a>
      {%- endif -%}

      <div class="blocks-container">
        {%- for block in section.blocks -%}
          {%- case block.type -%}
            {%- when 'content_block' -%}
              <div class="content-block" {{ block.shopify_attributes }}>
                {%- if block.settings.icon != blank -%}
                  <div class="content-block__icon">{{ block.settings.icon }}</div>
                {%- endif -%}
                <h3 class="content-block__heading">{{ block.settings.heading }}</h3>
                <p class="content-block__text">{{ block.settings.text }}</p>
              </div>
          {%- endcase -%}
        {%- endfor -%}
      </div>
    </div>
  </div>
</section>

{% schema %}
{
  "name": "Custom Section",
  "tag": "section",
  "settings": [
    { "type": "text", "id": "badge", "label": "Badge text" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "Section Heading" },
    { "type": "richtext", "id": "body_text", "label": "Body text" },
    { "type": "image_picker", "id": "image", "label": "Image" },
    { "type": "text", "id": "button_label", "label": "Button label" },
    { "type": "url", "id": "button_url", "label": "Button URL" },
    { "type": "select", "id": "button_style", "label": "Button style",
      "options": [
        { "value": "primary", "label": "Primary" },
        { "value": "secondary", "label": "Secondary" }
      ],
      "default": "primary"
    },
    { "type": "range", "id": "padding_top", "label": "Top padding", "min": 0, "max": 100, "step": 4, "unit": "px", "default": 60 },
    { "type": "range", "id": "padding_bottom", "label": "Bottom padding", "min": 0, "max": 100, "step": 4, "unit": "px", "default": 60 }
  ],
  "blocks": [
    {
      "type": "content_block",
      "name": "Content Block",
      "settings": [
        { "type": "text", "id": "icon", "label": "Icon (emoji or SVG)" },
        { "type": "text", "id": "heading", "label": "Heading", "default": "Block Heading" },
        { "type": "textarea", "id": "text", "label": "Text", "default": "Add your content here." }
      ]
    }
  ],
  "presets": [{ "name": "Custom Section" }]
}
{% endschema %}`;

  return {
    text: `<p>${hasFiles ? `I've analyzed <code>${fileNames}</code> and converted it to a` : 'Here\'s a'} Shopify Liquid section with all static content replaced by dynamic schema settings:</p>
<p>✦ <strong>All hardcoded text</strong> → <code>section.settings</code> variables<br>
✦ <strong>Images</strong> → <code>image_picker</code> settings with Shopify's image CDN<br>
✦ <strong>Buttons/links</strong> → separate label + URL settings<br>
✦ <strong>Repeatable content</strong> → block-based with <code>shopify_attributes</code><br>
✦ <strong>Padding controls</strong> → range sliders in schema<br>
✦ <strong>Liquid best practices</strong> — proper <code>{%- -%}</code> whitespace control, <code>| escape</code> on user content</p>
<p>Upload your HTML file and I'll perform an exact conversion with your specific class names and structure preserved.</p>`,
    code: { liquid, schema: '{}', css: '' }
  };
}

function debugResponse(hasFiles, fileNames) {
  const liquid = `{% comment %}
  DEBUGGING CHECKLIST — Common Liquid Errors Fixed
  ================================================
{% endcomment %}

{% comment %} ❌ Error: Liquid syntax error: Unknown tag 'endif' {% endcomment %}
{% comment %} ✅ Fix: Closing tags must match opening tags {% endcomment %}
{%- if product.available -%}
  <p>In stock</p>
{%- endif -%}

{% comment %} ❌ Error: undefined method 'price' for nil {% endcomment %}
{% comment %} ✅ Fix: Always check for blank before accessing properties {% endcomment %}
{%- assign variant = product.selected_or_first_available_variant -%}
{%- if variant != blank -%}
  <span>{{ variant.price | money }}</span>
{%- endif -%}

{% comment %} ❌ Error: filter 'money_without_currency' not found {% endcomment %}
{% comment %} ✅ Fix: Use correct Shopify Liquid filter names {% endcomment %}
{{ product.price | money }}
{{ product.price | money_with_currency }}
{{ product.price | money_without_trailing_zeros }}

{% comment %} ❌ Error: Forloop variable used outside loop {% endcomment %}
{% comment %} ✅ Fix: Capture values inside the loop {% endcomment %}
{%- assign first_product = collections.all.products.first -%}
{{ first_product.title }}

{% comment %} ❌ Error: Translation string not found {% endcomment %}
{% comment %} ✅ Fix: Use | default for missing translation keys {% endcomment %}
{{ 'products.product.add_to_cart' | t | default: 'Add to Cart' }}

{% comment %} ❌ Error: Image URL undefined {% endcomment %}
{% comment %} ✅ Fix: Check media exists before calling image_url {% endcomment %}
{%- if product.featured_media -%}
  {{ product.featured_media | image_url: width: 600 | image_tag }}
{%- else -%}
  {{ 'product-1' | placeholder_svg_tag: 'placeholder-image' }}
{%- endif -%}`;

  return {
    text: `<p>${hasFiles ? `I've analyzed <code>${fileNames}</code> and found several issues:` : 'Here are the most common Shopify Liquid errors and how to fix them:'}</p>
<p>✦ <strong>Unclosed tags</strong> — every <code>{%- if -%}</code> needs a matching <code>{%- endif -%}</code><br>
✦ <strong>Nil object access</strong> — always check <code>!= blank</code> before accessing properties on potentially-nil objects<br>
✦ <strong>Wrong filter names</strong> — <code>money_without_currency</code> doesn't exist; use <code>money</code>, <code>money_with_currency</code>, or <code>money_without_trailing_zeros</code><br>
✦ <strong>Missing image fallback</strong> — use <code>placeholder_svg_tag</code> when media is nil<br>
✦ <strong>Translation fallbacks</strong> — pipe <code>| default: 'fallback'</code> on all <code>| t</code> calls</p>
<p>Paste your specific Liquid code and I'll debug the exact error with a line-by-line fix.</p>`,
    code: { liquid, schema: '', css: '' }
  };
}

function schemaResponse() {
  const schema = `{
  "name": "Feature Section",
  "tag": "section",
  "class": "section-feature",
  "disabled_on": {
    "groups": ["header", "footer"]
  },
  "settings": [
    {
      "type": "header",
      "content": "Layout"
    },
    {
      "type": "select",
      "id": "layout",
      "label": "Layout style",
      "options": [
        { "value": "grid", "label": "Grid" },
        { "value": "list", "label": "List" },
        { "value": "carousel", "label": "Carousel" }
      ],
      "default": "grid"
    },
    {
      "type": "select",
      "id": "columns_desktop",
      "label": "Columns on desktop",
      "options": [
        { "value": "2", "label": "2 columns" },
        { "value": "3", "label": "3 columns" },
        { "value": "4", "label": "4 columns" }
      ],
      "default": "3"
    },
    {
      "type": "select",
      "id": "columns_mobile",
      "label": "Columns on mobile",
      "options": [
        { "value": "1", "label": "1 column" },
        { "value": "2", "label": "2 columns" }
      ],
      "default": "1"
    },
    {
      "type": "header",
      "content": "Content"
    },
    {
      "type": "text",
      "id": "heading",
      "label": "Section heading",
      "default": "Our Features"
    },
    {
      "type": "richtext",
      "id": "subheading",
      "label": "Subheading",
      "default": "<p>Everything you need to build a better store.</p>"
    },
    {
      "type": "select",
      "id": "heading_size",
      "label": "Heading size",
      "options": [
        { "value": "h2", "label": "Medium" },
        { "value": "h1", "label": "Large" },
        { "value": "h3", "label": "Small" }
      ],
      "default": "h2"
    },
    {
      "type": "header",
      "content": "Color scheme"
    },
    {
      "type": "color_scheme",
      "id": "color_scheme",
      "label": "Color scheme",
      "default": "scheme-1"
    },
    {
      "type": "header",
      "content": "Button"
    },
    {
      "type": "text",
      "id": "button_label",
      "label": "Button label"
    },
    {
      "type": "url",
      "id": "button_url",
      "label": "Button URL"
    },
    {
      "type": "select",
      "id": "button_style",
      "label": "Button style",
      "options": [
        { "value": "primary", "label": "Primary" },
        { "value": "secondary", "label": "Secondary" },
        { "value": "outline-bordered", "label": "Outline" }
      ],
      "default": "primary"
    },
    {
      "type": "header",
      "content": "Spacing"
    },
    {
      "type": "range",
      "id": "padding_top",
      "label": "Top padding",
      "min": 0,
      "max": 100,
      "step": 4,
      "unit": "px",
      "default": 60
    },
    {
      "type": "range",
      "id": "padding_bottom",
      "label": "Bottom padding",
      "min": 0,
      "max": 100,
      "step": 4,
      "unit": "px",
      "default": 60
    }
  ],
  "blocks": [
    {
      "type": "feature_item",
      "name": "Feature Item",
      "limit": 12,
      "settings": [
        {
          "type": "image_picker",
          "id": "icon_image",
          "label": "Icon image"
        },
        {
          "type": "select",
          "id": "icon_size",
          "label": "Icon size",
          "options": [
            { "value": "small", "label": "Small (32px)" },
            { "value": "medium", "label": "Medium (48px)" },
            { "value": "large", "label": "Large (64px)" }
          ],
          "default": "medium"
        },
        {
          "type": "text",
          "id": "heading",
          "label": "Heading",
          "default": "Feature Title"
        },
        {
          "type": "richtext",
          "id": "content",
          "label": "Content",
          "default": "<p>Describe this feature in a sentence or two.</p>"
        },
        {
          "type": "text",
          "id": "button_label",
          "label": "Link label"
        },
        {
          "type": "url",
          "id": "button_url",
          "label": "Link URL"
        }
      ]
    }
  ],
  "presets": [
    {
      "name": "Feature Section",
      "blocks": [
        { "type": "feature_item" },
        { "type": "feature_item" },
        { "type": "feature_item" }
      ]
    }
  ]
}`;

  return {
    text: `<p>Here's a comprehensive Shopify section schema with all common setting types:</p>
<p>✦ <strong>Layout controls</strong> — grid/list/carousel selector, responsive column counts<br>
✦ <strong>Content settings</strong> — text, richtext, heading size selector<br>
✦ <strong>Color scheme</strong> — uses Shopify's built-in <code>color_scheme</code> type (Dawn-compatible)<br>
✦ <strong>Button</strong> — label + URL + style variant<br>
✦ <strong>Spacing</strong> — top/bottom padding via range sliders<br>
✦ <strong>Blocks</strong> — repeatable feature items with 12-item limit<br>
✦ <strong>Preset</strong> — starts with 3 blocks pre-populated</p>
<p>The schema is displayed in the code panel. All setting types follow Shopify's <code>sections/schema</code> spec for OS 2.0 themes.</p>`,
    code: { liquid: '{% comment %} Schema defined below {% endcomment %}\n{% schema %}\n' + schema + '\n{% endschema %}', schema, css: '' }
  };
}

function optimizeResponse(hasFiles) {
  const liquid = `{% comment %}
  LIQUID PERFORMANCE OPTIMIZATIONS
  =================================
  Key techniques for faster Shopify themes
{% endcomment %}

{% comment %} ✅ 1. Use | image_url with width instead of | img_url (deprecated) {% endcomment %}
{{ product.featured_media | image_url: width: 600 | image_tag: loading: 'lazy' }}

{% comment %} ✅ 2. Avoid assign inside loops — move it outside {% endcomment %}
{%- assign currency = shop.currency -%}
{%- for product in collection.products -%}
  {{ product.price | money }} {{ currency }}
{%- endfor -%}

{% comment %} ✅ 3. Use limit to avoid large loops {% endcomment %}
{%- for product in collection.products limit: 4 -%}
  {{ product.title }}
{%- endfor -%}

{% comment %} ✅ 4. Cache repeated filter calls with assign {% endcomment %}
{%- assign product_url = product.url | within: collection -%}
<a href="{{ product_url }}">{{ product.title }}</a>

{% comment %} ✅ 5. Use unless instead of if-not {% endcomment %}
{%- unless product.has_only_default_variant -%}
  <p>Multiple variants available</p>
{%- endunless -%}

{% comment %} ✅ 6. Whitespace control with {%- -%} — removes blank lines {% endcomment %}
{%- if section.settings.show_heading -%}
  <h2>{{ section.settings.heading }}</h2>
{%- endif -%}

{% comment %} ✅ 7. Use forloop helpers instead of counters {% endcomment %}
{%- for item in section.blocks -%}
  {%- if forloop.first -%}<ul>{%- endif -%}
  <li class="{% if forloop.last %}last{% endif %}">{{ item.settings.text }}</li>
  {%- if forloop.last -%}</ul>{%- endif -%}
{%- endfor -%}

{% comment %} ✅ 8. Render snippets with variables instead of global scope {% endcomment %}
{%- render 'product-card', product: product, show_vendor: true -%}

{% comment %} ✅ 9. Lazy load below-fold images {% endcomment %}
{%- for media in product.media offset: 1 -%}
  {{ media | image_url: width: 600 | image_tag: loading: 'lazy' }}
{%- endfor -%}

{% comment %} ✅ 10. Use preload for LCP image {% endcomment %}
{%- if section.index == 1 -%}
  <link rel="preload" as="image"
    imagesrcset="{{ section.settings.hero_image | image_url: width: 1920 }}"
    href="{{ section.settings.hero_image | image_url: width: 1920 }}">
{%- endif -%}`;

  return {
    text: `<p>${hasFiles ? "I've analyzed your file and applied these optimizations:" : "Here are the top 10 Liquid performance optimizations for Shopify themes:"}</p>
<p>✦ <strong>image_url filter</strong> — use instead of deprecated <code>| img_url</code>; enables Shopify CDN resizing<br>
✦ <strong>Assign outside loops</strong> — variables assigned in loops recalculate every iteration<br>
✦ <strong>Limit on collections</strong> — never iterate a full collection; always use <code>limit:</code><br>
✦ <strong>Whitespace control</strong> — <code>{%- -%}</code> trims blank lines, reducing HTML payload<br>
✦ <strong>render vs include</strong> — always use <code>render</code> (isolated scope) over deprecated <code>include</code><br>
✦ <strong>LCP preload</strong> — add <code>&lt;link rel="preload"&gt;</code> for the first section's hero image<br>
✦ <strong>Lazy loading</strong> — only the first image should be <code>eager</code>; all others <code>lazy</code></p>
<p>These changes alone can reduce LCP by 30–50% on most Shopify themes.</p>`,
    code: { liquid, schema: '', css: '' }
  };
}

function cssResponse() {
  const css = `/* ===================================================
   Shopify Theme — Mobile-First Responsive CSS
   =================================================== */

/* ── CSS Custom Properties ── */
:root {
  --color-primary: {{ settings.color_primary }};
  --color-secondary: {{ settings.color_secondary }};
  --color-text: {{ settings.color_body_text }};
  --color-bg: {{ settings.color_background_1 }};
  --color-border: rgba(0,0,0,0.12);

  --font-heading: {{ settings.type_header_font.family }}, serif;
  --font-body: {{ settings.type_body_font.family }}, sans-serif;

  --page-width: 1280px;
  --grid-gap: 20px;
  --section-padding: clamp(40px, 6vw, 80px);
  --border-radius: 8px;
  --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ── Reset ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
img { max-width: 100%; height: auto; display: block; }
a { color: inherit; text-decoration: none; }

/* ── Layout ── */
.page-width {
  max-width: var(--page-width);
  margin: 0 auto;
  padding: 0 clamp(16px, 4vw, 40px);
}

/* ── Typography ── */
body {
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.7;
  color: var(--color-text);
  background: var(--color-bg);
}

h1, h2, h3, h4, h5, h6 {
  font-family: var(--font-heading);
  line-height: 1.2;
  font-weight: 700;
}

h1 { font-size: clamp(32px, 5vw, 64px); }
h2 { font-size: clamp(24px, 3.5vw, 48px); }
h3 { font-size: clamp(18px, 2.5vw, 28px); }

/* ── Buttons ── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 28px;
  border-radius: var(--border-radius);
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all var(--transition);
  white-space: nowrap;
}

.btn--primary {
  background: var(--color-primary);
  color: #fff;
}
.btn--primary:hover { filter: brightness(1.1); transform: translateY(-1px); }

.btn--secondary {
  background: var(--color-secondary);
  color: var(--color-text);
}

.btn--outline {
  background: transparent;
  border-color: currentColor;
  color: var(--color-text);
}
.btn--outline:hover { background: var(--color-text); color: var(--color-bg); }

.btn--full { width: 100%; }

/* ── Product Grid ── */
.product-grid {
  display: grid;
  gap: var(--grid-gap);
  grid-template-columns: repeat(2, 1fr);
}

@media (min-width: 768px) {
  .product-grid--3 { grid-template-columns: repeat(3, 1fr); }
  .product-grid--4 { grid-template-columns: repeat(4, 1fr); }
}

/* ── Product Card ── */
.product-card { --img-ratio: 4/5; }

.product-card__media {
  position: relative;
  overflow: hidden;
  border-radius: var(--border-radius);
  aspect-ratio: var(--img-ratio);
  background: #f5f5f5;
  margin-bottom: 12px;
}

.product-card__img {
  width: 100%; height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.product-card__img--hover {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.product-card__media:hover .product-card__img { transform: scale(1.04); }
.product-card__media:hover .product-card__img--hover { opacity: 1; }

.product-card__title {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

/* ── Price ── */
.price { font-size: 15px; font-weight: 600; }
.price--sale { color: #e00; }
.price--compare {
  text-decoration: line-through;
  color: #999;
  font-weight: 400;
  font-size: 13px;
  margin-left: 4px;
}

/* ── Badges ── */
.product-badge {
  position: absolute;
  top: 10px; left: 10px;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  z-index: 1;
}
.product-badge--sale { background: #e00; color: #fff; }
.product-badge--sold-out { background: #222; color: #fff; }

/* ── Form Elements ── */
.quantity-selector {
  display: flex;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  overflow: hidden;
  width: fit-content;
}

.qty-btn {
  width: 40px; height: 40px;
  background: none; border: none;
  cursor: pointer; font-size: 18px;
  color: inherit;
  transition: background var(--transition);
}
.qty-btn:hover { background: #f5f5f5; }

.qty-input {
  width: 48px;
  text-align: center;
  border: none;
  border-left: 1px solid var(--color-border);
  border-right: 1px solid var(--color-border);
  padding: 10px 0;
  font-size: 14px;
  font-family: inherit;
  color: inherit;
  background: none;
  -moz-appearance: textfield;
}
.qty-input::-webkit-inner-spin-button { display: none; }

/* ── Section spacing ── */
.shopify-section + .shopify-section { margin-top: var(--section-padding); }

/* ── Responsive ── */
@media (max-width: 480px) {
  .btn { padding: 12px 20px; font-size: 13px; }
  .product-card__title { font-size: 13px; }
}`;

  return {
    text: `<p>Here's a complete mobile-first CSS foundation for Shopify themes:</p>
<p>✦ <strong>CSS variables</strong> wired to Shopify theme settings (<code>settings.color_primary</code>, etc.)<br>
✦ <strong>Fluid typography</strong> using <code>clamp()</code> — scales smoothly from mobile to desktop<br>
✦ <strong>Responsive grid</strong> — 2 columns mobile, up to 4 on desktop<br>
✦ <strong>Hover image swap</strong> — second product image fades in on hover<br>
✦ <strong>Quantity selector</strong> — styled +/- input with no number arrows<br>
✦ <strong>Button system</strong> — Primary, Secondary, Outline, Full-width variants<br>
✦ <strong>Badge system</strong> — Sale and Sold Out with absolute positioning</p>
<p>The CSS uses <code>clamp()</code> throughout so you rarely need breakpoints for typography. Grid layout handles column counts via class modifiers.</p>`,
    code: { liquid: '', schema: '', css }
  };
}

function testimonialsResponse() {
  const liquid = `{% comment %} Testimonials Section {% endcomment %}
<section class="testimonials section-{{ section.id }}">
  <div class="page-width">
    {%- if section.settings.heading != blank -%}
      <h2 class="section-heading">{{ section.settings.heading }}</h2>
    {%- endif -%}

    <div class="testimonials__grid testimonials__grid--{{ section.settings.columns }}">
      {%- for block in section.blocks -%}
        {%- case block.type -%}
          {%- when 'testimonial' -%}
            <div class="testimonial-card" {{ block.shopify_attributes }}>
              <div class="testimonial-card__stars">
                {%- assign stars = block.settings.rating | times: 1 -%}
                {%- for i in (1..5) -%}
                  <span class="star{% if i <= stars %} filled{% endif %}">★</span>
                {%- endfor -%}
              </div>
              <blockquote class="testimonial-card__quote">
                "{{ block.settings.quote }}"
              </blockquote>
              <div class="testimonial-card__author">
                {%- if block.settings.author_image != blank -%}
                  <div class="testimonial-card__avatar">
                    {{
                      block.settings.author_image
                      | image_url: width: 80
                      | image_tag: loading: 'lazy', class: 'testimonial-card__avatar-img'
                    }}
                  </div>
                {%- else -%}
                  <div class="testimonial-card__avatar testimonial-card__avatar--initials">
                    {{ block.settings.author_name | slice: 0 }}
                  </div>
                {%- endif -%}
                <div>
                  <p class="testimonial-card__name">{{ block.settings.author_name }}</p>
                  {%- if block.settings.author_title != blank -%}
                    <p class="testimonial-card__title">{{ block.settings.author_title }}</p>
                  {%- endif -%}
                </div>
              </div>
              {%- if block.settings.verified -%}
                <span class="verified-badge">✓ Verified Purchase</span>
              {%- endif -%}
            </div>
        {%- endcase -%}
      {%- endfor -%}
    </div>
  </div>
</section>

{% schema %}
{
  "name": "Testimonials",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "What Our Customers Say" },
    { "type": "select", "id": "columns", "label": "Columns", "options": [{"value":"2","label":"2"},{"value":"3","label":"3"}], "default": "3" }
  ],
  "blocks": [{
    "type": "testimonial",
    "name": "Testimonial",
    "settings": [
      { "type": "textarea", "id": "quote", "label": "Quote" },
      { "type": "text", "id": "author_name", "label": "Author name" },
      { "type": "text", "id": "author_title", "label": "Author title" },
      { "type": "image_picker", "id": "author_image", "label": "Author photo" },
      { "type": "range", "id": "rating", "label": "Rating", "min": 1, "max": 5, "step": 1, "default": 5 },
      { "type": "checkbox", "id": "verified", "label": "Verified purchase badge", "default": true }
    ]
  }],
  "presets": [{"name": "Testimonials", "blocks": [{"type":"testimonial"},{"type":"testimonial"},{"type":"testimonial"}]}]
}
{% endschema %}`;

  return {
    text: `<p>Here's a testimonials section with star ratings and verified purchase badges:</p>
<p>✦ <strong>Dynamic star ratings</strong> — loop renders filled/empty stars from 1–5 range setting<br>
✦ <strong>Author avatars</strong> — image picker with initials fallback<br>
✦ <strong>Verified badge</strong> — optional per testimonial<br>
✦ <strong>Responsive grid</strong> — 2 or 3 column layout</p>`,
    code: { liquid, schema: '{}', css: '' }
  };
}

function navigationResponse() {
  return {
    text: `<p>For a Shopify navigation/mega-menu section, I need to know:</p>
<p>✦ Should it be a <strong>mega menu</strong> with columns, or a standard dropdown?<br>
✦ <strong>Mobile behavior</strong> — hamburger menu, slide-in drawer, or full-screen overlay?<br>
✦ <strong>Sticky</strong> on scroll, or static?<br>
✦ Does it need to support <strong>promotional images</strong> in dropdown panels?</p>
<p>Describe your design or upload a screenshot/Figma link and I'll generate the complete Liquid navigation section.</p>`,
    code: null
  };
}

function cartResponse() {
  return {
    text: `<p>I can generate a complete <strong>cart drawer</strong> for Shopify with:</p>
<p>✦ Slide-in drawer from right side<br>
✦ Line item quantity update (AJAX, no page reload)<br>
✦ Remove item with animation<br>
✦ Upsell/cross-sell product recommendations<br>
✦ Free shipping progress bar<br>
✦ Discount code input<br>
✦ Checkout button with cart total</p>
<p>This requires both a <code>cart-drawer.liquid</code> section and a <code>cart-drawer.js</code> snippet using the Cart API (<code>/cart/update.js</code>, <code>/cart/change.js</code>). Want me to generate the full implementation?</p>`,
    code: null
  };
}

function figmaResponse() {
  return {
    text: `<p>I can convert Figma designs to Shopify sections. For best results:</p>
<p>✦ Attach the Figma URL using the <strong>Figma button</strong> in the toolbar below<br>
✦ Or take a <strong>screenshot</strong> of the design and attach it as an image<br>
✦ Describe which component you want converted (hero, card, footer, etc.)</p>
<p>I'll analyze the layout, identify Liquid variables for dynamic content, generate the section schema, and write mobile-responsive CSS matching the design.</p>`,
    code: null
  };
}

function fileAnalysisResponse(fileNames) {
  return {
    text: `<p>I've received <code>${fileNames}</code>. Here's what I can do with it:</p>
<p>✦ If it's a <strong>.liquid file</strong> — I'll review it for errors, optimization opportunities, and best practices<br>
✦ If it's an <strong>.html file</strong> — I'll convert it to a proper Shopify section with schema<br>
✦ If it's a <strong>screenshot</strong> — I'll analyze the design and generate matching Liquid + CSS<br>
✦ If it's a <strong>.json schema</strong> — I'll validate it and suggest improvements</p>
<p>What would you like me to do with this file? You can also describe what you're trying to achieve.</p>`,
    code: null
  };
}

function defaultShopifyResponse(prompt) {
  const liquid = `{% comment %} Shopify Liquid — Generated by LiquidAI {% endcomment %}
<section class="custom-section section-{{ section.id }}">
  <div class="page-width">
    <h2>{{ section.settings.heading }}</h2>
    <div class="rte">{{ section.settings.content }}</div>
  </div>
</section>

{% schema %}
{
  "name": "Custom Section",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Your Heading Here" },
    { "type": "richtext", "id": "content", "label": "Content" }
  ],
  "presets": [{ "name": "Custom Section" }]
}
{% endschema %}`;

  return {
    text: `<p>I'm your Shopify development assistant. I can help you with:</p>
<p>✦ <strong>Generate sections</strong> — Hero, Product Page, Collection, FAQ, Testimonials, and more<br>
✦ <strong>Convert HTML</strong> — Turn static designs into dynamic Liquid sections<br>
✦ <strong>Debug errors</strong> — Fix Liquid syntax errors and logic bugs<br>
✦ <strong>Schema creation</strong> — Build complete theme editor schemas<br>
✦ <strong>CSS optimization</strong> — Mobile-first responsive stylesheets<br>
✦ <strong>Code optimization</strong> — Improve performance and follow Shopify best practices</p>
<p>What would you like to build? You can also upload screenshots, Figma links, or existing Liquid files.</p>`,
    code: { liquid, schema: '', css: '' }
  };
}

// ── Image Analysis ──

function openAnalysisOverlay() {
  const imageFile = pendingImageFile || attachedFiles.find(f => f.type && f.type.startsWith('image/'));
  if (!imageFile) {
    showToast('Attach an image first');
    return;
  }
  pendingImageFile = imageFile;

  // Show image in overlay
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('analysisImagePreview').src = e.target.result;
    document.getElementById('analysisPrompt').value = '';
    showStep(1);
    document.getElementById('analysisOverlay').style.display = 'flex';
  };
  reader.readAsDataURL(imageFile);
}

function closeAnalysis() {
  if (analysisAbortCtrl) {
    analysisAbortCtrl.abort();
    analysisAbortCtrl = null;
  }
  document.getElementById('analysisOverlay').style.display = 'none';
  const oldBox = document.getElementById('analysisErrorBox');
  if (oldBox) oldBox.remove();
  showStep(1);
}

function showStep(n) {
  [1, 2, 3].forEach(i => {
    const el = document.getElementById(`analysisStep${i}`);
    if (el) el.style.display = i === n ? 'block' : 'none';
  });
}

const PROGRESS_STEPS = [
  { id: 'logRow1', pct: 12, status: 'Identifying section type & layout…' },
  { id: 'logRow2', pct: 32, status: 'Writing Liquid markup & schema…' },
  { id: 'logRow3', pct: 55, status: 'Generating scoped {% style %} CSS…' },
  { id: 'logRow4', pct: 74, status: 'Building {% schema %} settings…' },
  { id: 'logRow5', pct: 90, status: 'Rendering pixel-accurate preview…' },
];
let _stepIdx = 0;

function advanceStep() {
  if (_stepIdx >= PROGRESS_STEPS.length) return;
  const step = PROGRESS_STEPS[_stepIdx];
  // Mark previous done
  if (_stepIdx > 0) {
    const prev = document.getElementById(PROGRESS_STEPS[_stepIdx - 1].id);
    if (prev) { prev.classList.remove('active'); prev.classList.add('done'); }
  } else {
    const row1 = document.getElementById('logRow1');
    if (row1) { row1.classList.remove('active'); row1.classList.add('done'); }
  }
  const row = document.getElementById(step.id);
  if (row) row.classList.add('active');
  document.getElementById('analysisStatusText').textContent = step.status;
  document.getElementById('analysisProgressFill').style.width = step.pct + '%';
  _stepIdx++;
}

async function runImageAnalysis() {
  if (!pendingImageFile) return;

  const runBtn = document.getElementById('analysisRunBtn');
  runBtn.disabled = true;

  // Reset log state
  _stepIdx = 0;
  PROGRESS_STEPS.forEach(s => {
    const r = document.getElementById(s.id);
    if (r) { r.classList.remove('active', 'done'); }
  });
  const row1 = document.getElementById('logRow1');
  if (row1) { row1.classList.remove('done'); row1.classList.add('active'); }
  document.getElementById('analysisProgressFill').style.width = '5%';
  document.getElementById('analysisStatusText').textContent = 'Analyzing design layout...';

  showStep(2);

  const userPrompt = document.getElementById('analysisPrompt').value.trim();

  try {
    // Convert file to base64
    const { base64, mediaType } = await fileToBase64(pendingImageFile);

    analysisAbortCtrl = new AbortController();

    const response = await fetch('http://localhost:3001/api/analyze-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64, mediaType, userPrompt }),
      signal: analysisAbortCtrl.signal
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let stepTimer = setInterval(advanceStep, 2800);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;

        let evt;
        try { evt = JSON.parse(raw); } catch { continue; }

        if (evt.type === 'status') {
          document.getElementById('analysisStatusText').textContent = evt.message;
        } else if (evt.type === 'complete') {
          clearInterval(stepTimer);
          handleAnalysisComplete(evt.data);
          return;
        } else if (evt.type === 'error') {
          clearInterval(stepTimer);
          throw new Error(evt.message);
        }
      }
    }

    clearInterval(stepTimer);

  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('Analysis error:', err);
    showStep(1);
    runBtn.disabled = false;

    // Friendly error UI
    const isConnErr = err.message.includes('fetch') || err.message.includes('Failed to fetch') || err.message.includes('Server error');
    if (isConnErr) {
      showAnalysisError('Cannot connect to server.\n\nRun: npm install && npm start\nthen refresh the page.');
    } else {
      showAnalysisError(err.message);
    }
  }
}

function showAnalysisError(msg) {
  // Remove any old error box
  const oldBox = document.getElementById('analysisErrorBox');
  if (oldBox) oldBox.remove();

  const isAuthError = msg.includes('API key') || msg.includes('apiKey') || msg.includes('authentication') || msg.includes('authToken');

  const box = document.createElement('div');
  box.id = 'analysisErrorBox';
  box.style.cssText = `
    background: rgba(255,80,80,0.08);
    border: 1px solid rgba(255,80,80,0.3);
    border-radius: 10px;
    padding: 14px 16px;
    margin-top: 16px;
    font-size: 13px;
    line-height: 1.6;
    color: #ff6b6b;
  `;

  if (isAuthError) {
    box.innerHTML = `
      <strong style="display:block;margin-bottom:6px;">⚠ API Key Not Set</strong>
      <span style="color:var(--text-secondary)">Open a terminal in the project folder and run:</span>
      <pre style="margin:8px 0 4px;background:rgba(0,0,0,0.3);border-radius:6px;padding:8px 10px;font-size:11.5px;color:#e0e0e0;overflow-x:auto;">$env:ANTHROPIC_API_KEY="sk-ant-..."
npm start</pre>
      <span style="color:var(--text-secondary);font-size:12px;">Get your key at <strong style="color:#ff6b6b;">console.anthropic.com</strong></span>
    `;
  } else {
    box.innerHTML = `<strong>⚠ Error</strong><br><span style="color:var(--text-secondary)">${escapeHtml(msg)}</span>`;
  }

  // Insert box inside the analysis card, after the header
  const card = document.querySelector('.analysis-card');
  const step1 = document.getElementById('analysisStep1');
  if (step1) step1.appendChild(box);

  document.getElementById('analysisRunBtn').disabled = false;
}

function handleAnalysisComplete(data) {
  const slug = data.section_name || 'section';
  currentCode._name = slug;
  currentCode.preview_html = data.preview_html || '';

  // ── The complete .liquid file is the source of truth ──
  const liquidFile = data.liquid_file || data.liquid || '';
  currentCode.liquid = liquidFile;

  // ── Extract {% style %} block ──
  const styleMatch = liquidFile.match(/\{%-?\s*style\s*-?%\}([\s\S]*?)\{%-?\s*endstyle\s*-?%\}/i);
  currentCode.css = styleMatch ? styleMatch[1].trim() : '';

  // ── Extract {% javascript %} block ──
  const jsMatch = liquidFile.match(/\{%-?\s*javascript\s*-?%\}([\s\S]*?)\{%-?\s*endjavascript\s*-?%\}/i);
  currentCode.js = jsMatch ? jsMatch[1].trim() : '';

  // ── Extract {% schema %} block and pretty-print ──
  const schemaMatch = liquidFile.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i);
  if (schemaMatch) {
    try {
      currentCode.schema = JSON.stringify(JSON.parse(schemaMatch[1].trim()), null, 2);
    } catch {
      currentCode.schema = schemaMatch[1].trim();
    }
  } else {
    currentCode.schema = '';
  }

  // ── Line counts for stats ──
  const liquidLines  = liquidFile.split('\n').length;
  const cssLines     = currentCode.css  ? currentCode.css.split('\n').length  : 0;
  const jsLines      = currentCode.js   ? currentCode.js.split('\n').length   : 0;
  const schemaKeys   = (() => {
    try { return Object.keys(JSON.parse(currentCode.schema)); } catch { return []; }
  })();
  const settingCount = (() => {
    try {
      const s = JSON.parse(currentCode.schema);
      return (s.settings || []).filter(x => x.type !== 'header' && x.type !== 'paragraph').length
           + (s.blocks || []).reduce((a, b) => a + (b.settings || []).length, 0);
    } catch { return 0; }
  })();

  // ── Build stat chips ──
  const stats = [
    { label: `${liquidLines} lines total` },
    ...(cssLines   ? [{ label: `${cssLines} lines CSS` }]              : []),
    ...(jsLines    ? [{ label: `${jsLines} lines JS` }]                : []),
    ...(settingCount ? [{ label: `${settingCount} schema settings` }]  : []),
    ...(currentCode.preview_html ? [{ label: 'Live preview ready' }]   : []),
  ];

  document.getElementById('analysisSuccessDesc').textContent =
    data.description || `Generated a complete "${data.title || slug}" Shopify section.`;

  document.getElementById('analysisSuccessStats').innerHTML = stats.map(s => `
    <span class="stat-chip">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.3"/><path d="M4 6l1.5 1.5L8 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      ${s.label}
    </span>`).join('');

  // ── Update code-panel tab labels ──
  const tabLabels = {
    liquid:  `${slug}.liquid`,
    schema:  'schema.json',
    css:     'styles.css',
    js:      jsLines ? 'script.js' : 'script.js',
    preview: 'Preview',
  };
  document.querySelectorAll('.code-tab').forEach(t => {
    if (tabLabels[t.dataset.tab] && t.dataset.tab !== 'preview') {
      t.textContent = tabLabels[t.dataset.tab];
    }
  });
  // Hide JS tab if no JS was generated
  const jsTab = document.querySelector('.code-tab[data-tab="js"]');
  if (jsTab) jsTab.style.display = jsLines ? '' : 'none';

  // ── Show success ──
  showStep(3);
  document.getElementById('analysisProgressFill').style.width = '100%';

  // ── Open preview tab by default ──
  if (currentCode.preview_html) {
    switchToTab('preview');
  } else {
    switchToTab('liquid');
  }
  openCodePanel();

  // ── Chat message ──
  activateChat();
  messageCount++;
  const title = data.title || slug;
  chatTitle.textContent = title;

  const fileRef = `<code>${slug}.liquid</code>`;
  appendAssistantMessage(
    `<p>Generated <strong>${title}</strong> — a complete, deployment-ready Shopify OS 2.0 section.</p>
     <p>${data.description || ''}</p>
     <p>✦ <strong>Preview tab</strong> — live render matching your design<br>
     ✦ <strong>${slug}.liquid</strong> — full section file (markup + {% style %} + {% javascript %} + {% schema %})<br>
     ✦ <strong>styles.css</strong> — extracted scoped CSS<br>
     ✦ <strong>schema.json</strong> — extracted schema (${settingCount} settings)<br>
     ✦ Click <strong>Download</strong> on the ${fileRef} tab to save the production file<br>
     ✦ Drop it into <code>sections/${slug}.liquid</code> in your theme</p>`,
    { liquid: liquidFile.slice(0, 900) + (liquidFile.length > 900 ? '\n… (full file in panel →)' : '') }
  );

  // ── Clean up image chip ──
  pendingImageFile = null;
  attachedFiles = attachedFiles.filter(f => !(f.type && f.type.startsWith('image/')));
  renderFilePreviews();
  document.getElementById('analyzeImageTrigger').classList.remove('visible');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, mediaType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Theme ──
function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
  showToast(current === 'dark' ? 'Light mode' : 'Dark mode');
}
