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

function formatDate(value) {
  if (!value) return '';
  const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(' ', 'T')}Z` : value;
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric'
  }) : '';
}

function summaryParagraphs(value) {
  let text = String(value || '');
  if (/<[a-z][^>]*>/i.test(text)) {
    const template = document.createElement('template');
    template.innerHTML = text;
    template.content.querySelectorAll('script, style').forEach((node) => node.remove());
    template.content.querySelectorAll('br, p, div, li').forEach((node) => node.after('\n'));
    text = template.content.textContent;
  }
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function formatWechatPublication({ title, createdAt, articles, url }) {
  const listUrl = publicationUrl(url);
  const heading = title || '新闻简报';
  const edition = [formatDate(createdAt), `共 ${articles.length} 篇`].filter(Boolean).join(' · ');
  const textSections = [];
  const htmlSections = articles.map((article, index) => {
    const number = articles.length > 1 ? String(index + 1).padStart(2, '0') : '';
    const headline = article.title || '新闻';
    const source = [article.sourceName, formatDate(article.publishedAt)].filter(Boolean).join(' · ');
    const summary = summaryParagraphs(article.summary);
    const originalUrl = publicationUrl(article.originalUrl);
    textSections.push([number ? `${number}  ${headline}` : headline, source, ...summary,
      originalUrl ? `阅读原文：${originalUrl}` : ''].filter(Boolean).join('\n'));
    return `<section style="margin:0 0 22px;padding:0 0 20px;border-bottom:1px solid #dce3e9;">
      <p style="margin:0 0 7px;font-size:18px;line-height:1.55;color:#172b43;"><strong>${number ? `<span style="color:#a52833;">${number}</span>&nbsp;&nbsp;` : ''}${escapeHtml(headline)}</strong></p>
      ${source ? `<p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#626e7b;">${escapeHtml(source)}</p>` : ''}
      ${summary.map((line) => `<p style="margin:0 0 10px;font-size:16px;line-height:1.8;color:#263445;">${escapeHtml(line)}</p>`).join('')}
      ${originalUrl ? `<p style="margin:8px 0 0;font-size:14px;"><a href="${escapeHtml(originalUrl)}" style="color:#315c88;text-decoration:underline;">阅读原文</a></p>` : ''}
    </section>`;
  });
  return {
    html: `<section style="font-family:system-ui,sans-serif;color:#172b43;word-break:break-word;">
      <p style="margin:0 0 22px;padding:12px 14px;border-left:4px solid #a52833;background-color:#f3f5f7;font-size:14px;line-height:1.6;color:#47586b;"><strong>${escapeHtml(edition)}</strong></p>
      ${htmlSections.join('')}
      ${listUrl ? `<p style="margin:0;text-align:center;font-size:15px;line-height:1.65;"><strong><a href="${escapeHtml(listUrl)}" style="color:#315c88;text-decoration:underline;">查看完整新闻列表</a></strong></p>` : ''}
    </section>`,
    text: [heading, edition, ...textSections, listUrl ? `完整新闻列表：${listUrl}` : ''].filter(Boolean).join('\n\n')
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
