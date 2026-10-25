import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { getUserCategories, setUserCategories } from '../models/userCategory.js';
import { CATEGORY_NAMES } from '../constants/categories.js';

const router = Router();

router.get('/', authMiddleware, (req, res, next) => {
  try {
    const categories = getUserCategories(req.userId);
    res.sendJson(0, 'success', { categories });
  } catch (err) {
    next(err);
  }
});

router.put('/', authMiddleware, (req, res, next) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) {
      const err = new Error('Categories must be an array');
      err.statusCode = 400;
      err.code = 1011;
      throw err;
    }

    const validCategories = categories.filter((c) => CATEGORY_NAMES.includes(c));
    const saved = setUserCategories(req.userId, validCategories);
    res.sendJson(0, 'success', { categories: saved });
  } catch (err) {
    next(err);
  }
});

export default router;
