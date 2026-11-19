import path from 'path';
import os from 'os';
import fs from 'fs';
import { getDb, withWriteTransaction } from '../../db.js';
import { getSetting } from '../../models/settings.js';
import { startRecording, stopRecording } from './recorder.js';
import { transcribe } from './transcriber.js';
import { summarize } from './summarizer.js';
import { insertArticle } from '../../models/article.js';

function getConfigValue(key, envName, defaultValue = null) {
  const envValue = process.env[envName];
  if (envValue !== undefined && envValue !== '') return envValue;
  const dbValue = getSetting(`xwlb_${key}`);
  return dbValue !== null ? dbValue : defaultValue;
}

export function getXinwenlianboConfig() {
  return {
    enabled: getConfigValue('enabled', 'XINWENLIANBO_ENABLED', 'true') !== 'false',
    audioUrl: getConfigValue('audioUrl', 'XINWENLIANBO_AUDIO_URL', 'https://piccpndali.v.myalicdn.com/audio/cctv1_2.m3u8'),
    durationMinutes: parseInt(getConfigValue('durationMinutes', 'XINWENLIANBO_DURATION_MINUTES', '30'), 10),
    whisperExecutable: getConfigValue('whisperExecutable', 'WHISPER_EXECUTABLE'),
    whisperModelPath: getConfigValue('whisperModelPath', 'WHISPER_MODEL_PATH'),
    llmProvider: getConfigValue('llmProvider', 'LLM_PROVIDER', 'deepseek'),
    llmApiUrl: getConfigValue('llmApiUrl', 'LLM_API_URL'),
    llmApiKey: getConfigValue('llmApiKey', 'LLM_API_KEY'),
    llmModel: getConfigValue('llmModel', 'LLM_MODEL', 'deepseek-chat'),
    keepAudio: getConfigValue('keepAudio', 'XINWENLIANBO_KEEP_AUDIO', 'false') === 'true'
  };
}

const RUNNING = new Set(['recording', 'finishing', 'stopping', 'transcribing', 'summarizing']);
let activeTask = null;

export function getXinwenlianboDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

function taskError(message, statusCode, code = statusCode) {
  return Object.assign(new Error(message), { statusCode, code });
}

export function getXinwenlianboStatus() {
  const date = activeTask?.date ?? getXinwenlianboDate();
  const db = getDb();
  const task = db.prepare('SELECT * FROM xinwenlianbo_tasks WHERE taskDate = ?').get(date);
  const interrupted = !activeTask && RUNNING.has(task?.status);
  const article = task && !RUNNING.has(task.status) && db.prepare(`
    SELECT a.id FROM articles a JOIN sources s ON s.id = a.sourceId
    WHERE s.type = 'xinwenlianbo' AND a.title = ? ORDER BY a.id DESC LIMIT 1
  `).get(`${date} 新闻联播摘要`);
  return {
    date,
    status: interrupted ? 'failed' : task?.status ?? 'pending',
    startedAt: task?.startedAt ?? null,
    completedAt: task?.completedAt ?? null,
    errorMessage: interrupted ? '录制任务已中断，请重新开始' : task?.errorMessage ?? null,
    durationMinutes: activeTask?.durationMinutes ?? null,
    articleId: article?.id ?? null
  };
}

function whisperAvailable(executable) {
  const candidates = path.basename(executable) === executable
    ? (process.env.PATH ?? '').split(path.delimiter).map(dir => path.join(dir, executable))
    : [executable];
  return candidates.some(candidate => {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

export function startXinwenlianboTask(date, { force = false, durationMinutes } = {}) {
  if (activeTask) throw taskError('已有新闻联播任务正在处理', 409, 1003);

  const config = getXinwenlianboConfig();
  if (!config.enabled) throw taskError('新闻联播录制已禁用', 409, 1004);
  const db = getDb();
  const existing = db.prepare('SELECT status FROM xinwenlianbo_tasks WHERE taskDate = ?').get(date);
  if (existing?.status === 'completed' && !force) {
    throw taskError('今天的任务已完成，请选择重新录制', 409, 1002);
  }

  const duration = durationMinutes ?? config.durationMinutes;
  if (!Number.isInteger(duration) || duration < 1 || duration > 120) {
    throw taskError('录制时长须为 1 至 120 分钟的整数', 400);
  }
  if (!config.whisperExecutable || !config.whisperModelPath) {
    throw taskError('请先配置 Whisper 可执行文件和模型路径', 400);
  }
  if (!whisperAvailable(config.whisperExecutable)) {
    throw taskError('找不到可执行的 Whisper 程序，请检查路径和执行权限', 400);
  }
  if (!fs.statSync(config.whisperModelPath, { throwIfNoEntry: false })?.isFile()) {
    throw taskError('找不到 Whisper 模型文件，请检查模型路径', 400);
  }
  let originalUrl;
  try {
    originalUrl = new URL(config.audioUrl);
    originalUrl.searchParams.set('date', date);
  } catch {
    throw taskError('直播流地址无效，请检查录制配置', 400);
  }
  const source = db.prepare("SELECT id FROM sources WHERE type = 'xinwenlianbo' ORDER BY id LIMIT 1").get();
  if (!source) throw taskError('没有找到 CCTV 新闻联播来源', 400);

  const tmpDir = os.tmpdir();
  const disk = fs.statfsSync(tmpDir);
  if (disk.bavail * disk.bsize < 500 * 1024 * 1024) {
    throw taskError('临时目录剩余空间不足 500 MB，无法开始录制', 507);
  }

  const workDir = fs.mkdtempSync(path.join(tmpDir, 'xinwenlianbo-'));
  const audioPath = path.join(workDir, 'recording.wav');

  try {
    db.prepare(`
      INSERT INTO xinwenlianbo_tasks (taskDate, status, audioFilePath, startedAt)
      VALUES (?, 'recording', ?, datetime('now'))
      ON CONFLICT(taskDate) DO UPDATE SET status = 'recording',
        audioFilePath = excluded.audioFilePath, startedAt = excluded.startedAt,
        completedAt = NULL, transcript = NULL, summary = NULL, headlines = NULL, errorMessage = NULL
    `).run(date, audioPath);
  } catch (err) {
    fs.rmSync(workDir, { recursive: true, force: true });
    throw err;
  }

  activeTask = { date, durationMinutes: duration };
  const completion = processRecording({ date, config, duration, audioPath, workDir, sourceId: source.id, originalUrl: originalUrl.href })
    .finally(() => { activeTask = null; });
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

export function stopXinwenlianboTask({ finish = false } = {}) {
  const status = getXinwenlianboStatus();
  if (status.status !== 'recording' || !activeTask || !stopRecording({ finish })) return null;

  const next = finish ? 'finishing' : 'stopping';
  getDb().prepare('UPDATE xinwenlianbo_tasks SET status = ? WHERE taskDate = ?').run(next, status.date);
  return { ...status, status: next };
}

async function processRecording({ date, config, duration, audioPath, workDir, sourceId, originalUrl }) {
  const db = getDb();
  try {
    console.log(`[Xinwenlianbo] Starting recording for ${date}...`);
    await startRecording(config.audioUrl, duration * 60, audioPath);
    if ((fs.statSync(audioPath, { throwIfNoEntry: false })?.size ?? 0) < 32_000) {
      throw new Error('未录到有效音频，请检查直播流并至少录制 1 秒');
    }

    db.prepare("UPDATE xinwenlianbo_tasks SET status = 'transcribing' WHERE taskDate = ?").run(date);
    console.log(`[Xinwenlianbo] Transcribing...`);
    const transcript = await transcribe(audioPath, config.whisperExecutable, config.whisperModelPath);

    db.prepare("UPDATE xinwenlianbo_tasks SET status = 'summarizing', transcript = ? WHERE taskDate = ?")
      .run(transcript, date);
    console.log(`[Xinwenlianbo] Summarizing...`);

    const summary = await buildSummary(transcript, config);
    return publishSummary({ date, sourceId, originalUrl, transcript, ...summary });

  } catch (err) {
    const status = err.code === 'RECORDING_CANCELLED' ? 'cancelled' : 'failed';
    db.prepare("UPDATE xinwenlianbo_tasks SET status = ?, errorMessage = ?, completedAt = datetime('now') WHERE taskDate = ?")
      .run(status, err.message, date);
    if (status === 'cancelled') return { status };
    throw err;
  } finally {
    if (!config.keepAudio) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
        db.prepare('UPDATE xinwenlianbo_tasks SET audioFilePath = NULL WHERE taskDate = ?').run(date);
      } catch (err) {
        console.error('[Xinwenlianbo] Temporary audio cleanup failed:', err.code || err.message);
      }
    }
  }
}

async function buildSummary(transcript, config, { manual = false } = {}) {
  if (config.llmApiKey && config.llmApiUrl) {
    try {
      const result = await summarize(transcript, {
        apiUrl: config.llmApiUrl, apiKey: config.llmApiKey, model: config.llmModel
      });
      if (typeof result.summary !== 'string' || !result.summary.trim()) {
        throw new Error('摘要服务未返回有效正文');
      }
      return { summary: result.summary.trim(), headlines: JSON.stringify(result.headlines || []) };
    } catch (err) {
      console.error('[Xinwenlianbo] LLM summarization failed:', err.message);
      if (manual) throw new Error('摘要生成失败，请检查模型配置后重试');
    }
  }
  return { summary: transcript.slice(0, 500), headlines: '[]' };
}

function publishSummary({ date, sourceId, originalUrl, transcript, summary, headlines }) {
  const title = `${date} 新闻联播摘要`;
  return withWriteTransaction(db => {
    const existing = db.prepare('SELECT id FROM articles WHERE sourceId = ? AND title = ? ORDER BY id DESC LIMIT 1')
      .get(sourceId, title);
    const articleId = existing?.id ?? insertArticle({
      title, summary, content: summary, originalUrl, sourceId,
      publishedAt: new Date().toISOString(), transcript, headlines
    });
    if (!articleId) throw new Error('新闻摘要保存失败');
    if (existing) {
      db.prepare('UPDATE articles SET summary = ?, content = ?, transcript = ?, headlines = ? WHERE id = ?')
        .run(summary, summary, transcript, headlines, articleId);
    }
    db.prepare(`
      UPDATE xinwenlianbo_tasks
      SET status = 'completed', summary = ?, headlines = ?, errorMessage = NULL,
        completedAt = COALESCE(completedAt, datetime('now'))
      WHERE taskDate = ?
    `).run(summary, headlines, date);
    return { articleId, status: 'completed' };
  });
}

const historyFields = `
  t.id, t.taskDate, t.status, t.startedAt, t.completedAt, t.errorMessage,
  NULLIF(TRIM(t.transcript), '') IS NOT NULL AS hasTranscript,
  (SELECT a.id FROM articles a JOIN sources s ON s.id = a.sourceId
    WHERE s.type = 'xinwenlianbo' AND a.title = t.taskDate || ' 新闻联播摘要'
    ORDER BY a.id DESC LIMIT 1) AS articleId
`;

function normalizeRecord(record) {
  if (!record) return null;
  if (RUNNING.has(record.status) && activeTask?.date !== record.taskDate) {
    return { ...record, status: 'failed', errorMessage: '任务已中断' };
  }
  return record;
}

export function listXinwenlianboRecords(page, limit) {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) AS total FROM xinwenlianbo_tasks').get().total;
  const offset = (page - 1) * limit;
  const items = offset < total ? db.prepare(`
    SELECT ${historyFields} FROM xinwenlianbo_tasks t
    ORDER BY t.taskDate DESC LIMIT ? OFFSET ?
  `).all(limit, offset).map(normalizeRecord) : [];
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export function getXinwenlianboRecord(id) {
  return normalizeRecord(getDb().prepare(`
    SELECT ${historyFields}, t.transcript, t.summary, t.headlines
    FROM xinwenlianbo_tasks t WHERE t.id = ?
  `).get(id));
}

export function startXinwenlianboSummary(id) {
  if (activeTask) throw taskError('已有新闻联播任务正在处理', 409, 1003);
  const db = getDb();
  const record = getXinwenlianboRecord(id);
  if (!record) throw taskError('录制记录不存在', 404);
  const transcript = record.transcript?.trim();
  if (!transcript) throw taskError('该记录没有可用于总结的转录文本', 400);

  const config = getXinwenlianboConfig();
  const date = record.taskDate;
  const existing = record.articleId && db.prepare('SELECT sourceId, originalUrl FROM articles WHERE id = ?').get(record.articleId);
  const source = existing ?? db.prepare("SELECT id AS sourceId FROM sources WHERE type = 'xinwenlianbo' ORDER BY id LIMIT 1").get();
  if (!source) throw taskError('没有找到 CCTV 新闻联播来源', 400);
  let originalUrl = existing?.originalUrl;
  if (!originalUrl) {
    try {
      const url = new URL(config.audioUrl);
      url.searchParams.set('date', date);
      originalUrl = url.href;
    } catch {
      throw taskError('直播流地址无效，请检查录制配置', 400);
    }
  }

  db.prepare("UPDATE xinwenlianbo_tasks SET status = 'summarizing', errorMessage = NULL WHERE id = ?").run(id);
  activeTask = { date };
  const completion = buildSummary(transcript, config, { manual: true })
    .then(summary => publishSummary({ date, sourceId: source.sourceId, originalUrl, transcript, ...summary }))
    .catch(err => {
      db.prepare('UPDATE xinwenlianbo_tasks SET status = ?, errorMessage = ? WHERE id = ?')
        .run(record.status, err.message, id);
      throw err;
    })
    .finally(() => { activeTask = null; });

  return { status: getXinwenlianboStatus(), completion };
}

function removeRecordingAudio(audioPath, date) {
  if (!audioPath) return;
  const file = fs.lstatSync(audioPath, { throwIfNoEntry: false });
  if (!file) return;

  const temporaryRoot = fs.realpathSync(os.tmpdir());
  const directory = path.dirname(audioPath);
  const realDirectory = fs.realpathSync(directory);
  const legacy = realDirectory === temporaryRoot && path.basename(audioPath) === `xinwenlianbo-${date}.wav`;
  const current = path.dirname(realDirectory) === temporaryRoot &&
    /^xinwenlianbo-[A-Za-z0-9]{6}$/.test(path.basename(realDirectory)) &&
    fs.lstatSync(directory).isDirectory() && path.basename(audioPath) === 'recording.wav';

  if (!file.isFile() || (!legacy && !current)) throw taskError('录音文件路径异常，删除已停止', 409);
  fs.unlinkSync(audioPath);
  if (current) {
    try {
      fs.rmdirSync(directory);
    } catch (err) {
      if (err.code !== 'ENOTEMPTY') console.error('[Xinwenlianbo] Could not remove empty recording directory:', err.code);
    }
  }
}

export function deleteXinwenlianboRecord(id, { deleteArticle = false } = {}) {
  return withWriteTransaction(db => {
    const record = db.prepare(`
      SELECT ${historyFields}, t.audioFilePath FROM xinwenlianbo_tasks t WHERE t.id = ?
    `).get(id);
    if (!record) throw taskError('录制记录不存在', 404);
    if (activeTask?.date === record.taskDate) throw taskError('正在处理的录制记录不能删除', 409);

    const articleDeleted = !!(deleteArticle && record.articleId &&
      db.prepare('DELETE FROM articles WHERE id = ?').run(record.articleId).changes);
    db.prepare('DELETE FROM xinwenlianbo_tasks WHERE id = ?').run(id);
    removeRecordingAudio(record.audioFilePath, record.taskDate);
    return { articleDeleted };
  });
}
