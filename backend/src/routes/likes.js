import { Router } from 'express';
import { authMiddleware, verifiedEmailMiddleware } from '../middleware/auth.js';
import { toggleLike, getLikeCount, hasLiked, getLikeUsers } from '../models/articleLike.js';

const router = Router({ mergeParams: true });

router.post('/', authMiddleware, verifiedEmailMiddleware, async (req, res, next) => {
  try {
    const articleId = Number(req.params.id);
    const liked = toggleLike(req.userId, articleId);
    const likeCount = getLikeCount(articleId);
    res.sendJson(0, 'success', { liked, likeCount });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const articleId = Number(req.params.id);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const { users, total } = getLikeUsers(articleId, limit, offset);
    res.sendJson(0, 'success', {
      users: users.map(u => ({ id: u.id, displayName: u.email })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) { next(err); }
});

router.get('/liked', authMiddleware, async (req, res, next) => {
  try {
    const articleId = Number(req.params.id);
    const liked = hasLiked(req.userId, articleId);
    res.sendJson(0, 'success', { liked });
  } catch (err) { next(err); }
});

export default router;
