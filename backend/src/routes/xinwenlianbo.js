import { logConsole } from '../utils/logger.js';
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { setSetting } from '../models/settings.js';
import {
  getXinwenlianboConfig, getXinwenlianboDate, getXinwenlianboStatus,
  startXinwenlianboTask, stopXinwenlianboTask, listXinwenlianboRecords,
  getXinwenlianboRecord, startXinwenlianboSummary, deleteXinwenlianboRecord,
  getXinwenlianboAudio, deleteXinwenlianboAudio
} from '../services/xinwenlianbo/orchestrator.js';

const router = Router();

router.use(authMiddleware, adminMiddleware);

router.get('/status', (req, res, next) => {
  try {
    res.sendJson(0, 'success', getXinwenlianboStatus());
  } catch (err) {
    next(err);
  }
});

router.post('/trigger', (req, res, next) => {
  try {
    const { durationMinutes } = req.body ?? {};
    const { status, completion } = startXinwenlianboTask(getXinwenlianboDate(), {
      force: req.query.force === 'true',
      durationMinutes
    });
    completion.catch(err => logConsole('error', '[Xinwenlianbo] Manual task failed:', err.message));
    res.sendJson(0, '录制已开始', { ...status, taskDate: status.date });
  } catch (err) {
    next(err);
  }
});

router.post('/stop', (req, res, next) => {
  try {
    const status = stopXinwenlianboTask({ finish: req.body?.finish === true });
    res.sendJson(0, status ? '结束指令已发送' : '当前没有正在录制的任务', status);
  } catch (err) {
    next(err);
  }
});

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

router.get('/tasks', (req, res, next) => {
  try {
    const page = positiveInteger(req.query.page, 1);
    const limit = Math.min(positiveInteger(req.query.limit, 20), 100);
    res.sendJson(0, 'success', listXinwenlianboRecords(page, limit));
  } catch (err) {
    next(err);
  }
});

function audioId(value) {
  return value === 'legacy' ? value : positiveInteger(value, 0);
}

router.get('/tasks/:id/audio/:audioId', (req, res, next) => {
  try {
    const file = getXinwenlianboAudio(positiveInteger(req.params.id, 0), audioId(req.params.audioId));
    res.type('wav').sendFile(file, { cacheControl: false, headers: { 'Cache-Control': 'private, no-store' } }, err => {
      if (err) next(err);
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/tasks/:id/audio/:audioId', (req, res, next) => {
  try {
    deleteXinwenlianboAudio(positiveInteger(req.params.id, 0), audioId(req.params.audioId));
    res.sendJson(0, '录音已删除', null);
  } catch (err) {
    next(err);
  }
});

router.get('/tasks/:id', (req, res, next) => {
  try {
    const record = getXinwenlianboRecord(positiveInteger(req.params.id, 0));
    if (!record) throw Object.assign(new Error('录制记录不存在'), { statusCode: 404 });
    res.sendJson(0, 'success', record);
  } catch (err) {
    next(err);
  }
});

router.delete('/tasks/:id', (req, res, next) => {
  try {
    const result = deleteXinwenlianboRecord(positiveInteger(req.params.id, 0), {
      deleteArticle: req.body?.deleteArticle === true
    });
    res.sendJson(0, '录制记录已删除', { ...result, status: getXinwenlianboStatus() });
  } catch (err) {
    next(err);
  }
});

router.post('/tasks/:id/summarize', (req, res, next) => {
  try {
    const { status, completion } = startXinwenlianboSummary(positiveInteger(req.params.id, 0));
    completion.catch(err => logConsole('error', '[Xinwenlianbo] Manual summary failed:', err.message));
    res.status(202).sendJson(0, '正在生成新闻摘要', status);
  } catch (err) {
    next(err);
  }
});

router.get('/config', (req, res, next) => {
  try {
    const { enabled, audioUrl, durationMinutes, llmProvider, llmModel, whisperExecutable, whisperModelPath } =
      getXinwenlianboConfig();
    res.sendJson(0, 'success', {
      enabled, audioUrl, durationMinutes, llmProvider, llmModel, whisperExecutable, whisperModelPath
    });
  } catch (err) {
    next(err);
  }
});

router.put('/config', (req, res, next) => {
  try {
    const { audioUrl, durationMinutes, llmProvider, llmModel, llmApiUrl, llmApiKey, llmModelName, whisperExecutable, whisperModelPath } = req.body;
    if (audioUrl !== undefined) setSetting('xwlb_audioUrl', audioUrl);
    if (durationMinutes !== undefined) setSetting('xwlb_durationMinutes', String(durationMinutes));
    if (llmProvider !== undefined) setSetting('xwlb_llmProvider', llmProvider);
    if (llmModel !== undefined) setSetting('xwlb_llmModel', llmModel);
    if (llmApiUrl !== undefined) setSetting('xwlb_llmApiUrl', llmApiUrl);
    if (llmApiKey !== undefined) setSetting('xwlb_llmApiKey', llmApiKey);
    if (llmModelName !== undefined) setSetting('xwlb_llmModel', llmModelName);
    if (whisperExecutable !== undefined) setSetting('xwlb_whisperExecutable', whisperExecutable);
    if (whisperModelPath !== undefined) setSetting('xwlb_whisperModelPath', whisperModelPath);
    res.sendJson(0, 'Config saved', null);
  } catch (err) {
    next(err);
  }
});

export default router;
