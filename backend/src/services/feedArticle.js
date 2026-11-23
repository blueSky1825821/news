import { escapeHtml } from '../utils/html.js';

export function itemText(value) {
  const text = typeof value === 'string' ? value : value?._;
  return typeof text === 'string' ? text.trim() : '';
}

export function articleUrl(value, baseUrl) {
  const text = itemText(value);
  if (!text) return '';
  try {
    const url = new URL(text, baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    // Keep existing absolute URLs stable for the database's unique URL constraint.
    return /^https?:\/\//i.test(text) ? text : url.href;
  } catch {
    return '';
  }
}

function articleContent(item, baseUrl) {
  const content = itemText(item?.['content:encoded']) || itemText(item?.content) || itemText(item?.summary);
  if (/<(?:img|picture)\b/i.test(content)) return content;

  const media = [item?.enclosure, ...(item?.mediaContent ?? []).map(entry => entry.$)].filter(Boolean);
  const imageUrl = media
    .filter(entry => entry.medium === 'image' || /^image\//i.test(entry.type ?? ''))
    .concat((item?.mediaThumbnails ?? []).map(entry => entry.$).filter(Boolean))
    .map(entry => articleUrl(entry.url, baseUrl)).find(Boolean);
  return imageUrl ? `<p><img src="${escapeHtml(imageUrl)}" alt=""></p>${content}` : content;
}

export function normalizeArticle(item, sourceId, baseUrl) {
  const date = [item?.isoDate, item?.pubDate, item?.date].map(itemText).map(Date.parse).find(Number.isFinite);
  const originalUrl = articleUrl(item?.link, baseUrl) || articleUrl(item?.guid) || articleUrl(item?.id);
  return {
    title: itemText(item?.title),
    summary: itemText(item?.contentSnippet) || itemText(item?.summary) || itemText(item?.description),
    content: articleContent(item, originalUrl || baseUrl),
    originalUrl,
    sourceId,
    publishedAt: date === undefined ? null : new Date(date).toISOString()
  };
}

