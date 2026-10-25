import { Router } from 'express';
import { PREDEFINED_CATEGORIES } from '../constants/categories.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    res.sendJson(0, 'success', { categories: PREDEFINED_CATEGORIES });
  } catch (err) {
    next(err);
  }
});

export default router;
