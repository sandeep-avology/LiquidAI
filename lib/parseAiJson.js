/**
 * Parse JSON from Claude responses that may include markdown fences or prose.
 * Uses brace-matching so liquid_file content with nested braces won't break parsing.
 */
function parseAiJson(fullText) {
  if (!fullText || typeof fullText !== 'string') return null;

  let text = fullText.trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];

    if (inString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inString = false;
      continue;
    }

    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

module.exports = { parseAiJson };
