import { getActiveSources, getSourceById } from '../models/source.js';
import { crawlAllSources, crawlSource, classifyError } from './crawler.js';
import { getHealth, recordSuccess, recordFailure, recordCooldown, deactivateSource } from '../models/sourceHealth.js';
import { getFailureThreshold } from '../models/settings.js';
import { createLogger, elapsedMs, errorDetails, getTriggeredAt, withLogTrigger } from '../utils/logger.js';

const logger = createLogger('crawl');

export async function triggerManualCrawl() {
  return crawlActiveRssSources('manual');
}

let activeBatch = null;
const activeSources = new Map();

export function crawlActiveRssSources(trigger, triggeredAt = getTriggeredAt()) {
  if (!activeBatch) {
    const sources = getActiveSources().filter((source) => source.type === 'rss');
    const startedAt = performance.now();
    logger.info('batch.started', { trigger, triggeredAt, sourceCount: sources.length });
    activeBatch = withLogTrigger(() => crawlAllSources(sources, crawlSourceOnce), triggeredAt).then(results => {
      const failed = results.filter(result => result.errorType).length;
      logger.info('batch.completed', {
        trigger,
        triggeredAt,
        sourceCount: sources.length,
        failed,
        inserted: results.reduce((total, result) => total + result.count, 0),
        durationMs: elapsedMs(startedAt)
      });
      return results;
    }).finally(() => { activeBatch = null; });
  } else {
    logger.debug('batch.joined', { trigger, triggeredAt });
  }
  return activeBatch;
}

function crawlSourceOnce(source) {
  let pending = activeSources.get(source.id);
  if (!pending) {
    pending = crawlWithHealth(source).finally(() => activeSources.delete(source.id));
    activeSources.set(source.id, pending);
  } else {
    logger.debug('feed.joined', { sourceId: source.id });
  }
  return pending;
}

export async function triggerManualCrawlForSource(sourceId) {
  const triggeredAt = getTriggeredAt();
  const source = getSourceById(sourceId);
  if (!source) {
    throw new Error('Source not found');
  }
  if (!source.isActive) {
    throw new Error('Source is inactive');
  }
  if (source.type !== 'rss') {
    throw new Error('Source is not an RSS feed');
  }
  logger.info('feed.manual_started', { sourceId, triggeredAt });
  try {
    const articles = await withLogTrigger(() => crawlSourceOnce(source), triggeredAt);
    return { source: source.name, count: articles.length, articles };
  } catch (err) {
    const { type } = classifyError(err);
    logger.warn('feed.manual_failed', { sourceId, triggeredAt, errorType: type, ...errorDetails(err) });
    throw err;
  }
}

async function crawlWithHealth(source) {
  const { retryAfterAt } = getHealth(source.id);
  if (retryAfterAt > Date.now()) {
    const seconds = Math.ceil((retryAfterAt - Date.now()) / 1_000);
    logger.warn('feed.cooldown_active', { sourceId: source.id, retryAfterAt });
    throw new Error(`RSS 来源要求暂停抓取，请在 ${seconds} 秒后重试`);
  }

  let articles;
  try {
    articles = await crawlSource(source);
  } catch (err) {
    const { type, message, cooldownMs } = classifyError(err);
    // Storage errors are operational failures, not evidence that the source is down.
    if (cooldownMs && getSourceById(source.id)) {
      const retryAt = Date.now() + cooldownMs;
      recordCooldown(source.id, message, retryAt);
      logger.warn('feed.cooldown_set', { sourceId: source.id, errorType: type, retryAfterAt: retryAt });
    } else if (type !== 'unknown' && getSourceById(source.id)) {
      recordFailure(source.id, message);
      const threshold = getFailureThreshold();
      if (deactivateSource(source.id, threshold)) {
        logger.warn('feed.deactivated', { sourceId: source.id, threshold });
      }
    }
    throw err;
  }
  if (getSourceById(source.id)) recordSuccess(source.id);
  return articles;
}

