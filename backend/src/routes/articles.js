import { Router } from 'express';
import { listArticles, getArticleById, getRecentArticles } from '../models/article.js';
import { getDb } from '../db.js';

const router = Router();

router.get('/', (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sourceId = req.query.sourceId ? parseInt(req.query.sourceId) : undefined;
    const category = [req.query.category].flat()
      .filter((value) => typeof value === 'string' && value.trim())
      .slice(0, 30);
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

function getHotArticles(range, page = 1, limit = 20) {
  const db = getDb();
  const maxLimit = Math.min(limit, 100);
  const offset = (page - 1) * maxLimit;

  let since;
  const now = new Date();
  if (range === 'week') {
    since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  } else {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }

  const countStmt = db.prepare(`
    SELECT COUNT(DISTINCT a.id) as total
    FROM articles a
    WHERE datetime(a.publishedAt) >= datetime(?)
  `);
  const { total } = countStmt.get(since);

  const stmt = db.prepare(`
    SELECT a.*, s.name as sourceName, s.category, COUNT(al.userId) as likeCount
    FROM articles a
    JOIN sources s ON a.sourceId = s.id
    LEFT JOIN article_likes al ON a.id = al.articleId
    WHERE datetime(a.publishedAt) >= datetime(?)
    GROUP BY a.id
    ORDER BY likeCount DESC, a.publishedAt DESC
    LIMIT ? OFFSET ?
  `);
  const items = stmt.all(since, maxLimit, offset);
  return { items, total, page, limit: maxLimit };
}

router.get('/hot', async (req, res, next) => {
  try {
    const range = req.query.range === 'week' ? 'week' : 'today';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const { items, total, page: p, limit: l } = getHotArticles(range, page, limit);
    res.sendJson(0, 'success', {
      items,
      pagination: { page: p, limit: l, total, totalPages: Math.ceil(total / l) }
    });
  } catch (err) { next(err); }
});

router.get('/hot-sidebar', async (req, res, next) => {
  try {
    const range = req.query.range === 'week' ? 'week' : 'today';
    const { items } = getHotArticles(range, 1, 5);
    res.sendJson(0, 'success', { items });
  } catch (err) { next(err); }
});

export default router;
