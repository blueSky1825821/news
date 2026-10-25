import { getWechatSettings, setWechatSettings } from '../models/wechatSettings.js';
import { logPush } from '../models/wechatPushLog.js';

const WECHAT_API_BASE = 'https://api.weixin.qq.com/cgi-bin';

export async function fetchAccessToken() {
  const settings = getWechatSettings();
  if (!settings || !settings.appId || !settings.appSecret) {
    throw new Error('WeChat appId or appSecret not configured');
  }

  // Check cache
  if (settings.accessToken && settings.tokenExpiresAt) {
    const expiresAt = new Date(settings.tokenExpiresAt).getTime();
    if (Date.now() < expiresAt - 5 * 60 * 1000) { // 5 min buffer
      return settings.accessToken;
    }
  }

  // Fetch new token
  const url = `${WECHAT_API_BASE}/token?grant_type=client_credential&appid=${encodeURIComponent(settings.appId)}&secret=${encodeURIComponent(settings.appSecret)}`;
  const res = await fetch(url, { timeout: 10000 });
  const data = await res.json();

  if (data.errcode) {
    throw new Error(`WeChat API error: ${data.errcode} ${data.errmsg}`);
  }

  const accessToken = data.access_token;
  const expiresIn = data.expires_in || 7200;
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  setWechatSettings({ accessToken, tokenExpiresAt });
  return accessToken;
}

export async function pushSummary(articles, flaggedIds = []) {
  const token = await fetchAccessToken();

  if (!articles || articles.length === 0) {
    return { status: 'skipped', reason: 'No articles to push' };
  }

  // Sort flagged articles first
  const sorted = [...articles].sort((a, b) => {
    const aFlagged = flaggedIds.includes(a.id) ? 1 : 0;
    const bFlagged = flaggedIds.includes(b.id) ? 1 : 0;
    return bFlagged - aFlagged;
  });

  const dateStr = new Date().toLocaleDateString('zh-CN');
  const title = `📰 每日新闻播报 | ${dateStr}（共 ${sorted.length} 篇）`;

  // Build content as text list with links
  const contentLines = sorted.map((article, idx) => {
    const flag = flaggedIds.includes(article.id) ? '🔥 ' : '';
    return `${idx + 1}. ${flag}${article.title}`;
  });
  const content = contentLines.join('\n');

  const message = {
    filter: { is_to_all: true },
    mpnews: {
      articles: [
        {
          title,
          thumb_media_id: '', // We skip image for simplicity
          author: '新闻播报',
          content: content.replace(/\n/g, '<br>'),
          content_source_url: '',
          digest: contentLines.slice(0, 3).join('\n'),
          show_cover_pic: 0
        }
      ]
    },
    msgtype: 'mpnews'
  };

  const url = `${WECHAT_API_BASE}/message/mass/sendall?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  const data = await res.json();

  if (data.errcode && data.errcode !== 0) {
    logPush({ pushType: 'summary', status: 'failed', errorMessage: `${data.errcode}: ${data.errmsg}` });
    throw new Error(`WeChat mass send failed: ${data.errcode} ${data.errmsg}`);
  }

  logPush({ pushType: 'summary', status: 'success', wxMessageId: String(data.msg_id) });
  return { status: 'success', msgId: data.msg_id };
}

export function generatePreviewContent(articles, flaggedIds = []) {
  if (!articles || articles.length === 0) {
    return { status: 'skipped', reason: 'No articles to push' };
  }

  // Sort flagged articles first
  const sorted = [...articles].sort((a, b) => {
    const aFlagged = flaggedIds.includes(a.id) ? 1 : 0;
    const bFlagged = flaggedIds.includes(b.id) ? 1 : 0;
    return bFlagged - aFlagged;
  });

  const topArticles = sorted.slice(0, 10);
  const dateStr = new Date().toLocaleDateString('zh-CN');
  const title = `📰 每日新闻播报 | ${dateStr}（共 ${sorted.length} 篇）`;

  // Build HTML content with article list
  const contentLines = topArticles.map((article, idx) => {
    const flag = flaggedIds.includes(article.id) ? '🔥 ' : '';
    const link = article.originalUrl || '#';
    return `<p>${idx + 1}. ${flag}<a href="${link}">${article.title}</a></p>`;
  });

  const moreLink = sorted.length > 10
    ? '<p style="margin-top:16px"><a href="/today">👉 点击查看更多</a></p>'
    : '';

  const htmlContent = `
    <h2>${title}</h2>
    <p>为您精选今日重要新闻：</p>
    ${contentLines.join('')}
    ${moreLink}
    <p style="margin-top:16px;color:#999;font-size:12px">由 AI 新闻播报系统自动生成</p>
  `;

  const digestLines = topArticles.slice(0, 3).map((a, i) => `${i + 1}. ${a.title}`);

  return {
    title,
    htmlContent,
    digest: digestLines.join('\n'),
    topArticles,
    totalCount: sorted.length,
    pushedCount: topArticles.length
  };
}

export async function pushPreview(articles, flaggedIds = []) {
  const settings = getWechatSettings();
  if (!settings || !settings.previewOpenId) {
    throw new Error('Preview OpenID not configured');
  }

  const preview = generatePreviewContent(articles, flaggedIds);
  if (preview.status === 'skipped') {
    return preview;
  }

  const token = await fetchAccessToken();

  const message = {
    touser: settings.previewOpenId,
    mpnews: {
      articles: [
        {
          title: preview.title,
          thumb_media_id: '',
          author: '新闻播报',
          content: preview.htmlContent,
          content_source_url: '',
          digest: preview.digest,
          show_cover_pic: 0
        }
      ]
    },
    msgtype: 'mpnews'
  };

  const url = `${WECHAT_API_BASE}/message/mass/preview?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message)
  });
  const data = await res.json();

  if (data.errcode && data.errcode !== 0) {
    logPush({ pushType: 'preview', status: 'failed', errorMessage: `${data.errcode}: ${data.errmsg}` });
    throw new Error(`WeChat preview failed: ${data.errcode} ${data.errmsg}`);
  }

  logPush({ pushType: 'preview', status: 'success', wxMessageId: String(data.msg_id) });
  return { status: 'success', msgId: data.msg_id, pushedCount: preview.pushedCount, totalCount: preview.totalCount };
}
