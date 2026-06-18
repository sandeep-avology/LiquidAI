/**
 * Extracts a color palette from an image file using Canvas.
 * Returns { background, foreground, primary, muted, border, card, isDark }
 */
export function extractImageColors(file) {
  return new Promise(resolve => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const SIZE   = 120; // sample at low res for speed
        const ratio  = Math.min(SIZE / img.width, SIZE / img.height, 1);
        const w      = Math.max(1, Math.round(img.width  * ratio));
        const h      = Math.max(1, Math.round(img.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);

        // Count bucketed colors (bucket size = 24)
        const buckets = {};
        for (let i = 0; i < data.length; i += 4) {
          const r = Math.round(data[i]   / 24) * 24;
          const g = Math.round(data[i+1] / 24) * 24;
          const b = Math.round(data[i+2] / 24) * 24;
          const k = `${r},${g},${b}`;
          buckets[k] = (buckets[k] || 0) + 1;
        }

        const sorted = Object.entries(buckets)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([k]) => {
            const [r, g, b] = k.split(',').map(Number);
            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const sat = Math.max(r, g, b) - Math.min(r, g, b);
            const hex = '#' + [r, g, b].map(v => Math.min(255, v).toString(16).padStart(2, '0')).join('');
            return { r, g, b, lum, sat, hex };
          });

        if (!sorted.length) { URL.revokeObjectURL(url); return resolve(null); }

        // Background = most common color
        const background = sorted[0].hex;
        const isDark     = sorted[0].lum < 128;

        // Foreground = most contrasting to background
        const foreground = sorted
          .slice(0, 10)
          .sort((a, b) => Math.abs(b.lum - sorted[0].lum) - Math.abs(a.lum - sorted[0].lum))[0]?.hex
          || (isDark ? '#ffffff' : '#111111');

        // Primary/accent = most saturated non-neutral color
        const primary = sorted
          .filter(c => c.sat > 40)
          .sort((a, b) => b.sat - a.sat)[0]?.hex
          || (isDark ? '#3b82f6' : '#2563eb');

        // Muted = medium luminance
        const muted = sorted
          .filter(c => c.lum > 60 && c.lum < 180 && c.sat < 40)
          .sort((a, b) => Math.abs(a.lum - 120) - Math.abs(b.lum - 120))[0]?.hex
          || (isDark ? 'rgba(255,255,255,0.6)' : '#6b7280');

        const border = isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb';
        const card   = isDark ? 'rgba(255,255,255,0.05)' : '#ffffff';

        URL.revokeObjectURL(url);
        resolve({ background, foreground, primary, muted, border, card, isDark });
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target.result;
      const base64  = dataUrl.split(',')[1];
      const mediaType = file.type || 'image/jpeg';
      resolve({ base64, mediaType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function getFileIcon(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  const colors = { liquid:'#00b4d8', html:'#e34c26', css:'#264de4', js:'#f0db4f', json:'#ffe566', jsx:'#61dafb', tsx:'#61dafb', vue:'#42b883', png:'#a855f7', jpg:'#a855f7', jpeg:'#a855f7', webp:'#a855f7', gif:'#a855f7', svg:'#f97316' };
  const c = colors[ext] || '#8a8a9a';
  return `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="10" height="12" rx="1.5" stroke="${c}" stroke-width="1.3"/><path d="M4 4.5h6M4 7h6M4 9.5h3.5" stroke="${c}" stroke-width="1.1" stroke-linecap="round"/></svg>`;
}

export function extractCodeParts(liquidFile) {
  if (!liquidFile) return { schema: '', css: '', js: '' };
  const schema = (liquidFile.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i) || [])[1]?.trim() || '';
  const css    = (liquidFile.match(/\{%-?\s*style\s*-?%\}([\s\S]*?)\{%-?\s*endstyle\s*-?%\}/i)  || [])[1]?.trim() || '';
  const js     = (liquidFile.match(/\{%-?\s*javascript\s*-?%\}([\s\S]*?)\{%-?\s*endjavascript\s*-?%\}/i) || [])[1]?.trim() || '';
  return { schema, css, js };
}

export function countSettings(schemaStr) {
  if (!schemaStr) return 0;
  try {
    const obj = JSON.parse(schemaStr);
    return (obj.settings || []).length + (obj.blocks || []).reduce((n, b) => n + (b.settings || []).length, 0);
  } catch { return (schemaStr.match(/"id"/g) || []).length; }
}

export function copyCode(currentCode, activeFile, showToast) {
  const file = currentCode.files?.find(f => f.name === activeFile);
  const text = file?.content || '';
  if (!text) { showToast('Nothing to copy'); return; }
  navigator.clipboard.writeText(text).then(() => showToast('Copied!')).catch(() => showToast('Copy failed'));
}

export function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function downloadCode(currentCode, activeFile, showToast) {
  const file = currentCode.files?.find(f => f.name === activeFile);
  if (!file) { showToast('Nothing to download'); return; }
  downloadFile(file.content, file.name);
  showToast(`Downloaded ${file.name}`);
}

export function downloadAllFiles(currentCode, showToast) {
  const files = currentCode.files || [];
  if (!files.length) { showToast('Nothing to download'); return; }
  files.forEach((f, i) => setTimeout(() => downloadFile(f.content, f.name), i * 220));
  showToast(`Downloading ${files.length} file${files.length > 1 ? 's' : ''}`);
}
