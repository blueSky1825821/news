import { Router } from 'express';
import { getDb } from '../db.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { triggerManualXinwenlianbo, stopXinwenlianboRecording } from '../services/scheduler.js';

const router = Router();

router.use(authMiddleware, adminMiddleware);

function getTodayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
}

router.get('/status', (req, res, next) => {
  try {
    const today = getTodayDate();
    const db = getDb();
    const task = db.prepare('SELECT * FROM xinwenlianbo_tasks WHERE taskDate = ?').get(today);

    if (!task) {
      res.sendJson(0, 'success', { date: today, status: 'pending' });
      return;
    }

    res.sendJson(0, 'success', {
      date: task.taskDate,
      status: task.status,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      errorMessage: task.errorMessage
    });
  } catch (err) {
    next(err);
  }
});

router.post('/trigger', async (req, res, next) => {
  try {
    const today = getTodayDate();
    const db = getDb();
    const existing = db.prepare('SELECT status FROM xinwenlianbo_tasks WHERE taskDate = ?').get(today);

    if (existing?.status === 'completed' && !req.query.force) {
      res.sendJson(1002, "Today's task already completed. Use force=true to re-record.", null);
      return;
    }

    if (existing && ['recording', 'transcribing', 'summarizing'].includes(existing.status)) {
      res.sendJson(1003, "Today's task is already in progress.", null);
      return;
    }

    const result = await triggerManualXinwenlianbo();
    res.sendJson(0, 'Task started', { taskDate: today, status: result?.status || 'recording' });
  } catch (err) {
    next(err);
  }
});

router.post('/stop', (req, res, next) => {
  try {
    const stopped = stopXinwenlianboRecording();
    if (stopped) {
      const today = getTodayDate();
      const db = getDb();
      db.prepare("UPDATE xinwenlianbo_tasks SET status = 'failed', errorMessage = 'Stopped by user' WHERE taskDate = ? AND status = 'recording'").run(today);
      res.sendJson(0, 'Recording stopped', { taskDate: today, status: 'failed' });
    } else {
      res.sendJson(0, 'No active recording to stop', null);
    }
  } catch (err) {
    next(err);
  }
});

router.get('/tasks', (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    const db = getDb();
    const total = db.prepare('SELECT COUNT(*) as count FROM xinwenlianbo_tasks').get().count;
    const items = db.prepare(`
      SELECT * FROM xinwenlianbo_tasks ORDER BY taskDate DESC LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.sendJson(0, 'success', {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/config', (req, res, next) => {
  try {
    res.sendJson(0, 'success', {
      enabled: process.env.XINWENLIANBO_ENABLED !== 'false',
      audioUrl: process.env.XINWENLIANBO_AUDIO_URL,
      durationMinutes: parseInt(process.env.XINWENLIANBO_DURATION_MINUTES, 10) || 30,
      llmProvider: process.env.LLM_PROVIDER,
      llmModel: process.env.LLM_MODEL
    });
  } catch (err) {
    next(err);
  }
});

export default router;
