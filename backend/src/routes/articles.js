import { Router } from 'express';
import { listArticles, getArticleById, getRecentArticles } from '../models/article.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sourceId = req.query.sourceId ? parseInt(req.query.sourceId) : undefined;
    const category = req.query.category || undefined;
    const result = listArticles({ page, limit, sourceId, category });
    res.sendJson(0, 'success', result);
  } catch (err) {
    next(err);
  }
});

router.get('/today', (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const allArticles = getRecentArticles(1000, 24);
    const total = allArticles.length;
    const offset = (page - 1) * limit;
    const items = allArticles.slice(offset, offset + limit);
    res.sendJson(0, 'success', {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const article = getArticleById(id);
    if (!article) {
      const err = new Error('Article not found');
      err.statusCode = 404;
      err.code = 1001;
      throw err;
    }
    res.sendJson(0, 'success', article);
  } catch (err) {
    next(err);
  }
});

export default router;
