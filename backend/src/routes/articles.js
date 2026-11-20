import { Router } from 'express';
import { listArticles, getArticleById, listRecentArticles, listHotArticles } from '../models/article.js';
import { verifyToken } from '../middleware/auth.js';

const router = Router();

function positiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const number = typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, max) : fallback;
}

function viewerFor(req, res) {
  res.set('Cache-Control', 'private, no-store');
  const header = req.get('Authorization') || '';
  return header.startsWith('Bearer ') ? verifyToken(header.slice(7))?.userId ?? null : null;
}

router.get('/', (req, res, next) => {
  try {
    const page = positiveInteger(req.query.page, 1);
    const limit = positiveInteger(req.query.limit, 20, 100);
    const sourceId = positiveInteger(req.query.sourceId, undefined);
    const cards = req.query.view === 'card';
    const viewerId = cards ? viewerFor(req, res) : null;
    const category = [req.query.category].flat()
      .filter((value) => typeof value === 'string' && value.trim())
      .slice(0, 30);
    const result = listArticles({ page, limit, sourceId, category, cards, viewerId });
    res.sendJson(0, 'success', result);
  } catch (err) {
    next(err);
  }
});

router.get('/today', (req, res, next) => {
  try {
    const page = positiveInteger(req.query.page, 1);
    const limit = positiveInteger(req.query.limit, 20);
    const cards = req.query.view === 'card';
    const viewerId = cards ? viewerFor(req, res) : null;
    res.sendJson(0, 'success', listRecentArticles({ page, limit, cards, viewerId }));
  } catch (err) {
    next(err);
  }
});

router.get('/hot', (req, res, next) => {
  try {
    const page = positiveInteger(req.query.page, 1);
    const limit = positiveInteger(req.query.limit, 20, 100);
    const cards = req.query.view === 'card';
    res.sendJson(0, 'success', listHotArticles({ range: req.query.range, page, limit, cards }));
  } catch (err) { next(err); }
});

router.get('/hot-sidebar', (req, res, next) => {
  try {
    const cards = req.query.view === 'card';
    const { items } = listHotArticles({ range: req.query.range, page: 1, limit: 5, cards, includeTotal: false });
    res.sendJson(0, 'success', { items });
  } catch (err) { next(err); }
});

router.get('/:id', (req, res, next) => {
  try {
    const id = positiveInteger(req.params.id, null);
    const includeLikes = req.query.includeLikes === '1';
    const viewerId = includeLikes ? viewerFor(req, res) : null;
    const article = id === null ? null : getArticleById(id, { includeLikes, viewerId });
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
