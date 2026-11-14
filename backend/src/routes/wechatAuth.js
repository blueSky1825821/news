import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../db.js';
import { findOrCreateWechatUser, findUserById, isWechatUser } from '../models/user.js';
import { getUserCategories } from '../models/userCategory.js';
import { generateToken } from '../middleware/auth.js';
import { platformBase, wechatCredentials, wechatJson, requireWechatCapability } from '../services/wechatConfig.js';

const router = Router();
const hash = (value) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('hex');
function browser(req) {
  const cookie = (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith('news-wx-browser='));
  return cookie?.slice('news-wx-browser='.length) || '';
}
export function safeReturnTo(value) {
  return typeof value === 'string' && /^\/(?:article\/\d+|push\/[a-f0-9]{32}|today)?$/.test(value) ? value : '/';
}
function invalid() {
  return Object.assign(new Error('微信登录已失效，请重新发起登录'), { statusCode: 400 });
}
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});
router.get('/status', (req, res) => {
  try {
    requireWechatCapability('oauthEnabled');
    wechatCredentials();
    const base = platformBase({ requireHttps: true });
    res.sendJson(0, 'success', { enabled: true, entryUrl: `${base}/api/wechat/auth/start` });
  } catch {
    res.sendJson(0, 'success', { enabled: false });
  }
});
router.get('/start', (req, res, next) => {
  try {
    requireWechatCapability('oauthEnabled');
    const { appId } = wechatCredentials();
    const base = platformBase({ requireHttps: true });
    const browserId = random();
    const state = random();
    const db = getDb();
    db.prepare('DELETE FROM wechat_oauth_flows WHERE expiresAt < ?').run(Date.now());
    db.prepare('DELETE FROM wechat_login_tickets WHERE expiresAt < ?').run(Date.now());
    db.prepare('INSERT INTO wechat_oauth_flows VALUES (?, ?, ?, ?)')
      .run(state, hash(browserId), safeReturnTo(req.query.returnTo), Date.now() + 300000);
    res.cookie('news-wx-browser', browserId, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600000, path: new URL(base).pathname || '/' });
    const params = new URLSearchParams({ appid: appId, redirect_uri: `${base}/api/wechat/auth/callback`, response_type: 'code', scope: 'snsapi_base', state });
    res.redirect(`https://open.weixin.qq.com/connect/oauth2/authorize?${params}#wechat_redirect`);
  } catch (err) { next(err); }
});
router.get('/callback', async (req, res, next) => {
  try {
    requireWechatCapability('oauthEnabled');
    const base = platformBase({ requireHttps: true });
    if (typeof req.query.state !== 'string' || typeof req.query.code !== 'string' || !browser(req)) throw invalid();
    const flow = getDb().prepare('DELETE FROM wechat_oauth_flows WHERE state = ? AND browserHash = ? AND expiresAt > ? RETURNING *')
      .get(req.query.state, hash(browser(req)), Date.now());
    if (!flow) throw invalid();
    const { appId, appSecret } = wechatCredentials();
    const params = new URLSearchParams({ appid: appId, secret: appSecret, code: req.query.code, grant_type: 'authorization_code' });
    const data = await wechatJson(`https://api.weixin.qq.com/sns/oauth2/access_token?${params}`);
    if (typeof data.openid !== 'string' || !data.openid) throw invalid();
    const user = findOrCreateWechatUser(appId, data.openid);
    const ticket = random();
    getDb().prepare('INSERT INTO wechat_login_tickets VALUES (?, ?, ?, ?, ?)')
      .run(hash(ticket), flow.browserHash, user.id, flow.returnTo, Date.now() + 60000);
    res.redirect(`${base}/wechat-login#ticket=${ticket}`);
  } catch (err) { next(err); }
});
router.post('/exchange', (req, res, next) => {
  try {
    requireWechatCapability('oauthEnabled');
    if (typeof req.body.ticket !== 'string' || !browser(req)) throw invalid();
    const ticket = getDb().prepare('DELETE FROM wechat_login_tickets WHERE ticketHash = ? AND browserHash = ? AND expiresAt > ? RETURNING *')
      .get(hash(req.body.ticket), hash(browser(req)), Date.now());
    if (!ticket) throw invalid();
    const user = findUserById(ticket.userId);
    if (!user || !isWechatUser(user.id)) throw invalid();
    res.sendJson(0, 'success', {
      user: { id: user.id, email: user.email, displayName: '微信用户', role: 'user', categories: getUserCategories(user.id) },
      token: generateToken({ userId: user.id }), returnTo: ticket.returnTo
    });
  } catch (err) { next(err); }
});
export default router;
