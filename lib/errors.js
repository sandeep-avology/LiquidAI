function getErrorMessage(err, { apiKeyConfigured, apiKeyStatus } = {}) {
  const msg = err?.message || '';
  const status = err?.status;

  if (!apiKeyConfigured || apiKeyStatus === 'missing' || apiKeyStatus === 'placeholder') {
    if (apiKeyStatus === 'placeholder') {
      return 'API key is still the placeholder. Open .env and replace YOUR_KEY_HERE with your real key from console.anthropic.com, then restart npm run dev.';
    }
    return 'API key not configured. Create a .env file with ANTHROPIC_API_KEY=sk-ant-... then restart: npm run dev';
  }

  if (status === 401 || /invalid.*api.*key|authentication_error|invalid x-api-key/i.test(msg)) {
    return 'Invalid API key. Check your ANTHROPIC_API_KEY in .env at console.anthropic.com';
  }

  if (status === 403) return 'API access forbidden. Your key may lack permissions for this model.';
  if (status === 429 || /rate.?limit/i.test(msg)) return 'Rate limit reached. Please wait a moment and try again.';
  if (status === 529 || /overloaded/i.test(msg)) return 'Claude is overloaded. Please try again in a few seconds.';
  if (/ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(msg)) {
    return 'Cannot reach the Anthropic API. Check your internet connection.';
  }
  if (/Could not resolve authentication/i.test(msg)) {
    return 'API key not configured. Set ANTHROPIC_API_KEY in .env and restart the server.';
  }

  return msg || 'An unexpected error occurred. Please try again.';
}

module.exports = { getErrorMessage };
