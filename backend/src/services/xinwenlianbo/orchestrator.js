import path from 'path';
import os from 'os';
import fs from 'fs';
import { execSync } from 'child_process';
import { getDb } from '../../db.js';
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

function getXinwenlianboConfig() {
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

export async function runXinwenlianboTask(date) {
  const config = getXinwenlianboConfig();
  if (!config.enabled) {
    console.log('[Xinwenlianbo] Disabled, skipping.');
    return null;
  }

  const db = getDb();

  const existing = db.prepare('SELECT status FROM xinwenlianbo_tasks WHERE taskDate = ?').get(date);
  if (existing && existing.status === 'completed') {
    console.log(`[Xinwenlianbo] Task for ${date} already completed.`);
    return { skipped: true, reason: 'already_completed' };
  }

  if (['recording', 'transcribing', 'summarizing'].includes(existing?.status)) {
    return { skipped: true, reason: 'already_in_progress' };
  }

  const tmpDir = process.env.TMPDIR || os.tmpdir();
  const audioPath = path.join(tmpDir, `xinwenlianbo-${date}.wav`);

  // Disk space check (need at least 500MB)
  try {
    const stats = fs.statSync(tmpDir);
    // statSync doesn't give free space directly; for a rough check we can try writing a test
    // On Linux we could parse `df`, but a simpler approach is to just proceed and let ffmpeg fail
    // if disk is full. However, let's add a best-effort check.
    const dfOutput = execSync(`df -B1 "${tmpDir}" | tail -1`, { encoding: 'utf-8' }).trim();
    const freeBytes = parseInt(dfOutput.split(/\s+/)[3], 10);
    if (freeBytes < 500 * 1024 * 1024) {
      throw new Error(`磁盘空间不足：仅剩 ${Math.round(freeBytes / 1024 / 1024)}MB，需要至少 500MB`);
    }
  } catch (e) {
    if (e.message.includes('磁盘空间不足')) throw e;
    // If df fails, skip the check and proceed
  }

  db.prepare(`
    INSERT INTO xinwenlianbo_tasks (taskDate, status, audioFilePath, startedAt)
    VALUES (?, 'recording', ?, datetime('now'))
    ON CONFLICT(taskDate) DO UPDATE SET
      status = 'recording',
      audioFilePath = excluded.audioFilePath,
      startedAt = datetime('now'),
      errorMessage = NULL
  `).run(date, audioPath);

  try {
    console.log(`[Xinwenlianbo] Starting recording for ${date}...`);
    await startRecording(config.audioUrl, config.durationMinutes * 60, audioPath);

    if (!config.whisperExecutable || !config.whisperModelPath) {
      throw new Error('WHISPER_EXECUTABLE or WHISPER_MODEL_PATH not configured');
    }

    db.prepare("UPDATE xinwenlianbo_tasks SET status = 'transcribing' WHERE taskDate = ?").run(date);
    console.log(`[Xinwenlianbo] Transcribing...`);
    const transcript = await transcribe(audioPath, config.whisperExecutable, config.whisperModelPath);

    db.prepare("UPDATE xinwenlianbo_tasks SET status = 'summarizing', transcript = ? WHERE taskDate = ?")
      .run(transcript, date);
    console.log(`[Xinwenlianbo] Summarizing...`);

    let headlines = '[]';
    let summary = '';

    if (config.llmApiKey && config.llmApiUrl) {
      try {
        const llmResult = await summarize(transcript, {
          apiUrl: config.llmApiUrl,
          apiKey: config.llmApiKey,
          model: config.llmModel
        });
        headlines = JSON.stringify(llmResult.headlines || []);
        summary = llmResult.summary || '';
      } catch (err) {
        console.error('[Xinwenlianbo] LLM summarization failed:', err.message);
        summary = transcript.slice(0, 500);
      }
    } else {
      console.log('[Xinwenlianbo] LLM not configured, using transcript fallback.');
      summary = transcript.slice(0, 500);
    }

    const source = db.prepare("SELECT id FROM sources WHERE type = 'xinwenlianbo' LIMIT 1").get();
    const sourceId = source?.id || 1;

    const articleId = insertArticle({
      title: `${date} 新闻联播摘要`,
      summary,
      content: summary,
      originalUrl: `${config.audioUrl}?date=${date}`,
      sourceId,
      publishedAt: new Date().toISOString(),
      transcript,
      headlines
    });

    db.prepare(`
      UPDATE xinwenlianbo_tasks
      SET status = 'completed', summary = ?, headlines = ?, errorMessage = NULL, completedAt = datetime('now')
      WHERE taskDate = ?
    `).run(summary, headlines, date);

    if (!config.keepAudio && fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
    }

    console.log(`[Xinwenlianbo] Task for ${date} completed. Article ID: ${articleId}`);
    return { articleId, status: 'completed' };

  } catch (err) {
    console.error(`[Xinwenlianbo] Task for ${date} failed:`, err.message);
    db.prepare(`
      UPDATE xinwenlianbo_tasks
      SET status = 'failed', errorMessage = ?
      WHERE taskDate = ?
    `).run(err.message, date);
    if (!config.keepAudio && fs.existsSync(audioPath)) {
      try { fs.unlinkSync(audioPath); } catch (e) {}
    }
    throw err;
  }
}

export { stopRecording };
