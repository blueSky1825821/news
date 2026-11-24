import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { chromium } from 'playwright';
import { getDb } from '../db.js';
import { getPush } from './wechat.js';

const origin = 'https://mp.weixin.qq.com';
const scanTimeout = 180_000;
const dialogs = '.weui-desktop-dialog:visible, [role="dialog"]:visible';
const qrImage = 'img[src*="qrcode"], img[src*="scanlogin"], canvas';
let activeJob;

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function visible(scope, selector) {
  return scope.locator(selector).filter({ visible: true }).first();
}

function button(scope, label) {
  return scope.locator('button, a, [role="button"], .weui-desktop-btn')
    .filter({ hasText: label, visible: true }).first();
}

function loginToken(page) {
  const url = new URL(page.url());
  return url.origin === origin && url.pathname === '/cgi-bin/home' && url.searchParams.get('token');
}

async function showQr(job, qr, status) {
  job.status = status;
  const loaded = await qr.evaluate(node => node.tagName !== 'IMG' || (node.complete && node.naturalWidth > 0),
    undefined, { timeout: 1500 }).catch(() => false);
  const screenshot = loaded && await qr.screenshot({ timeout: 1500, animations: 'disabled' }).catch(() => null);
  job.qr = screenshot ? `data:image/png;base64,${screenshot.toString('base64')}` : null;
}

async function login(page, context, job, sessionPath) {
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
  const qr = visible(page, `.login__type__container__scan__qrcode, .qrcode img, img.qrcode, img[src*="scanlogin"]`);
  const scanTab = page.getByText('扫码登录', { exact: true }).filter({ visible: true }).first();
  const expired = page.getByText(/二维码(?:已)?(?:失效|过期)/).filter({ visible: true }).first();
  const refresh = page.getByText(/^(点击刷新|刷新二维码|重新获取二维码)$/).filter({ visible: true }).first();
  let scanTabClicked = false;
  let refreshAt = 0;
  const deadline = Date.now() + scanTimeout;
  while (Date.now() < deadline) {
    if (new URL(page.url()).origin !== origin) throw new Error('微信登录页地址已变化。');
    const token = loginToken(page);
    if (token) {
      job.qr = null;
      job.message = null;
      job.status = 'preparing';
      const temporary = `${sessionPath}.tmp`;
      await writeFile(temporary, JSON.stringify(await context.storageState({ indexedDB: true })), { mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, sessionPath);
      return token;
    }
    if (!scanTabClicked && await scanTab.isVisible() && !await qr.isVisible()) {
      await scanTab.click();
      scanTabClicked = true;
    }
    if (await expired.isVisible()) {
      job.status = 'login_scan';
      job.qr = null;
      job.message = '登录二维码已过期，正在获取新二维码…';
      if (Date.now() >= refreshAt) {
        refreshAt = Date.now() + 5000;
        if (await refresh.isVisible()) await refresh.click({ timeout: 1500 }).catch(() => {});
        else await page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => {});
        scanTabClicked = false;
      }
    } else if (await qr.isVisible()) {
      job.message = null;
      await showQr(job, qr, 'login_scan');
    } else if (job.status === 'login_scan') {
      job.qr = null;
      job.message = '正在等待微信确认登录，请在手机上查看扫码结果。';
    }
    await pause(1600);
  }
  return null;
}

async function makeCover(context, title) {
  const cover = await context.newPage();
  try {
    await cover.setViewportSize({ width: 900, height: 500 });
    await cover.setContent('<body style="margin:0;background:#153552;color:white;font:600 46px/1.5 sans-serif;display:grid;align-content:center;padding:80px"><div style="font-size:26px;color:#b5d4ef">新闻简报</div><div id="headline"></div></body>');
    await cover.locator('#headline').evaluate((node, value) => { node.textContent = value; }, title);
    return await cover.screenshot({ timeout: 8000 });
  } finally {
    await cover.close();
  }
}

async function prepareArticle(context, page, push, token) {
  const query = new URLSearchParams({ t: 'media/appmsg_edit_v2', action: 'edit', isNew: '1', type: '10', lang: 'zh_CN', token });
  await page.goto(`${origin}/cgi-bin/appmsg?${query}`, { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).origin !== origin) throw new Error('微信编辑器地址已变化。');
  const title = Array.from(push.title.trim()).slice(0, 64).join('');
  const titleField = visible(page, 'textarea#title, .title-editor__input [contenteditable="true"], #js_title_main [contenteditable="true"]');
  await titleField.fill(title);
  const body = push.articles.map(({ title }, i) => push.articles.length === 1 ? title : `${i + 1}. ${title}`).join('\n');
  const editor = visible(page, '#ueditor_0 .ProseMirror, .rich_media_content.ProseMirror, #js_ueditor .ProseMirror, iframe[id^="ueditor"]');
  const field = await editor.evaluate(node => node.tagName) === 'IFRAME'
    ? editor.contentFrame().locator('body[contenteditable="true"]')
    : editor;
  await field.click();
  for (const [index, line] of body.split('\n').entries()) {
    if (index) await page.keyboard.press('Enter');
    await page.keyboard.insertText(line);
  }

  const cover = await makeCover(context, title);
  await field.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.locator('input[type="file"][accept*="image"], input[type="file"]:not([accept])').first()
    .setInputFiles({ name: '新闻简报.png', mimeType: 'image/png', buffer: cover });
  await visible(page, '.js_cover_btn_area').click();
  await visible(page, 'a.js_selectCoverFromContent').click();
  const dialog = page.locator(dialogs).filter({ hasText: /选择图片|编辑封面/ }).first();
  await visible(dialog, '.appmsg_content_img_item, .appmsg_content_img.cover').click();
  await button(dialog, /^\s*下一步\s*$/).click();
  await button(dialog, /^\s*(确认|完成)\s*$/).click();
  await visible(page, '.js_cover_preview_new, .js_cover_preview_square').waitFor();
}

async function publish(page, job, id) {
  if (new URL(page.url()).origin !== origin) throw new Error('微信编辑器地址已变化。');
  const publishButton = button(page, /^\s*发表\s*$/);
  await publishButton.click({ trial: true });
  const db = getDb();
  // Once the first publish click is attempted, never automatically submit again.
  const claim = db.prepare("INSERT OR IGNORE INTO wechat_publications (pushId, status) VALUES (?, 'unknown')").run(id);
  if (!claim.changes) throw new Error('该选稿已经提交，请到微信公众平台核对结果。');
  job.status = 'publishing';
  await publishButton.click();
  const confirmation = page.locator(dialogs).filter({ hasText: /确认发表|继续发表|发表后/ }).first();
  const confirm = button(confirmation, /^\s*(继续发表|确认发表|发表)\s*$/);
  const continuePublish = button(page, /^\s*继续发表\s*$/);
  const verification = page.locator(dialogs).filter({ hasText: /扫码|扫一扫|微信验证|身份验证/ });
  const qr = visible(verification, `.qrcode img, img.qrcode, ${qrImage}`);
  const frameQr = visible(verification.locator('iframe').first().contentFrame(), `img, ${qrImage}`);
  const success = page.getByText(/^(发表成功|已发表成功|内容发表成功|文章发表成功)(?:[！!。，,].*)?$/).filter({ visible: true }).first();
  let confirmed = false;
  const deadline = Date.now() + scanTimeout;
  while (Date.now() < deadline) {
    if (new URL(page.url()).origin !== origin) throw new Error('微信发表页地址已变化。');
    if (await success.isVisible()) {
      db.prepare("UPDATE wechat_publications SET status = 'published' WHERE pushId = ?").run(id);
      return;
    }
    if (await qr.isVisible()) {
      await showQr(job, qr, 'publish_scan');
    } else if (await frameQr.isVisible()) {
      await showQr(job, frameQr, 'publish_scan');
    } else {
      job.qr = null;
      job.status = 'publishing';
      if (!confirmed && await confirm.isVisible()) {
        await confirm.click();
        confirmed = true;
      } else if (!confirmed && await continuePublish.isVisible()) {
        await continuePublish.click();
        confirmed = true;
      }
    }
    await pause(650);
  }
  throw new Error('微信未显示发表成功，请到微信公众平台核对。');
}

async function runPublication(job, push, userId) {
  let browser;
  let failure = '无法启动发表浏览器。请检查服务器上的 Chromium 安装。';
  try {
    const systemChrome = '/usr/bin/google-chrome';
    const executablePath = process.env.WECHAT_BROWSER_EXECUTABLE || (existsSync(systemChrome) ? systemChrome : undefined);
    browser = await chromium.launch({ executablePath, chromiumSandbox: true });
    failure = '无法读取或保存登录会话，或微信登录页暂时不可用。';
    const dir = join(dirname(getDb().location() || ''), 'wechat-browser');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);
    const sessionPath = join(dir, `admin-${userId}.json`);
    const saved = await readFile(sessionPath, 'utf8').catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return undefined;
    });
    let storageState;
    try {
      const parsed = saved && JSON.parse(saved);
      if (Array.isArray(parsed?.cookies) && Array.isArray(parsed?.origins)) storageState = parsed;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
    const context = await browser.newContext({ storageState });
    context.setDefaultTimeout(12_000);
    const page = await context.newPage();
    const token = await login(page, context, job, sessionPath);
    if (!token) {
      failure = '登录等待超时，请重新发起发表并扫码确认。';
      throw new Error(failure);
    }
    failure = '微信图文编辑器未能填入标题、正文或封面，请核对账号的图文发表权限。';
    await prepareArticle(context, page, push, token);
    failure = '未能确认发表结果，请到微信公众平台核对。';
    await publish(page, job, push.id);
    job.qr = null;
    job.status = 'published';
  } catch {
    const stored = getDb().prepare('SELECT status FROM wechat_publications WHERE pushId = ?').get(push.id);
    job.status = stored?.status || 'failed';
    job.message = job.status === 'unknown' ? '发表结果待核对，请到微信公众平台检查发表记录。同一选稿已锁定。'
      : failure;
    job.qr = null;
  } finally {
    await browser?.close().catch(() => {});
    job.finished = true;
  }
}

export function getPublicationStatus(id, userId) {
  if (activeJob?.id === id && activeJob.userId === userId) {
    const { status, qr, message } = activeJob;
    return { status, qr, message };
  }
  const stored = getDb().prepare('SELECT status FROM wechat_publications WHERE pushId = ?').get(id);
  return { status: stored?.status || 'idle' };
}

export function startPublication(id, userId) {
  const push = getPush(id);
  if (!push) throw httpError('新闻列表不存在', 404);
  if (activeJob && !activeJob.finished) {
    if (activeJob.id === id && activeJob.userId === userId) return getPublicationStatus(id, userId);
    throw httpError('已有发表任务正在进行，请稍候。', 409);
  }
  const current = getPublicationStatus(id, userId);
  if (['published', 'unknown'].includes(current.status)) return current;
  activeJob = { id, userId, status: 'starting', qr: null, finished: false };
  void runPublication(activeJob, push, userId);
  return getPublicationStatus(id, userId);
}
