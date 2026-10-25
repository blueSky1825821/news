import { getDb } from '../db.js';

export function getWechatSettings() {
  const db = getDb();
  return db.prepare('SELECT * FROM wechat_settings WHERE id = 1').get() || null;
}

export function setWechatSettings({ appId, appSecret, accessToken, tokenExpiresAt, previewOpenId, summaryPushEnabled, summaryPushCron }) {
  const db = getDb();
  const existing = getWechatSettings();
  const values = [appId, appSecret, accessToken, tokenExpiresAt, previewOpenId, summaryPushEnabled, summaryPushCron].map(v => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v;
  });
  if (existing) {
    const stmt = db.prepare(`
      UPDATE wechat_settings SET
        appId = COALESCE(?, appId),
        appSecret = COALESCE(?, appSecret),
        accessToken = COALESCE(?, accessToken),
        tokenExpiresAt = COALESCE(?, tokenExpiresAt),
        previewOpenId = COALESCE(?, previewOpenId),
        summaryPushEnabled = COALESCE(?, summaryPushEnabled),
        summaryPushCron = COALESCE(?, summaryPushCron),
        updatedAt = CURRENT_TIMESTAMP
      WHERE id = 1
    `);
    stmt.run(...values);
  } else {
    const stmt = db.prepare(`
      INSERT INTO wechat_settings (id, appId, appSecret, accessToken, tokenExpiresAt, previewOpenId, summaryPushEnabled, summaryPushCron)
      VALUES (1, ?, ?, ?, ?, ?, COALESCE(?, 1), COALESCE(?, '0 8 * * *'))
    `);
    stmt.run(...values);
  }
  return getWechatSettings();
}