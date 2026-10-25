import { Router } from 'express';
import { getWechatSettings, setWechatSettings } from '../models/wechatSettings.js';
import { flagArticle, unflagArticle, isFlagged, listFlaggedArticleIds } from '../models/articleFlag.js';
import { getRecentArticles } from '../models/article.js';
import { pushPreview, generatePreviewContent } from '../services/wechat.js';

const router = Router();

router.get('/settings', (req, res, next) => {
  try {
    const settings = getWechatSettings();
    res.sendJson(0, 'success', settings);
  } catch (err) {
    next(err);
  }
});

router.put('/settings', (req, res, next) => {
  try {
    const { appId, appSecret, previewOpenId, summaryPushEnabled, summaryPushCron } = req.body;
    const settings = setWechatSettings({ appId, appSecret, previewOpenId, summaryPushEnabled, summaryPushCron });
    res.sendJson(0, 'Settings saved', settings);
  } catch (err) {
    next(err);
  }
});

router.post('/flag', (req, res, next) => {
  try {
    const { articleId } = req.body;
    const id = Number(articleId);
    if (!Number.isFinite(id) || id <= 0) {
      const err = new Error('Invalid article id');
      err.statusCode = 400;
      err.code = 1002;
      throw err;
    }
    if (isFlagged(id)) {
      unflagArticle(id);
      res.sendJson(0, 'Unflagged', { articleId: id, flagged: false });
    } else {
      flagArticle(id);
      res.sendJson(0, 'Flagged', { articleId: id, flagged: true });
    }
  } catch (err) {
    next(err);
  }
});

router.get('/flags', (req, res, next) => {
  try {
    const ids = listFlaggedArticleIds();
    res.sendJson(0, 'success', { articleIds: ids });
  } catch (err) {
    next(err);
  }
});

router.get('/preview-content', (req, res, next) => {
  try {
    const articles = getRecentArticles(100, 24);
    const flaggedIds = listFlaggedArticleIds();
    const preview = generatePreviewContent(articles, flaggedIds);
    res.sendJson(0, 'success', preview);
  } catch (err) {
    next(err);
  }
});

router.post('/preview', async (req, res, next) => {
  try {
    const articles = getRecentArticles(100, 24);
    const flaggedIds = listFlaggedArticleIds();
    const result = await pushPreview(articles, flaggedIds);
    res.sendJson(0, 'Preview sent', result);
  } catch (err) {
    next(err);
  }
});

export default router;
