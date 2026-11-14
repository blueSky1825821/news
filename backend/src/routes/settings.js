import { Router } from 'express';
import { getFailureThreshold, setFailureThreshold } from '../models/settings.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';

const router = Router();
router.use(authMiddleware, adminMiddleware);

router.get('/failure-threshold', (req, res, next) => {
  try {
    const threshold = getFailureThreshold();
    res.sendJson(0, 'success', { threshold });
  } catch (err) {
    next(err);
  }
});

router.put('/failure-threshold', (req, res, next) => {
  try {
    const { threshold } = req.body;
    const value = setFailureThreshold(threshold);
    res.sendJson(0, 'success', { threshold: value });
  } catch (err) {
    err.statusCode = 400;
    next(err);
  }
});

export default router;
