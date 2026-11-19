import { Router } from 'express';
import { authMiddleware, verifiedEmailMiddleware, adminMiddleware } from '../middleware/auth.js';
import { createComment, findCommentById, getArticleComments, softDeleteComment, reportComment, getReportedComments, clearCommentReports } from '../models/comment.js';

const router = Router();

router.post('/articles/:id/comments', authMiddleware, verifiedEmailMiddleware, async (req, res, next) => {
  try {
    const articleId = Number(req.params.id);
    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 2000) {
      const err = new Error('Comment content must be 1-2000 characters');
      err.statusCode = 400;
      err.code = 1025;
      throw err;
    }
    const comment = createComment({ articleId, userId: req.userId, content: content.trim() });
    res.sendJson(0, 'success', {
      id: comment.id,
      articleId: comment.articleId,
      userId: comment.userId,
      content: comment.content,
      parentId: comment.parentId,
      isDeleted: !!comment.isDeleted,
      reportCount: comment.reportCount,
      createdAt: comment.createdAt,
      user: { id: comment.userId, displayName: comment.userEmail }
    });
  } catch (err) { next(err); }
});

router.post('/comments/:id/reply', authMiddleware, verifiedEmailMiddleware, async (req, res, next) => {
  try {
    const parentId = Number(req.params.id);
    const { content } = req.body;
    if (!content || typeof content !== 'string' || content.trim().length === 0 || content.length > 2000) {
      const err = new Error('Reply content must be 1-2000 characters');
      err.statusCode = 400;
      err.code = 1025;
      throw err;
    }
    const parent = findCommentById(parentId);
    if (!parent || parent.parentId !== null) {
      const err = new Error('Can only reply to top-level comments');
      err.statusCode = 400;
      err.code = 1028;
      throw err;
    }
    const reply = createComment({ articleId: parent.articleId, userId: req.userId, content: content.trim(), parentId });
    res.sendJson(0, 'success', {
      id: reply.id,
      articleId: reply.articleId,
      userId: reply.userId,
      content: reply.content,
      parentId: reply.parentId,
      isDeleted: !!reply.isDeleted,
      reportCount: reply.reportCount,
      createdAt: reply.createdAt,
      user: { id: reply.userId, displayName: reply.userEmail }
    });
  } catch (err) { next(err); }
});

router.get('/articles/:id/comments', async (req, res, next) => {
  try {
    const articleId = Number(req.params.id);
    const comments = getArticleComments(articleId);
    res.sendJson(0, 'success', { comments: comments.map(c => ({
      id: c.id,
      content: c.content,
      isDeleted: !!c.isDeleted,
      reportCount: c.reportCount,
      createdAt: c.createdAt,
      user: { id: c.userId, displayName: c.userEmail },
      replies: (c.replies || []).map(r => ({
        id: r.id,
        content: r.content,
        isDeleted: !!r.isDeleted,
        createdAt: r.createdAt,
        user: { id: r.userId, displayName: r.userEmail }
      }))
    })) });
  } catch (err) { next(err); }
});

router.delete('/comments/:id', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    softDeleteComment(Number(req.params.id));
    res.sendJson(0, 'Comment deleted');
  } catch (err) { next(err); }
});

router.post('/comments/:id/report', authMiddleware, async (req, res, next) => {
  try {
    const commentId = Number(req.params.id);
    const { reason } = req.body;
    reportComment(commentId, req.userId, reason || null);
    res.sendJson(0, 'Comment reported');
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      const e = new Error('You have already reported this comment');
      e.statusCode = 409;
      e.code = 1024;
      return next(e);
    }
    next(err);
  }
});

router.get('/comments/reported', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const comments = getReportedComments();
    res.sendJson(0, 'success', { comments });
  } catch (err) { next(err); }
});

router.post('/comments/:id/clear-reports', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    clearCommentReports(Number(req.params.id));
    res.sendJson(0, 'Reports cleared');
  } catch (err) { next(err); }
});

export default router;

