import { Router } from 'express';
import cron from 'node-cron';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { platformBase, wechatCapabilities, requireWechatCapability } from '../services/wechatConfig.js';
import { listPushLogs } from '../models/wechatPushLog.js';
import { getDb } from '../db.js';
import { startSummaryPushScheduler, stopSummaryPushScheduler } from '../services/scheduler.js';
import { getWechatSettings, setWechatSettings } from '../models/wechatSettings.js';
import { flagArticle, unflagArticle, isFlagged, listFlaggedArticleIds } from '../models/articleFlag.js';
import { getRecentArticles, getArticleById } from '../models/article.js';
import { pushPreview, generatePreviewContent, createPush, getPush, sendPush } from '../services/wechat.js';
import wechatAuth from './wechatAuth.js';

const router = Router();
router.use('/auth', wechatAuth);

router.get('/pushes/:id', (req, res, next) => {
  try {
    const push = getPush(req.params.id);
    if (!push) throw Object.assign(new Error('新闻列表不存在'), { statusCode: 404 });
    res.sendJson(0, 'success', { id: push.id, title: push.title, articles: push.articles, createdAt: push.createdAt });
  } catch (err) { next(err); }
});

router.use(authMiddleware, adminMiddleware);

function publicSettings() {
  const settings = getWechatSettings();
  const { appSecret, accessToken, tokenExpiresAt, ...safe } = settings || {};
  let base = '';
  try { base = platformBase(); } catch { /* configuration is displayed as missing */ }
  const capabilities = wechatCapabilities();
  return { ...safe, ...capabilities, appSecretConfigured: !!appSecret, platformUrl: base,
    entryUrl: base ? (capabilities.oauthEnabled ? `${base}/api/wechat/auth/start` : base) : '' };
}

router.get('/logs', (req, res) => res.sendJson(0, 'success', { logs: listPushLogs() }));

router.post('/pushes', (req, res, next) => {
  try {
    const { articleIds } = req.body;
    if (!Array.isArray(articleIds) || !articleIds.length || articleIds.length > 100 || articleIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      throw Object.assign(new Error('请选择 1 至 100 篇有效新闻'), { statusCode: 400 });
    }
    const articles = [...new Set(articleIds)].map(getArticleById);
    if (articles.some((article) => !article)) throw Object.assign(new Error('部分新闻已不存在，请刷新后重试'), { statusCode: 404 });
    res.sendJson(0, 'success', createPush(articles));
  } catch (err) { next(err); }
});

router.post('/pushes/:id/send', async (req, res, next) => {
  try {
    const preview = req.body.preview === true;
    if (!preview && req.body.confirm !== true) throw Object.assign(new Error('请确认向全部关注者群发'), { statusCode: 400 });
    res.sendJson(0, '微信已受理，最终送达以微信结果为准', await sendPush(req.params.id, preview));
  } catch (err) { next(err); }
});

router.get('/settings', (req, res, next) => {
  try {
    const settings = publicSettings();
    res.sendJson(0, 'success', settings);
  } catch (err) {
    next(err);
  }
});

router.put('/settings', (req, res, next) => {
  try {
    const { appId, appSecret, previewOpenId, summaryPushEnabled, summaryPushCron } = req.body;
    for (const value of [appId, appSecret, previewOpenId]) {
      if (value !== undefined && (typeof value !== 'string' || value.length > 256)) throw Object.assign(new Error('公众号配置格式不正确'), { statusCode: 400 });
    }
    if (summaryPushEnabled !== undefined && typeof summaryPushEnabled !== 'boolean') throw Object.assign(new Error('推送开关格式不正确'), { statusCode: 400 });
    if (summaryPushEnabled) requireWechatCapability('massSendEnabled');
    if (summaryPushCron !== undefined && (typeof summaryPushCron !== 'string' || summaryPushCron.trim().split(/\s+/).length !== 5 || !cron.validate(summaryPushCron))) {
      throw Object.assign(new Error('请输入有效的五段 Cron 表达式'), { statusCode: 400 });
    }
    const old = getWechatSettings();
    const secret = appSecret?.trim() || undefined;
    const changingApp = old && appId !== undefined && old.appId !== appId.trim();
    if (changingApp && !secret) throw Object.assign(new Error('更换 AppID 时请同时填写 AppSecret'), { statusCode: 400 });
    setWechatSettings({ appId: appId?.trim(), appSecret: secret, previewOpenId: previewOpenId?.trim(), summaryPushEnabled, summaryPushCron });
    if (changingApp || secret) getDb().prepare('UPDATE wechat_settings SET accessToken = NULL, tokenExpiresAt = NULL WHERE id = 1').run();
    stopSummaryPushScheduler();
    startSummaryPushScheduler();
    res.sendJson(0, 'Settings saved', publicSettings());
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
