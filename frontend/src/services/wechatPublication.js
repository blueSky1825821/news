const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

export function publicationUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

export function formatWechatPublication({ articles }) {
  const headlines = articles.map(article => article.title?.trim()).filter(Boolean);
  const lines = headlines.map((title, index) => headlines.length > 1 ? `${index + 1}. ${title}` : title);
  return {
    html: `<section style="font-family:system-ui,sans-serif;color:#172b43;word-break:break-word;">${lines.map(line =>
      `<p style="margin:0 0 10px;font-size:16px;line-height:1.7;">${escapeHtml(line)}</p>`
    ).join('')}</section>`,
    text: lines.join('\n')
  };
}

export async function copyWechatPublication({ html, text }) {
  try {
    if (html && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' })
      })]);
      return;
    }
    if (!html && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Try the copy event when the async clipboard is unavailable or denied.
  }

  let written = false;
  const onCopy = (event) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/plain', text);
    if (html) event.clipboardData.setData('text/html', html);
    event.preventDefault();
    written = true;
  };
  document.addEventListener('copy', onCopy);
  try {
    if (!document.execCommand('copy') || !written) throw new Error('浏览器未允许复制');
  } finally {
    document.removeEventListener('copy', onCopy);
  }
}
