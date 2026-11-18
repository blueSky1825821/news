import { randomBytes } from 'node:crypto';
import { getDb } from '../db.js';
import { getWechatSettings, setWechatSettings } from '../models/wechatSettings.js';
import { logPush } from '../models/wechatPushLog.js';
import { platformBase, wechatCredentials, wechatJson, requireWechatCapability } from './wechatConfig.js';

const API = 'https://api.weixin.qq.com/cgi-bin';
export async function fetchAccessToken() {
  const settings = wechatCredentials();
  if (settings.accessToken && Date.now() < new Date(settings.tokenExpiresAt).getTime() - 300000) return settings.accessToken;
  const params = new URLSearchParams({ grant_type: 'client_credential', appid: settings.appId, secret: settings.appSecret });
  const data = await wechatJson(`${API}/token?${params}`);
  if (!data.access_token) throw new Error('微信未返回 access_token');
  setWechatSettings({ accessToken: data.access_token, tokenExpiresAt: new Date(Date.now() + (data.expires_in || 7200) * 1000).toISOString() });
  return data.access_token;
}

function sortedArticles(articles, flaggedIds) {
  return [...articles].sort((a, b) => Number(flaggedIds.includes(b.id)) - Number(flaggedIds.includes(a.id)));
}

export function generatePreviewContent(articles, flaggedIds = []) {
  if (!articles?.length) return { status: 'skipped', reason: '没有可推送的新闻' };
  const sorted = sortedArticles(articles, flaggedIds);
  const title = sorted.length === 1 ? sorted[0].title : `新闻列表（${sorted.length} 篇）`;
  return { title, digest: sorted.slice(0, 3).map((a) => a.title).join('\n'), topArticles: sorted,
    totalCount: sorted.length, pushedCount: sorted.length };
}

export function getPush(id) {
  const row = getDb().prepare('SELECT * FROM news_pushes WHERE id = ?').get(id);
  return row ? { ...row, articles: JSON.parse(row.articles) } : null;
}

function composeMessage(title, articles, url) {
  const lines = articles.slice(0, 8).map((a, i) => `${i + 1}. ${Array.from(a.title).slice(0, 48).join('')}`);
  const heading = Array.from(title).slice(0, 64).join('');
  const compose = () => `${heading}\n${lines.join('\n')}\n\n查看完整新闻：\n${url}`;
  while (Buffer.byteLength(compose(), 'utf8') > 1900 && lines.length > 1) lines.pop();
  const content = compose();
  if (Buffer.byteLength(content, 'utf8') > 2048) throw Object.assign(new Error('推送内容过长'), { statusCode: 400 });
  return content;
}

export function createPush(articles, flaggedIds = []) {
  if (!articles?.length) throw Object.assign(new Error('请选择新闻'), { statusCode: 400 });
  const sorted = sortedArticles(articles, flaggedIds);
  const preview = generatePreviewContent(sorted);
  const id = randomBytes(16).toString('hex');
  const base = platformBase();
  const url = `${base}/push/${id}`;
  // Store a fixed snapshot so previously sent lists do not change with later crawls.
  const snapshot = sorted.map(({ id, title, summary, sourceName, publishedAt, originalUrl }) => ({ id, title, summary, sourceName, publishedAt, originalUrl }));
  const text = composeMessage(preview.title, snapshot, url);
  const { createdAt } = getDb().prepare(
    'INSERT INTO news_pushes (id, title, articles) VALUES (?, ?, ?) RETURNING createdAt'
  ).get(id, preview.title, JSON.stringify(snapshot));
  return { id, url, text, createdAt, ...preview };
}

export async function sendPush(id, preview = false) {
  requireWechatCapability('massSendEnabled');
  const push = getPush(id);
  if (!push) throw Object.assign(new Error('推送不存在'), { statusCode: 404 });
  // Reconstruct the message from the saved snapshot, without creating a new list.
  const url = `${platformBase()}/push/${id}`;
  const content = composeMessage(push.title, push.articles, url);
  const openId = getWechatSettings()?.previewOpenId;
  if (preview && !openId) throw Object.assign(new Error('请先配置预览目标 OpenID'), { statusCode: 400 });
  // Claim before any network operation: a timeout must never cause an accidental second mass send.
  if (!preview) {
    const claim = getDb().prepare("UPDATE news_pushes SET status = 'sending' WHERE id = ? AND status = 'draft'").run(id);
    if (!claim.changes) throw Object.assign(new Error('该推送已提交或结果待确认，请勿重复群发'), { statusCode: 409 });
  }
  const pushType = preview ? 'preview' : 'manual';
  try {
    const token = await fetchAccessToken();
    const message = { ...(preview ? { touser: openId } : { filter: { is_to_all: true } }), msgtype: 'text', text: { content } };
    const result = await wechatJson(`${API}/message/mass/${preview ? 'preview' : 'sendall'}?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(message)
    });
    if (result.errcode !== 0 || result.msg_id == null) throw new Error('微信未返回有效的发送受理结果');
    if (!preview) getDb().prepare("UPDATE news_pushes SET status = 'submitted' WHERE id = ?").run(id);
    logPush({ articleId: push.articles.length === 1 ? push.articles[0].id : null, pushType, status: 'submitted', wxMessageId: String(result.msg_id) });
    return { status: 'submitted', msgId: result.msg_id, totalCount: push.articles.length, pushedCount: push.articles.length, url };
  } catch (err) {
    if (!preview) getDb().prepare("UPDATE news_pushes SET status = 'unknown' WHERE id = ?").run(id);
    logPush({ pushType, status: 'failed', errorMessage: err.message });
    throw err;
  }
}

export async function pushSummary(articles, flaggedIds = []) {
  if (!articles?.length) return { status: 'skipped', reason: 'No articles to push' };
  const push = createPush(articles, flaggedIds);
  return sendPush(push.id);
}

export async function pushPreview(articles, flaggedIds = []) {
  if (!articles?.length) return { status: 'skipped', reason: 'No articles to push' };
  const push = createPush(articles, flaggedIds);
  return sendPush(push.id, true);
}
