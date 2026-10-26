import cron from 'node-cron';
import { getActiveSources, getSourceById } from '../models/source.js';
import { crawlAllSources, crawlSource } from './crawler.js';
import { getWechatSettings } from '../models/wechatSettings.js';
import { listFlaggedArticleIds } from '../models/articleFlag.js';
import { pushSummary } from './wechat.js';
import { recordSuccess, recordFailure, deactivateSource } from '../models/sourceHealth.js';
import { getFailureThreshold } from '../models/settings.js';
import { getDb } from '../db.js';


import { cleanupOldArticles } from '../models/article.js';

const DEFAULT_RETENTION_DAYS = 90;

export function resolveRetentionDays() {
  const days = parseInt(process.env.CLEANUP_RETENTION_DAYS, 10);
  if (!Number.isFinite(days) || days < 1) {
    return DEFAULT_RETENTION_DAYS;
  }
  return days;
}

let task = null;

export function startScheduler(cronExpression = '*/30 * * * *') {
  if (task) return;
  task = cron.schedule(cronExpression, async () => {
    console.log('[Scheduler] Starting crawl...');
    const sources = getActiveSources();
    await crawlAllSources(sources);
    console.log('[Scheduler] Crawl finished.');
  }, {
    timezone: 'Asia/Shanghai'
  });
  console.log('[Scheduler] Started with cron:', cronExpression);
}

export function stopScheduler() {
  if (task) {
    task.stop();
    task = null;
    console.log('[Scheduler] Stopped.');
  }
}

export async function triggerManualCrawl() {
  console.log('[Scheduler] Manual crawl triggered.');
  const sources = getActiveSources();
  const results = await crawlAllSources(sources);
  return results;
}

export async function triggerManualCrawlForSource(sourceId) {
  const source = getSourceById(sourceId);
  if (!source) {
    throw new Error('Source not found');
  }
  if (!source.isActive) {
    throw new Error('Source is inactive');
  }
  try {
    const articles = await crawlSource(source);
    recordSuccess(source.id);
    return { source: source.name, count: articles.length, articles };
  } catch (err) {
    const msg = err instanceof Error ? err.message : (typeof err === 'string' ? err : 'Unknown error');
    console.error(`Manual crawl failed for ${source.name}:`, msg);
    recordFailure(source.id, msg);
    const threshold = getFailureThreshold();
    if (deactivateSource(source.id, threshold)) {
      console.warn(`[Health] Source "${source.name}" deactivated after ${threshold} consecutive failures.`);
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}

let summaryTask = null;

export function startSummaryPushScheduler() {
  if (summaryTask) return;
  const settings = getWechatSettings();
  const cronExpression = settings?.summaryPushCron || '0 8 * * *';

  summaryTask = cron.schedule(cronExpression, async () => {
    try {
      const settings = getWechatSettings();
      if (!settings || !settings.summaryPushEnabled) {
        console.log('[WechatPush] Summary push disabled, skipping.');
        return;
      }
      if (!settings.appId || !settings.appSecret) {
        console.log('[WechatPush] WeChat not configured, skipping.');
        return;
      }

      const db = getDb();
      const articles = db.prepare(`SELECT id, title, summary, originalUrl, sourceId, publishedAt
        FROM articles
        WHERE fetchedAt >= datetime('now', '-1 day')
        ORDER BY publishedAt DESC`).all();

      const flaggedIds = listFlaggedArticleIds();
      const result = await pushSummary(articles, flaggedIds);
      console.log('[WechatPush] Summary push result:', result.status);
    } catch (err) {
      console.error('[WechatPush] Summary push failed:', err.message);
    }
  }, {
    timezone: 'Asia/Shanghai'
  });

  console.log('[Scheduler] Summary push scheduled with cron:', cronExpression);
}

export function stopSummaryPushScheduler() {
  if (summaryTask) {
    summaryTask.stop();
    summaryTask = null;
    console.log('[Scheduler] Summary push stopped.');
  }
}
let cleanupTask = null;

export function startCleanupScheduler() {
  if (cleanupTask) return;
  if (process.env.CLEANUP_ENABLED === 'false') {
    console.log('[Cleanup] Disabled.');
    return;
  }

  const retentionDays = resolveRetentionDays();

  cleanupTask = cron.schedule('0 0 * * *', () => {
    try {
      const beforeDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
      const deleted = cleanupOldArticles(beforeDate);
      console.log(`[Cleanup] Deleted ${deleted} old articles.`);
    } catch (err) {
      console.error('[Cleanup] Failed:', err.message);
    }
  }, {
    timezone: 'Asia/Shanghai'
  });

  console.log(`[Cleanup] Scheduler started. Retention: ${retentionDays} days.`);
}

export function stopCleanupScheduler() {
  if (cleanupTask) {
    cleanupTask.stop();
    cleanupTask = null;
    console.log('[Cleanup] Scheduler stopped.');
  }
}
