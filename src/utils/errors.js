export function classifyApiError(message = '', health = {}) {
  const msg    = String(message)
  const status = health.apiKeyStatus

  if (
    status === 'placeholder' ||
    /placeholder.*key|YOUR_KEY|still the placeholder/i.test(msg)
  ) {
    return {
      kind:  'placeholder_key',
      title: 'Replace Placeholder API Key',
      body:  'Your .env file still has the example key. Open .env, paste your real Grok key from console.x.ai, then restart the server.',
    }
  }

  if (
    status === 'missing' ||
    msg.includes('API_KEY_NOT_CONFIGURED') ||
    /not configured|API key not configured/i.test(msg)
  ) {
    return {
      kind:  'missing_key',
      title: 'Grok API Key Not Set',
      body:  'Create a .env file with XAI_API_KEY=xai-... then restart the server.',
    }
  }

  if (/Invalid.*key|invalid.*api.*key|authentication_error|Unauthorized/i.test(msg) || /\b401\b/.test(msg)) {
    return {
      kind:  'invalid_key',
      title: 'Invalid Grok API Key',
      body:  'Your API key was rejected. Verify XAI_API_KEY in .env at console.x.ai.',
    }
  }

  if (/forbidden|403/.test(msg)) {
    return {
      kind:  'invalid_key',
      title: 'API Access Denied',
      body:  'Your Grok API key does not have permission. Check your plan at console.x.ai.',
    }
  }

  if (
    health.serverReachable === false ||
    /Failed to fetch|NetworkError|fetch failed|Cannot connect|ECONNREFUSED/i.test(msg)
  ) {
    return {
      kind:  'connection',
      title: 'Cannot Connect to Server',
      body:  'Run npm run dev in the project folder. Both the API and Vite must be running.',
    }
  }

  if (/Rate limit|429/i.test(msg)) {
    return { kind: 'rate_limit', title: 'Rate Limited', body: msg }
  }

  if (/overloaded|503/i.test(msg)) {
    return { kind: 'overloaded', title: 'Service Busy', body: msg }
  }

  return { kind: 'unknown', title: 'Error', body: msg || 'Something went wrong. Please try again.' }
}

export function formatErrorHtml(message, health = {}) {
  const { kind, title, body } = classifyApiError(message, health)

  if (kind === 'missing_key' || kind === 'placeholder_key') {
    return `<p style="color:#ff6b6b;font-weight:600;margin:0 0 6px">⚠ ${title}</p>
      <p style="margin:0 0 10px;color:var(--text-secondary);font-size:12px">${body}</p>
      <div style="display:flex;gap:8px;align-items:center">
        <input id="inline-key-input" type="text" placeholder="Paste your Grok key here (xai-...)" autocomplete="off" spellcheck="false"
          style="flex:1;background:rgba(0,0,0,0.35);border:1px solid rgba(255,107,107,0.4);border-radius:6px;padding:8px 10px;font-size:12px;color:#fff;outline:none;font-family:monospace" />
        <button onclick="(function(){
          var k=document.getElementById('inline-key-input').value.trim();
          if(!k){return;}
          var token=localStorage.getItem('liquidai_token')||'';
          fetch('/api/settings/api-key',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({apiKey:k}),credentials:'include'})
            .then(r=>r.json()).then(d=>{if(d.ok){window.location.reload();}else{alert(d.error||'Invalid key');}})
            .catch(()=>alert('Could not save key. Paste it in the banner above instead.'));
        })()"
          style="background:#22c55e;color:#000;border:none;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">
          Save Key
        </button>
      </div>
      <p style="font-size:11px;margin:8px 0 0;color:var(--text-secondary)">
        Get a free key at <a href="https://console.x.ai" target="_blank" style="color:#22c55e;text-decoration:none;font-weight:600">console.x.ai</a>
      </p>`
  }

  if (kind === 'invalid_key') {
    return `<p style="color:#ff6b6b;font-weight:600">⚠ ${title}</p>
      <p style="margin:6px 0;color:var(--text-secondary)">${body}</p>
      <p style="font-size:12px;margin-top:6px;color:var(--text-secondary)">Get a valid key at <strong style="color:#ff6b6b">console.x.ai</strong></p>`
  }

  if (kind === 'connection') {
    return `<p style="color:#ff6b6b;font-weight:600">⚠ ${title}</p>
      <p style="margin:6px 0 8px;color:var(--text-secondary)">${body}</p>
      <pre style="background:rgba(0,0,0,0.3);border-radius:6px;padding:10px 12px;font-size:12px;overflow:auto">npm run dev</pre>`
  }

  return `<p style="color:#ff6b6b;font-weight:600">⚠ ${title}</p>
    <p style="margin:6px 0;color:var(--text-secondary)">${body.replace(/\n/g, '<br>')}</p>`
}
