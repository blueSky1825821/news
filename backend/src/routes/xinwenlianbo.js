import { logConsole } from '../utils/logger.js';
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import {
  getXinwenlianboConfig, getXinwenlianboDate, getXinwenlianboStatus,
  startXinwenlianboTask, listXinwenlianboRecords,
  getXinwenlianboRecord, deleteXinwenlianboRecord
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
    const { status, completion } = startXinwenlianboTask(getXinwenlianboDate(), {
      force: req.query.force === 'true'
    });
    completion.catch(err => logConsole('error', '[Xinwenlianbo] Manual task failed:', err.message));
    res.sendJson(0, '正在抓取央视网新闻', { ...status, taskDate: status.date });
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

router.get('/tasks/:id', (req, res, next) => {
  try {
    const record = getXinwenlianboRecord(positiveInteger(req.params.id, 0));
    if (!record) throw Object.assign(new Error('任务记录不存在'), { statusCode: 404 });
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
    res.sendJson(0, '任务记录已删除', { ...result, status: getXinwenlianboStatus() });
  } catch (err) {
    next(err);
  }
});

router.get('/config', (req, res, next) => {
  try {
    res.sendJson(0, 'success', getXinwenlianboConfig());
  } catch (err) {
    next(err);
  }
});

export default router;
