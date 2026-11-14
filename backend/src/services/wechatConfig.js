import { getWechatSettings } from '../models/wechatSettings.js';

export function platformBase({ requireHttps = false } = {}) {
  const value = process.env.PUBLIC_BASE_URL;
  if (!value) throw Object.assign(new Error('请先配置 PUBLIC_BASE_URL，例如 https://news.example.com/news'), { statusCode: 503 });
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || (requireHttps && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) {
    throw Object.assign(new Error(requireHttps ? '微信登录需要 HTTPS 平台地址' : 'PUBLIC_BASE_URL 必须为不带查询参数的 HTTP 或 HTTPS 平台地址'), { statusCode: 503 });
  }
  return url.href.replace(/\/$/, '');
}

export function wechatCapabilities() {
  return {
    oauthEnabled: process.env.WECHAT_OAUTH_ENABLED === 'true',
    massSendEnabled: process.env.WECHAT_MASS_SEND_ENABLED === 'true'
  };
}

export function requireWechatCapability(name) {
  if (!wechatCapabilities()[name]) throw Object.assign(new Error(name === 'oauthEnabled'
    ? '当前公众号未启用网页授权权限，请直接浏览新闻或使用邮箱登录'
    : '当前公众号未启用群发接口权限，请复制推送内容到微信公众平台手动发布'), { statusCode: 403 });
}

export function wechatCredentials() {
  const settings = getWechatSettings();
  if (!settings?.appId || !settings?.appSecret) {
    throw Object.assign(new Error('请先配置公众号 AppID 和 AppSecret'), { statusCode: 503 });
  }
  return settings;
}

export async function wechatJson(url, options = {}) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw Object.assign(new Error('微信接口暂时不可用'), { statusCode: 502 });
  const data = await res.json();
  if (data.errcode) throw Object.assign(new Error(`微信接口错误 ${data.errcode}: ${data.errmsg || ''}`), { statusCode: 502 });
  return data;
}
