import cron from 'node-cron';
import { getWechatSettings } from '../models/wechatSettings.js';
import { listFlaggedArticleIds } from '../models/articleFlag.js';
import { pushSummary } from './wechat.js';
import { wechatCapabilities } from './wechatConfig.js';
import { getDb } from '../db.js';
import { createLogger, elapsedMs, errorDetails, getTriggeredAt, withLogTrigger } from '../utils/logger.js';
import { crawlActiveRssSources } from './crawlService.js';
import { cleanupOldArticles } from '../models/article.js';
import { cleanupExpiredXinwenlianboAudio, getXinwenlianboDate, runXinwenlianboTask } from './xinwenlianbo/orchestrator.js';

export { triggerManualCrawl, triggerManualCrawlForSource } from './crawlService.js';

const logger = createLogger('scheduler');
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
  task = cron.schedule(cronExpression, () => withLogTrigger(async () => {
    const triggeredAt = getTriggeredAt();
    try {
      await crawlActiveRssSources('scheduled', triggeredAt);
    } catch (err) {
      logger.error('crawl.failed', { triggeredAt, ...errorDetails(err) });
    }
  }), {
    timezone: 'Asia/Shanghai'
  });
  logger.info('crawl.scheduled', { cronExpression });
}

export function stopScheduler() {
  if (task) {
    task.stop();
    task = null;
    logger.info('crawl.stopped');
  }
}

let summaryTask = null;

export function startSummaryPushScheduler() {
  if (summaryTask) return;
  const settings = getWechatSettings();
  const cronExpression = settings?.summaryPushCron || '0 8 * * *';

  summaryTask = cron.schedule(cronExpression, () => withLogTrigger(async () => {
    const triggeredAt = getTriggeredAt();
    try {
      const startedAt = performance.now();
      if (!wechatCapabilities().massSendEnabled) {
        logger.debug('summary.skipped', { triggeredAt, reason: 'mass_send_unavailable' });
        return;
      }
      const settings = getWechatSettings();
      if (!settings || !settings.summaryPushEnabled) {
        logger.debug('summary.skipped', { triggeredAt, reason: 'disabled' });
        return;
      }
      if (!settings.appId || !settings.appSecret) {
        logger.debug('summary.skipped', { triggeredAt, reason: 'unconfigured' });
        return;
      }

      const db = getDb();
      const articles = db.prepare(`SELECT id, title, summary, originalUrl, sourceId, publishedAt
        FROM articles
        WHERE fetchedAt >= datetime('now', '-1 day')
        ORDER BY publishedAt DESC`).all();

      const flaggedIds = listFlaggedArticleIds();
      const result = await pushSummary(articles, flaggedIds);
      logger.info('summary.completed', { triggeredAt, status: result.status, articleCount: articles.length, durationMs: elapsedMs(startedAt) });
    } catch (err) {
      logger.error('summary.failed', { triggeredAt, ...errorDetails(err) });
    }
  }), {
    timezone: 'Asia/Shanghai'
  });

  logger.info('summary.scheduled', { cronExpression });
}

export function stopSummaryPushScheduler() {
  if (summaryTask) {
    summaryTask.stop();
    summaryTask = null;
    logger.info('summary.stopped');
  }
}
let cleanupTask = null;

export function startCleanupScheduler() {
  if (cleanupTask) return;
  if (process.env.CLEANUP_ENABLED === 'false') {
    logger.info('cleanup.disabled');
    return;
  }

  const raw = process.env.CLEANUP_RETENTION_DAYS;
  const retentionDays = resolveRetentionDays();
  if (raw !== undefined && raw !== '' && parseInt(raw, 10) !== retentionDays) {
    logger.warn('cleanup.invalid_retention', { retentionDays });
  }

  cleanupTask = cron.schedule('0 0 * * *', () => withLogTrigger(() => {
    const triggeredAt = getTriggeredAt();
    try {
      const startedAt = performance.now();
      const beforeDate = getCleanupCutoffDate();
      const deleted = cleanupOldArticles(beforeDate);
      logger.info('cleanup.completed', { triggeredAt, beforeDate, deleted, durationMs: elapsedMs(startedAt) });
    } catch (err) {
      logger.error('cleanup.failed', { triggeredAt, ...errorDetails(err) });
    }
  }), {
    timezone: 'Asia/Shanghai'
  });

  logger.info('cleanup.scheduled', { cronExpression: '0 0 * * *', retentionDays });
}

export function stopCleanupScheduler() {
  if (cleanupTask) {
    cleanupTask.stop();
    cleanupTask = null;
    logger.info('cleanup.stopped');
  }
}

let xinwenlianboTask = null;
let audioCleanupTask = null;

function clearExpiredAudio() {
  return withLogTrigger(() => {
    const triggeredAt = getTriggeredAt();
    try {
      const cleared = cleanupExpiredXinwenlianboAudio();
      logger[cleared ? 'info' : 'debug']('broadcast_audio_cleanup.completed', { triggeredAt, cleared });
    } catch (err) {
      logger.error('broadcast_audio_cleanup.failed', { triggeredAt, ...errorDetails(err) });
    }
  });
}

export function startXinwenlianboScheduler() {
  if (xinwenlianboTask) return;
  if (!audioCleanupTask) {
    clearExpiredAudio();
    audioCleanupTask = cron.schedule('0 * * * *', clearExpiredAudio, { timezone: 'Asia/Shanghai' });
  }
  if (process.env.XINWENLIANBO_ENABLED === 'false') {
    logger.info('broadcast.disabled');
    return;
  }

  const cronExpression = process.env.XINWENLIANBO_CRON || '0 19 * * *';
  if (!cron.validate(cronExpression)) {
    logger.error('broadcast.invalid_cron');
    return;
  }

  xinwenlianboTask = cron.schedule(cronExpression, () => withLogTrigger(async () => {
    const triggeredAt = getTriggeredAt();
    try {
      const today = getXinwenlianboDate();
      logger.info('broadcast.started', { triggeredAt, date: today });
      await runXinwenlianboTask(today);
    } catch (err) {
      logger.error('broadcast.failed', { triggeredAt, ...errorDetails(err) });
    }
  }), {
    timezone: 'Asia/Shanghai'
  });

  logger.info('broadcast.scheduled', { cronExpression });
}

export function stopXinwenlianboScheduler() {
  audioCleanupTask?.stop();
  audioCleanupTask = null;
  if (xinwenlianboTask) {
    xinwenlianboTask.stop();
    xinwenlianboTask = null;
    logger.info('broadcast.stopped');
  }
}
