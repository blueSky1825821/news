import path from 'path';
import os from 'os';
import fs from 'fs';
import { getDb, withWriteTransaction } from '../../db.js';
import { getSetting } from '../../models/settings.js';
import { startRecording, stopRecording } from './recorder.js';
import { transcribe } from './transcriber.js';
import { startLiveTranscription } from './liveTranscription.js';
import { summarize } from './summarizer.js';
import { extractOpeningHeadlines, normalizeHeadlines } from './headlines.js';
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
    keepAudio: getConfigValue('keepAudio', 'XINWENLIANBO_KEEP_AUDIO', 'true') === 'true'
  };
}

const RUNNING = new Set(['recording', 'finishing', 'stopping', 'transcribing', 'summarizing']);
const AUDIO_BYTES_PER_SECOND = 32_000;
const AUDIO_RETENTION_DAYS = 15;
let activeTask = null;

function logStepFailure(date, step, err, elapsedSeconds, context = {}) {
  const details = [];
  for (let error = err; error && details.length < 4; error = error.cause) {
    details.push({
      code: error.code,
      message: String(error.message ?? error).replace(/https?:\/\/[^\s"'<>]+/gi, '[URL]').slice(-1500)
    });
  }
  console.error('[Xinwenlianbo] Step failed', { date, step, elapsedSeconds, ...context, errors: details });
}

function beginStep(step, details = {}) {
  const task = activeTask;
  const now = Date.now();
  const previousSeconds = task.progress ? Math.floor((now - task.progress.startedAt) / 1000) : undefined;
  task.progress = { step, startedAt: now, percent: null };
  console.log('[Xinwenlianbo] Step started', { date: task.date, step, previousSeconds, ...details });
}

function currentProgress() {
  const progress = activeTask?.progress;
  return progress && {
    step: progress.step,
    percent: progress.percent,
    elapsedSeconds: Math.floor((Date.now() - progress.startedAt) / 1000)
  };
}

function startProgressLogging() {
  const timer = setInterval(() => {
    const progress = currentProgress();
    if (!progress) return;
    console.log('[Xinwenlianbo] Step in progress', {
      date: activeTask.date,
      ...progress,
      ...(progress.step === 'recording' && { capturedSeconds: statusAudioSeconds({ status: 'recording' }) })
    });
  }, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}

function logCurrentFailure(date, err) {
  const progress = currentProgress();
  logStepFailure(date, progress?.step ?? 'setup', err, progress?.elapsedSeconds);
}

function capturedAudioSeconds(audioPath) {
  if (!audioPath) return null;
  const bytes = fs.statSync(audioPath, { throwIfNoEntry: false })?.size ?? 0;
  return Math.floor(Math.max(0, bytes - 44) / AUDIO_BYTES_PER_SECOND);
}

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
    capturedSeconds: statusAudioSeconds(task),
    transcribedSeconds: activeTask?.transcribedSeconds ?? null,
    progress: activeTask?.date === date && RUNNING.has(task?.status) ? currentProgress() ?? null : null,
    articleId: article?.id ?? null
  };
}

function statusAudioSeconds(task) {
  if (task?.status !== 'recording') return null;
  try {
    return capturedAudioSeconds(activeTask?.audioPath);
  } catch {
    // Progress reporting must not interrupt recording.
    return null;
  }
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

export function startXinwenlianboTask(date, options) {
  try {
    return prepareRecording(date, options);
  } catch (err) {
    if (![1002, 1003, 1004].includes(err.code)) logStepFailure(date, 'recording-setup', err);
    throw err;
  }
}

function prepareRecording(date, { force = false, durationMinutes, scheduled = false } = {}) {
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
    withWriteTransaction(db => {
      archiveTaskAudio(db, date);
      db.prepare(`
        INSERT INTO xinwenlianbo_tasks (taskDate, status, audioFilePath, startedAt)
        VALUES (?, 'recording', ?, datetime('now'))
        ON CONFLICT(taskDate) DO UPDATE SET status = 'recording',
          audioFilePath = excluded.audioFilePath, startedAt = excluded.startedAt,
          completedAt = NULL, transcript = NULL, summary = NULL, headlines = NULL, errorMessage = NULL
      `).run(date, audioPath);
    });
  } catch (err) {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch (cleanupError) {
      logStepFailure(date, 'cleanup', cleanupError);
    }
    throw err;
  }

  activeTask = { date, durationMinutes: duration, audioPath };
  const completion = processRecording({ date, config, duration, scheduled, audioPath, workDir, sourceId: source.id, originalUrl: originalUrl.href })
    .finally(() => { activeTask = null; });
  return { status: getXinwenlianboStatus(), completion };
}

export async function runXinwenlianboTask(date) {
  try {
    return await startXinwenlianboTask(date, { scheduled: true }).completion;
  } catch (err) {
    if ([1002, 1003, 1004].includes(err.code)) return { skipped: true };
    throw err;
  }
}

export function stopXinwenlianboTask({ finish = false } = {}) {
  const status = getXinwenlianboStatus();
  if (status.status !== 'recording' || !activeTask) return null;

  const next = finish ? 'finishing' : 'stopping';
  try {
    if (!stopRecording({ finish })) return null;
    beginStep(next);
    getDb().prepare('UPDATE xinwenlianbo_tasks SET status = ? WHERE taskDate = ?').run(next, status.date);
    return { ...status, status: next, progress: currentProgress() };
  } catch (err) {
    logStepFailure(status.date, next, err);
    throw err;
  }
}

function archiveTaskAudio(db, date) {
  db.prepare(`
    INSERT INTO xinwenlianbo_audio (taskId, audioFilePath, startedAt)
    SELECT id, audioFilePath, startedAt FROM xinwenlianbo_tasks
    WHERE taskDate = ? AND audioFilePath IS NOT NULL
    ON CONFLICT(audioFilePath) DO NOTHING
  `).run(date);
  db.prepare('UPDATE xinwenlianbo_tasks SET audioFilePath = NULL WHERE taskDate = ?').run(date);
}

async function processRecording({ date, config, duration, scheduled, audioPath, workDir, sourceId, originalUrl }) {
  const stopProgressLogging = startProgressLogging();
  let retained = false;
  let liveTranscription;
  let capturedSeconds;
  try {
    beginStep('recording', { scheduled, durationMinutes: duration });
    const db = getDb();
    const recording = startRecording(config.audioUrl, duration * 60, audioPath);
    liveTranscription = startLiveTranscription(audioPath, config, (seconds, committed) => {
      if (committed) activeTask.transcribedSeconds = Math.floor(seconds);
      if (activeTask.progress.step === 'transcribing') {
        activeTask.progress.percent = Math.min(100, Math.floor(seconds / capturedSeconds * 100));
      }
    });
    await recording;
    beginStep('recording-validation');
    capturedSeconds = capturedAudioSeconds(audioPath);
    if (capturedSeconds < 1) {
      throw new Error('未录到有效音频，请检查直播流并至少录制 1 秒');
    }

    if (config.keepAudio) {
      beginStep('archive-audio', { capturedSeconds });
      withWriteTransaction(db => archiveTaskAudio(db, date));
      retained = true;
    }
    // A short live stream can exit successfully. Allow modest timing
    // differences, and honor an administrator's explicit early finish.
    beginStep('recording-duration-check', { capturedSeconds });
    const minimumSeconds = Math.ceil(duration * 60 * 0.9);
    if (scheduled && capturedSeconds < minimumSeconds) {
      const task = db.prepare('SELECT status FROM xinwenlianbo_tasks WHERE taskDate = ?').get(date);
      if (task.status !== 'finishing') {
        throw new Error(`定时录制提前结束，仅录到 ${capturedSeconds} 秒，至少需要 ${minimumSeconds} 秒`);
      }
    }
    beginStep('transcribing');
    db.prepare("UPDATE xinwenlianbo_tasks SET status = 'transcribing' WHERE taskDate = ?").run(date);
    if (activeTask.transcribedSeconds) {
      activeTask.progress.percent = Math.min(100, Math.floor(activeTask.transcribedSeconds / capturedSeconds * 100));
    }
    const live = await liveTranscription.finish();
    if (live.error) logStepFailure(date, 'live-transcription', live.error);
    let transcript = live.transcript;
    if (!transcript) {
      activeTask.progress.percent = null;
      activeTask.transcribedSeconds = null;
      transcript = (await transcribe(audioPath, config.whisperExecutable, config.whisperModelPath, percent => {
        activeTask.progress.percent = percent;
      })).trim();
    }
    if (!transcript) throw new Error('没有转录到有效文字，请检查录音后重试');

    beginStep('save-transcript', { transcriptLength: transcript.length });
    db.prepare("UPDATE xinwenlianbo_tasks SET status = 'summarizing', transcript = ? WHERE taskDate = ?")
      .run(transcript, date);

    const summary = await buildSummary(transcript, config);
    return publishSummary({ date, sourceId, originalUrl, transcript, ...summary });

  } catch (err) {
    const status = err.code === 'RECORDING_CANCELLED' ? 'cancelled' : 'failed';
    if (status === 'cancelled') console.log('[Xinwenlianbo] Recording cancelled', { date });
    else logCurrentFailure(date, err);
    try {
      getDb().prepare("UPDATE xinwenlianbo_tasks SET status = ?, errorMessage = ?, completedAt = datetime('now') WHERE taskDate = ?")
        .run(status, err.message, date);
    } catch (stateError) {
      logStepFailure(date, 'save-task-status', stateError);
      throw err;
    }
    if (status === 'cancelled') return { status };
    throw err;
  } finally {
    stopProgressLogging();
    await liveTranscription?.cancel();
    if (!retained) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
        getDb().prepare('UPDATE xinwenlianbo_tasks SET audioFilePath = NULL WHERE taskDate = ?').run(date);
      } catch (err) {
        logStepFailure(date, 'cleanup', err);
      }
    }
  }
}

async function buildSummary(transcript, config, { manual = false } = {}) {
  beginStep('extract-headlines');
  const openingHeadlines = extractOpeningHeadlines(transcript);
  if (config.llmApiKey && config.llmApiUrl) {
    try {
      beginStep('summary-request', { model: config.llmModel });
      const result = await summarize(transcript, {
        apiUrl: config.llmApiUrl, apiKey: config.llmApiKey, model: config.llmModel
      }, step => {
        if (step !== activeTask.progress.step) beginStep(step);
      });
      beginStep('validate-summary');
      if (typeof result.summary !== 'string' || !result.summary.trim()) {
        throw new Error('摘要服务未返回有效正文');
      }
      const headlines = normalizeHeadlines(result.headlines);
      return {
        summary: result.summary.trim(),
        headlines: JSON.stringify(headlines.length ? headlines : openingHeadlines)
      };
    } catch (err) {
      if (manual) throw new Error('摘要生成失败，请检查模型配置后重试', { cause: err });
      logCurrentFailure(activeTask.date, err);
    }
  }
  beginStep('summary-fallback', { reason: config.llmApiKey && config.llmApiUrl ? 'request-failed' : 'missing-configuration' });
  return { summary: transcript.slice(0, 500), headlines: JSON.stringify(openingHeadlines) };
}

function publishSummary({ date, sourceId, originalUrl, transcript, summary, headlines }) {
  const title = `${date} 新闻联播摘要`;
  beginStep('publish-summary');
  const result = withWriteTransaction(db => {
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
  console.log('[Xinwenlianbo] Task completed', { date, articleId: result.articleId, ...currentProgress() });
  return result;
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

function audioForTask(db, id) {
  const task = db.prepare('SELECT taskDate, audioFilePath, startedAt FROM xinwenlianbo_tasks WHERE id = ?').get(id);
  if (!task) return [];
  const audio = db.prepare(`
    SELECT id, audioFilePath, startedAt FROM xinwenlianbo_audio WHERE taskId = ? ORDER BY id DESC
  `).all(id);
  if (task.audioFilePath && task.audioFilePath !== activeTask?.audioPath) {
    audio.unshift({ id: 'legacy', audioFilePath: task.audioFilePath, startedAt: task.startedAt });
  }
  return audio.map(item => ({ ...item, taskDate: task.taskDate }));
}

function visibleAudio(audio) {
  return audio.flatMap(({ id, audioFilePath, startedAt, taskDate }) => {
    try {
      return recordingFile(audioFilePath, taskDate)
        ? [{ id, startedAt, processing: audioFilePath === activeTask?.audioPath }]
        : [];
    } catch {
      return [];
    }
  });
}

export function getXinwenlianboAudio(taskId, audioId) {
  const audio = audioForTask(getDb(), taskId).find(item => item.id === audioId);
  const file = audio && recordingFile(audio.audioFilePath, audio.taskDate);
  if (!file) throw taskError('录音文件不存在', 404);
  return file.path;
}

export function deleteXinwenlianboAudio(taskId, audioId) {
  const db = getDb();
  const audio = audioForTask(db, taskId).find(item => item.id === audioId);
  if (!audio) throw taskError('录音文件不存在', 404);
  if (audio.audioFilePath === activeTask?.audioPath) throw taskError('正在处理的录音不能删除', 409);
  removeRecordingAudio(audio.audioFilePath, audio.taskDate);
  if (audioId === 'legacy') {
    db.prepare('UPDATE xinwenlianbo_tasks SET audioFilePath = NULL WHERE id = ?').run(taskId);
  } else {
    db.prepare('DELETE FROM xinwenlianbo_audio WHERE id = ?').run(audioId);
  }
}

export function listXinwenlianboRecords(page, limit) {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) AS total FROM xinwenlianbo_tasks').get().total;
  const offset = (page - 1) * limit;
  const items = offset < total ? db.prepare(`
    SELECT ${historyFields} FROM xinwenlianbo_tasks t
    ORDER BY t.taskDate DESC LIMIT ? OFFSET ?
  `).all(limit, offset).map(record => ({
    ...normalizeRecord(record), audio: visibleAudio(audioForTask(db, record.id))
  })) : [];
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export function getXinwenlianboRecord(id) {
  return normalizeRecord(getDb().prepare(`
    SELECT ${historyFields}, t.transcript, t.summary, t.headlines
    FROM xinwenlianbo_tasks t WHERE t.id = ?
  `).get(id));
}

export function startXinwenlianboSummary(id) {
  try {
    return prepareSummary(id);
  } catch (err) {
    if (err.code !== 1003) logStepFailure(undefined, 'summary-setup', err, undefined, { taskId: id });
    throw err;
  }
}

function prepareSummary(id) {
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
  const stopProgressLogging = startProgressLogging();
  const completion = buildSummary(transcript, config, { manual: true })
    .then(summary => publishSummary({ date, sourceId: source.sourceId, originalUrl, transcript, ...summary }))
    .catch(err => {
      logCurrentFailure(date, err);
      try {
        db.prepare('UPDATE xinwenlianbo_tasks SET status = ?, errorMessage = ? WHERE id = ?')
          .run(record.status, err.message, id);
      } catch (stateError) {
        logStepFailure(date, 'save-task-status', stateError);
      }
      throw err;
    })
    .finally(() => {
      stopProgressLogging();
      activeTask = null;
    });

  return { status: getXinwenlianboStatus(), completion };
}

function recordingFile(audioPath, date) {
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

  if (!file.isFile() || (!legacy && !current)) throw taskError('录音文件路径异常', 409);
  return { path: path.join(realDirectory, path.basename(audioPath)), directory: current ? realDirectory : null };
}

function removeRecordingAudio(audioPath, date) {
  const file = recordingFile(audioPath, date);
  if (!file) return;
  fs.unlinkSync(file.path);
  if (file.directory) {
    try {
      fs.rmdirSync(file.directory);
    } catch (err) {
      if (err.code !== 'ENOTEMPTY') console.error('[Xinwenlianbo] Could not remove empty recording directory:', err.code);
    }
  }
}

export function cleanupExpiredXinwenlianboAudio(now = new Date()) {
  const cutoff = new Date(now.getTime() - AUDIO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const db = getDb();
  const expired = db.prepare(`
    SELECT id, taskDate, audioFilePath, 0 AS archived FROM xinwenlianbo_tasks
    WHERE audioFilePath IS NOT NULL
      AND julianday(COALESCE(startedAt, taskDate || ' 00:00:00+08:00')) < julianday(?)
    UNION ALL
    SELECT a.id, t.taskDate, a.audioFilePath, 1 AS archived
    FROM xinwenlianbo_audio a JOIN xinwenlianbo_tasks t ON t.id = a.taskId
    WHERE julianday(COALESCE(a.startedAt, t.taskDate || ' 00:00:00+08:00')) < julianday(?)
  `).all(cutoff, cutoff);
  const deleteAudio = db.prepare('DELETE FROM xinwenlianbo_audio WHERE id = ?');
  const clearAudio = db.prepare('UPDATE xinwenlianbo_tasks SET audioFilePath = NULL WHERE id = ? AND audioFilePath = ?');
  let cleared = 0;
  for (const { id, taskDate, audioFilePath, archived } of expired) {
    if (!archived && activeTask?.date === taskDate) continue;
    try {
      removeRecordingAudio(audioFilePath, taskDate);
      cleared += (archived ? deleteAudio.run(id) : clearAudio.run(id, audioFilePath)).changes;
    } catch (err) {
      console.error(`[Xinwenlianbo] Audio cleanup failed for task ${id}:`, err.code || err.message);
    }
  }
  return cleared;
}

export function deleteXinwenlianboRecord(id, { deleteArticle = false } = {}) {
  return withWriteTransaction(db => {
    const record = db.prepare(`
      SELECT ${historyFields} FROM xinwenlianbo_tasks t WHERE t.id = ?
    `).get(id);
    if (!record) throw taskError('录制记录不存在', 404);
    if (activeTask?.date === record.taskDate) throw taskError('正在处理的录制记录不能删除', 409);

    const articleDeleted = !!(deleteArticle && record.articleId &&
      db.prepare('DELETE FROM articles WHERE id = ?').run(record.articleId).changes);
    const audio = audioForTask(db, id);
    for (const item of audio) recordingFile(item.audioFilePath, record.taskDate);
    for (const item of audio) removeRecordingAudio(item.audioFilePath, record.taskDate);
    db.prepare('DELETE FROM xinwenlianbo_audio WHERE taskId = ?').run(id);
    db.prepare('DELETE FROM xinwenlianbo_tasks WHERE id = ?').run(id);
    return { articleDeleted };
  });
}
