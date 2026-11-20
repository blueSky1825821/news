import { Router } from 'express';
import { getTrends } from '../services/trends.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.sendJson(0, 'success', await getTrends({ refresh: req.query.refresh === '1' }));
  } catch (err) {
    next(err);
  }
});

export default router;
