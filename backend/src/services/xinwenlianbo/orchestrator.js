import path from 'path';
import os from 'os';
import fs from 'fs';
import { getDb } from '../../db.js';
import { startRecording, stopRecording } from './recorder.js';
import { transcribe } from './transcriber.js';
import { summarize } from './summarizer.js';
import { insertArticle } from '../../models/article.js';

function getXinwenlianboConfig() {
  return {
    enabled: process.env.XINWENLIANBO_ENABLED !== 'false',
    audioUrl: process.env.XINWENLIANBO_AUDIO_URL || 'https://piccpndali.v.myalicdn.com/audio/cctv1_2.m3u8',
    durationMinutes: parseInt(process.env.XINWENLIANBO_DURATION_MINUTES, 10) || 30,
    whisperExecutable: process.env.WHISPER_EXECUTABLE,
    whisperModelPath: process.env.WHISPER_MODEL_PATH,
    llmProvider: process.env.LLM_PROVIDER || 'deepseek',
    llmApiUrl: process.env.LLM_API_URL,
    llmApiKey: process.env.LLM_API_KEY,
    llmModel: process.env.LLM_MODEL || 'deepseek-chat',
    keepAudio: process.env.XINWENLIANBO_KEEP_AUDIO === 'true'
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

  const tmpDir = process.env.TMPDIR || os.tmpdir();
  const audioPath = path.join(tmpDir, `xinwenlianbo-${date}.wav`);

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
      originalUrl: config.audioUrl,
      sourceId,
      publishedAt: new Date().toISOString(),
      transcript
    });

    db.prepare(`
      UPDATE xinwenlianbo_tasks
      SET status = 'completed', summary = ?, headlines = ?, completedAt = datetime('now')
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
    throw err;
  }
}

export { stopRecording };
