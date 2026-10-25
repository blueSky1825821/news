import Parser from 'rss-parser';
import { insertArticle } from '../models/article.js';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'NewsBroadcastingBot/1.0' }
});

export function normalizeArticle(item, sourceId) {
  return {
    title: (item.title || '').trim(),
    summary: (item.contentSnippet || item.summary || '').trim(),
    content: (item['content:encoded'] || item.content || '').trim(),
    originalUrl: (item.link || item.guid || '').trim(),
    sourceId,
    publishedAt: item.isoDate || item.pubDate || null
  };
}

async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await parser.parseURL(url);
    } catch (err) {
      if (i === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

export async function crawlSource(source) {
  const feed = await fetchWithRetry(source.rssUrl);
  const results = [];
  for (const item of (feed.items || [])) {
    const article = normalizeArticle(item, source.id);
    if (!article.title || !article.originalUrl) continue;
    const id = insertArticle(article);
    if (id) results.push({ ...article, id });
  }
  return results;
}

export async function crawlAllSources(sources) {
  const allResults = [];
  for (const source of sources) {
    try {
      const articles = await crawlSource(source);
      allResults.push({ source: source.name, count: articles.length, articles });
    } catch (err) {
      console.error(`Failed to crawl ${source.name}:`, err.message);
      allResults.push({ source: source.name, count: 0, error: err.message });
    }
  }
  return allResults;
}
