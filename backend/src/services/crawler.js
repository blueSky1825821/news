import Parser from 'rss-parser';
import { setTimeout as delay } from 'node:timers/promises';
import { insertArticles } from '../models/article.js';
import { createLogger, elapsedMs, errorDetails } from '../utils/logger.js';

const logger = createLogger('rss');

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 5_000;
const BATCH_CONCURRENCY = 3;
const DEFAULT_RATE_LIMIT_DELAY_MS = 60_000;

class FeedParser extends Parser {
  parseItemAtom(entry) {
    // rss-parser converts Atom dates before returning items. One malformed date
    // would otherwise reject the entire feed.
    const item = { ...entry };
    for (const field of ['published', 'updated']) {
      const value = itemText(item[field]?.[0]);
      item[field] = Number.isFinite(Date.parse(value)) ? [value] : [];
    }
    return super.parseItemAtom(item);
  }
}

const parser = new FeedParser({ defaultRSS: 2 });
const headers = {
  'User-Agent': 'NewsBroadcastingBot/1.0',
  Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
};

class FeedError extends Error {
  constructor(type, message, { cause, retryable = false, retryAfterMs = 0, cooldownMs = 0 } = {}) {
    super(message, { cause });
    this.type = type;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.cooldownMs = cooldownMs;
  }
}

function itemText(value) {
  const text = typeof value === 'string' ? value : value?._;
  return typeof text === 'string' ? text.trim() : '';
}

function articleUrl(value, baseUrl) {
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

export function normalizeArticle(item, sourceId, baseUrl) {
  const date = [item?.isoDate, item?.pubDate, item?.date].map(itemText).map(Date.parse).find(Number.isFinite);
  return {
    title: itemText(item?.title),
    summary: itemText(item?.contentSnippet) || itemText(item?.summary) || itemText(item?.description),
    content: itemText(item?.['content:encoded']) || itemText(item?.content),
    originalUrl: articleUrl(item?.link, baseUrl) || articleUrl(item?.guid) || articleUrl(item?.id),
    sourceId,
    publishedAt: date === undefined ? null : new Date(date).toISOString()
  };
}

export function classifyError(err) {
  return {
    type: err instanceof FeedError ? err.type : 'unknown',
    message: err instanceof Error ? err.message : String(err),
    cooldownMs: err instanceof FeedError ? err.cooldownMs : 0
  };
}

function retryAfterMs(header) {
  if (!header) return 0;
  const timestamp = /^\d+$/.test(header) ? Date.now() + Number(header) * 1_000 : Date.parse(header);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

async function readFeedBody(response) {
  if (!response.body) throw new FeedError('parse', 'RSS 返回空响应');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > MAX_FEED_BYTES) throw new FeedError('format', 'RSS 响应超过 5 MB');
    chunks.push(chunk);
  }

  const bytes = Buffer.concat(chunks, size);
  const prefix = bytes.subarray(0, 256).toString('latin1');
  const xmlEncoding = prefix.match(/^\s*<\?xml\b[^>]*\bencoding\s*=\s*["']([^"']+)/i)?.[1];
  const httpEncoding = response.headers.get('content-type')?.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1];
  const bomEncoding = prefix.startsWith('\xFF\xFE') ? 'utf-16le' : prefix.startsWith('\xFE\xFF') ? 'utf-16be' : null;
  try {
    return new TextDecoder(bomEncoding || xmlEncoding || httpEncoding || 'utf-8').decode(bytes);
  } catch (cause) {
    throw new FeedError('format', 'RSS 使用了无法识别的字符编码', { cause });
  }
}

async function fetchFeed(url) {
  let document;
  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      const { status } = response;
      const retryAfter = retryAfterMs(response.headers.get('retry-after'));
      const cooldownMs = status === 429 ? retryAfter || DEFAULT_RATE_LIMIT_DELAY_MS
        : status === 503 ? retryAfter : 0;
      throw new FeedError('http', `RSS 请求失败（HTTP ${status}）`, {
        retryable: status === 408 || status === 429 || status >= 500,
        retryAfterMs: cooldownMs || retryAfter,
        cooldownMs
      });
    }
    document = await readFeedBody(response);
  } catch (err) {
    if (err instanceof FeedError) throw err;
    if (err.name === 'TimeoutError') {
      throw new FeedError('network', 'RSS 请求超时', { cause: err, retryable: true });
    }
    if (err.cause?.message === 'redirect count exceeded') {
      throw new FeedError('http', 'RSS 重定向次数过多', { cause: err });
    }
    const code = err.cause?.code;
    const permanent = ['ENOTFOUND', 'ERR_TLS_CERT_ALTNAME_INVALID', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'];
    const detail = code || err.message;
    throw new FeedError('network', `RSS 连接失败（${detail}）`, { cause: err, retryable: !permanent.includes(code) });
  }

  try {
    const feed = await parser.parseString(document);
    if (!Array.isArray(feed.items)) throw new Error('Missing feed items');
    return { items: feed.items, baseUrl: response.url || url };
  } catch (cause) {
    throw new FeedError('parse', '无法解析 RSS 或 Atom 内容', { cause });
  }
}

async function fetchWithRetry(url, sourceId) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fetchFeed(url);
    } catch (err) {
      if (!err.retryable || attempt >= MAX_ATTEMPTS || err.retryAfterMs > MAX_RETRY_DELAY_MS) throw err;
      const backoff = 500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      const waitMs = Math.max(backoff, err.retryAfterMs);
      logger.warn('feed.retry', { sourceId, attempt, waitMs, errorType: err.type, ...errorDetails(err) });
      await delay(waitMs);
    }
  }
}

export async function crawlSource(source) {
  const url = articleUrl(source.rssUrl);
  if (!url) throw new FeedError('format', 'RSS 地址必须是有效的 HTTP 或 HTTPS URL');
  const startedAt = performance.now();
  const { items, baseUrl } = await fetchWithRetry(url, source.id);
  const fetchMs = elapsedMs(startedAt);
  const articles = items
    .map((item) => normalizeArticle(item, source.id, baseUrl))
    .filter((article) => article.title && article.originalUrl);
  if (items.length && articles.length === 0) {
    throw new FeedError('format', 'RSS 返回的条目没有有效标题和链接');
  }

  const storageStartedAt = performance.now();
  const inserted = insertArticles(articles);
  logger.info('feed.completed', {
    sourceId: source.id,
    received: items.length,
    invalid: items.length - articles.length,
    duplicates: articles.length - inserted.length,
    inserted: inserted.length,
    fetchMs,
    storageMs: elapsedMs(storageStartedAt),
    durationMs: elapsedMs(startedAt)
  });
  return inserted;
}

export async function crawlAllSources(sources, crawl = crawlSource) {
  const results = new Array(sources.length);
  let cursor = 0;

  async function worker() {
    while (cursor < sources.length) {
      const index = cursor++;
      const source = sources[index];
      try {
        const articles = await crawl(source);
        results[index] = { source: source.name, count: articles.length, articles };
      } catch (err) {
        const { type, message } = classifyError(err);
        logger[type === 'unknown' ? 'error' : 'warn']('feed.failed', { sourceId: source.id, errorType: type, ...errorDetails(err) });
        results[index] = { source: source.name, count: 0, error: message, errorType: type };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, sources.length) }, worker));
  return results;
}
