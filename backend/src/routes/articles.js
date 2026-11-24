import { Router } from 'express';
import { listArticles, getArticleById, listRecentArticles, listHotArticles } from '../models/article.js';
import { generateAnalysis, listAnalyses, listAnalysisModels } from '../services/xinwenlianbo/analysis.js';
import { authMiddleware, adminMiddleware, verifyToken } from '../middleware/auth.js';

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
    const date = typeof req.query.date === 'string' ? req.query.date : '';
    const start = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00+08:00`) : null;
    const validDate = start && Number.isFinite(start.getTime()) &&
      new Date(start.getTime() + 8 * 3600000).toISOString().slice(0, 10) === date;
    if (req.query.date !== undefined && !validDate) return res.status(400).sendJson(400, '请选择有效的发布日期');
    const publishedRange = validDate
      ? [start.toISOString(), new Date(start.getTime() + 86400000).toISOString()]
      : undefined;
    const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const result = listArticles({ page, limit, sourceId, category, cards, viewerId, publishedRange, query });
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

router.get('/:id/investment-analyses', (req, res, next) => {
  try {
    res.sendJson(0, 'success', listAnalyses(positiveInteger(req.params.id, 0)));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/investment-analyses', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const result = await generateAnalysis(positiveInteger(req.params.id, 0), req.body?.modelId);
    res.sendJson(0, '分析已保存', result);
  } catch (err) {
    next(err);
  }
});

router.get('/investment-analysis-models', authMiddleware, adminMiddleware, (req, res, next) => {
  try {
    res.sendJson(0, 'success', listAnalysisModels());
  } catch (err) {
    next(err);
  }
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
