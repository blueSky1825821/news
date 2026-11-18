import cron from 'node-cron';
import { getActiveSources, getSourceById } from '../models/source.js';
import { crawlAllSources, crawlSource, classifyError } from './crawler.js';
import { getWechatSettings } from '../models/wechatSettings.js';
import { listFlaggedArticleIds } from '../models/articleFlag.js';
import { pushSummary } from './wechat.js';
import { wechatCapabilities } from './wechatConfig.js';
import { getHealth, recordSuccess, recordFailure, recordCooldown, deactivateSource } from '../models/sourceHealth.js';
import { getFailureThreshold } from '../models/settings.js';
import { getDb } from '../db.js';


import { cleanupOldArticles } from '../models/article.js';
import { runXinwenlianboTask, stopRecording } from './xinwenlianbo/orchestrator.js';

const DEFAULT_RETENTION_DAYS = 90;

export function resolveRetentionDays() {
  const raw = process.env.CLEANUP_RETENTION_DAYS;
  const days = parseInt(raw, 10);
  if (!Number.isFinite(days) || days < 1) {
    return DEFAULT_RETENTION_DAYS;
  }
  return days;
}

export function getCleanupCutoffDate() {
  const retentionDays = resolveRetentionDays();
  return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
}

let task = null;

export function startScheduler(cronExpression = '*/30 * * * *') {
  if (task) return;
  task = cron.schedule(cronExpression, async () => {
    try {
      console.log('[Scheduler] Starting crawl...');
      await crawlActiveRssSources();
      console.log('[Scheduler] Crawl finished.');
    } catch (err) {
      console.error('[Scheduler] Crawl task failed:', err.message);
    }
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
  return crawlActiveRssSources();
}

let activeBatch = null;
const activeSources = new Map();

function crawlActiveRssSources() {
  if (!activeBatch) {
    const sources = getActiveSources().filter((source) => source.type === 'rss');
    activeBatch = crawlAllSources(sources, crawlSourceOnce).finally(() => { activeBatch = null; });
  }
  return activeBatch;
}

function crawlSourceOnce(source) {
  let pending = activeSources.get(source.id);
  if (!pending) {
    pending = crawlWithHealth(source).finally(() => activeSources.delete(source.id));
    activeSources.set(source.id, pending);
  }
  return pending;
}

export async function triggerManualCrawlForSource(sourceId) {
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
  const articles = await crawlSourceOnce(source);
  return { source: source.name, count: articles.length, articles };
}

async function crawlWithHealth(source) {
  const { retryAfterAt } = getHealth(source.id);
  if (retryAfterAt > Date.now()) {
    const seconds = Math.ceil((retryAfterAt - Date.now()) / 1_000);
    throw new Error(`RSS 来源要求暂停抓取，请在 ${seconds} 秒后重试`);
  }

  let articles;
  try {
    articles = await crawlSource(source);
  } catch (err) {
    const { type, message, cooldownMs } = classifyError(err);
    // Storage errors are operational failures, not evidence that the source is down.
    if (cooldownMs && getSourceById(source.id)) {
      recordCooldown(source.id, message, Date.now() + cooldownMs);
    } else if (type !== 'unknown' && getSourceById(source.id)) {
      recordFailure(source.id, message);
      const threshold = getFailureThreshold();
      if (deactivateSource(source.id, threshold)) {
        console.warn(`[Health] Source "${source.name}" deactivated after ${threshold} consecutive failures.`);
      }
    }
    throw err;
  }
  if (getSourceById(source.id)) recordSuccess(source.id);
  return articles;
}

let summaryTask = null;

export function startSummaryPushScheduler() {
  if (summaryTask) return;
  const settings = getWechatSettings();
  const cronExpression = settings?.summaryPushCron || '0 8 * * *';

  summaryTask = cron.schedule(cronExpression, async () => {
    try {
      if (!wechatCapabilities().massSendEnabled) return;
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

  const raw = process.env.CLEANUP_RETENTION_DAYS;
  const retentionDays = resolveRetentionDays();
  if (raw !== undefined && raw !== '' && parseInt(raw, 10) !== retentionDays) {
    console.warn(`[Cleanup] Invalid CLEANUP_RETENTION_DAYS "${raw}", using default ${DEFAULT_RETENTION_DAYS}.`);
  }

  cleanupTask = cron.schedule('0 0 * * *', () => {
    try {
      const beforeDate = getCleanupCutoffDate();
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

let xinwenlianboTask = null;

export function startXinwenlianboScheduler() {
  if (xinwenlianboTask) return;
  if (process.env.XINWENLIANBO_ENABLED === 'false') {
    console.log('[Xinwenlianbo] Scheduler disabled.');
    return;
  }

  const cronExpression = process.env.XINWENLIANBO_CRON || '0 19 * * *';

  xinwenlianboTask = cron.schedule(cronExpression, async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      console.log(`[Xinwenlianbo] Scheduled task triggered for ${today}`);
      await runXinwenlianboTask(today);
    } catch (err) {
      console.error('[Xinwenlianbo] Scheduled task failed:', err.message);
    }
  }, {
    timezone: 'Asia/Shanghai'
  });

  console.log('[Xinwenlianbo] Scheduler started with cron:', cronExpression);
}

export function stopXinwenlianboScheduler() {
  if (xinwenlianboTask) {
    xinwenlianboTask.stop();
    xinwenlianboTask = null;
    console.log('[Xinwenlianbo] Scheduler stopped.');
  }
}

export async function triggerManualXinwenlianbo(today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })) {
  console.log(`[Xinwenlianbo] Manual trigger for ${today}`);
  return await runXinwenlianboTask(today);
}

export function stopXinwenlianboRecording() {
  return stopRecording();
}
