import { logConsole } from '../../utils/logger.js';
import { getSetting } from '../../models/settings.js';
import { collectCctvNews } from './cctv.js';
import {
  findTaskByDate, findTaskById, hasPublishedIntroduction, findBroadcastSource,
  markCollecting, markPending, markFailed, publishIntroduction, listTasks, deleteTask
} from './repository.js';

export function getXinwenlianboConfig() {
  const enabled = process.env.XINWENLIANBO_ENABLED || getSetting('xwlb_enabled');
  return { enabled: enabled !== 'false' };
}

const TERMINAL = new Set(['pending', 'completed', 'failed', 'cancelled']);
let activeTask = null;

function logStepFailure(date, step, err, elapsedSeconds, context = {}) {
  const details = [];
  for (let error = err; error && details.length < 4; error = error.cause) {
    details.push({
      code: error.code,
      message: String(error.message ?? error).replace(/https?:\/\/[^\s"'<>]+/gi, '[URL]').slice(-1500)
    });
  }
  logConsole('error', '[Xinwenlianbo] Step failed', { date, step, elapsedSeconds, ...context, errors: details });
}

function beginStep(step, details = {}) {
  const task = activeTask;
  const now = Date.now();
  const previousSeconds = task.progress ? Math.floor((now - task.progress.startedAt) / 1000) : undefined;
  task.progress = { step, startedAt: now, percent: null };
  logConsole('log', '[Xinwenlianbo] Step started', { date: task.date, step, previousSeconds, ...details });
}

function currentProgress() {
  const progress = activeTask?.progress;
  return progress && {
    step: progress.step,
    percent: progress.percent,
    elapsedSeconds: Math.floor((Date.now() - progress.startedAt) / 1000)
  };
}

export function getXinwenlianboDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

function taskError(message, statusCode, code = statusCode) {
  return Object.assign(new Error(message), { statusCode, code });
}

export function getXinwenlianboStatus() {
  const date = activeTask?.date ?? getXinwenlianboDate();
  const task = normalizeRecord(findTaskByDate(date));
  return {
    date,
    status: task?.status ?? 'pending',
    startedAt: task?.startedAt ?? null,
    completedAt: task?.completedAt ?? null,
    errorMessage: task?.errorMessage ?? null,
    progress: activeTask?.date === date && task && !TERMINAL.has(task.status) ? currentProgress() ?? null : null,
    articleId: task?.articleId ?? null,
    ...getXinwenlianboConfig()
  };
}

export function startXinwenlianboTask(date, { force = false } = {}) {
  if (activeTask) throw taskError('已有新闻联播任务正在处理', 409, 1003);
  const config = getXinwenlianboConfig();
  if (!config.enabled) throw taskError('新闻联播抓取已禁用', 409, 1004);
  if (!force && hasPublishedIntroduction(date)) {
    throw taskError('今天的新闻已抓取，请选择重新抓取', 409, 1002);
  }
  const source = findBroadcastSource();
  if (!source) throw taskError('没有找到 CCTV 新闻联播来源', 400);

  markCollecting(date);
  activeTask = { date };
  const completion = processCctvNews(date, source.id).finally(() => { activeTask = null; });
  return { status: getXinwenlianboStatus(), completion };
}

export async function runXinwenlianboTask(date) {
  try {
    return await startXinwenlianboTask(date).completion;
  } catch (err) {
    if ([1002, 1003, 1004].includes(err.code)) return { skipped: true };
    throw err;
  }
}

async function processCctvNews(date, sourceId) {
  try {
    beginStep('collecting');
    const news = await collectCctvNews(date);
    if (news.status === 'pending') {
      markPending(date, news.message);
      return { status: 'pending' };
    }

    beginStep('publish-introduction');
    const result = publishIntroduction(date, sourceId, news);
    logConsole('log', '[Xinwenlianbo] Task completed', { date, articleId: result.articleId, ...currentProgress() });
    return result;
  } catch (err) {
    const progress = currentProgress();
    logStepFailure(date, progress?.step ?? 'setup', err, progress?.elapsedSeconds);
    markFailed(date, err.message);
    throw err;
  }
}

function normalizeRecord(record) {
  if (!record) return null;
  if (!TERMINAL.has(record.status) && activeTask?.date !== record.taskDate) {
    return { ...record, status: 'failed', errorMessage: '任务已中断' };
  }
  return record;
}

export function listXinwenlianboRecords(page, limit) {
  const { items, pagination } = listTasks(page, limit);
  return { items: items.map(normalizeRecord), pagination };
}

export function getXinwenlianboRecord(id) {
  return normalizeRecord(findTaskById(id));
}

export function deleteXinwenlianboRecord(id, { deleteArticle = false } = {}) {
  const result = deleteTask(id, { deleteArticle, activeDate: activeTask?.date });
  if (result.status === 'missing') throw taskError('任务记录不存在', 404);
  if (result.status === 'active') throw taskError('正在处理的任务记录不能删除', 409);
  return { articleDeleted: result.articleDeleted };
}
