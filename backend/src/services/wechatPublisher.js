import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { formatHeadlineLines, moreNewsText, moreNewsUrl } from '../../../shared/wechatPublication.js';
import { getDb } from '../db.js';
import { getPush } from './wechat.js';
import { launchWechatBrowser } from './wechatBrowser.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('wechatPublisher');

const origin = 'https://mp.weixin.qq.com';
const scanTimeout = 180_000;
const qrCaptureInterval = 4000;
const dialogs = '.weui-desktop-dialog:visible, [role="dialog"]:visible';
const qrImage = 'img[src*="qrcode"], img[src*="scanlogin"], canvas';
const newsSourceLabel = /^素材来源\s*官方媒体\s*[\/／]\s*网络新闻$/;
let activeJob;
let lastLogin;

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

function operationLog(job, event, fields = {}, level = 'info') {
  logger[level](event, {
    jobId: job.logId, pushId: job.id, userId: job.userId,
    operation: job.id == null ? 'login' : 'publication', ...fields
  });
}

async function showQr(job, qr, status) {
  if (job.status !== status) job.qr = null;
  job.status = status;
  if (job.qr && Date.now() - job.qrCapturedAt < qrCaptureInterval) return;

  const loaded = await qr.evaluate(node => node.tagName !== 'IMG' || (node.complete && node.naturalWidth > 0),
    undefined, { timeout: 1500 }).catch(() => false);
  const screenshot = loaded && await qr.screenshot({ timeout: 1500, animations: 'disabled' }).catch(() => null);
  if (!screenshot) return;
  job.qrCapturedAt = Date.now();
  if (!job.qr) operationLog(job, 'qr.available', { status });
  job.qr = `data:image/png;base64,${screenshot.toString('base64')}`;
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
      const temporary = `${sessionPath}.tmp`;
      await writeFile(temporary, JSON.stringify(await context.storageState({ indexedDB: true })), { mode: 0o600 });
      await chmod(temporary, 0o600);
      await rename(temporary, sessionPath);
      return token;
    }
    if (!scanTabClicked && await scanTab.isVisible() && !await qr.isVisible()) {
      await scanTab.click();
      scanTabClicked = true;
      operationLog(job, 'login.scan_tab_selected');
    }
    if (await expired.isVisible()) {
      job.status = 'login_scan';
      job.qr = null;
      job.message = '登录二维码已过期，正在获取新二维码…';
      if (Date.now() >= refreshAt) {
        refreshAt = Date.now() + 5000;
        operationLog(job, 'login.qr_refresh');
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

async function prepareArticle(page, push, token, broadcast, beginStep) {
  beginStep('editor_navigation', '未能打开微信图文编辑器，请在微信公众平台检查是否可以新建图文。');
  const query = new URLSearchParams({ t: 'media/appmsg_edit_v2', action: 'edit', isNew: '1', type: '10', lang: 'zh_CN', token });
  await page.goto(`${origin}/cgi-bin/appmsg?${query}`, { waitUntil: 'domcontentloaded' });
  if (new URL(page.url()).origin !== origin) throw new Error('微信编辑器地址已变化。');
  if (['/', '/cgi-bin/home'].includes(new URL(page.url()).pathname)) {
    throw new Error('微信返回了登录页或公众号首页。');
  }
  const title = Array.from(push.title.trim()).slice(0, 64).join('');
  beginStep('editor_title', '未能填写微信图文标题，请检查微信公众平台是否能正常打开图文编辑器。');
  const titleField = visible(page, [
    'textarea#title', 'input#title', '#title[contenteditable="true"]',
    '.title-editor__input[contenteditable="true"]', '.title-editor__input [contenteditable="true"]',
    '#js_title_main textarea', '#js_title_main input', '#js_title_main [contenteditable="true"]',
    'textarea[placeholder*="标题"]', 'input[placeholder*="标题"]',
    '[contenteditable="true"][data-placeholder*="标题"]'
  ].join(', '));
  await titleField.fill(title);
  const filledTitle = await titleField.evaluate(node => node.value ?? node.textContent);
  if (filledTitle.trim() !== title) throw new Error('微信图文标题校验失败。');
  beginStep('editor_body', '未能填写微信图文正文，请检查微信图文编辑器的正文输入区。');
  const summary = broadcast?.summary?.trim();
  const lines = summary ? summary.split(/\r?\n/) : formatHeadlineLines(push.articles);
  const editor = visible(page, [
    '#ueditor_0 .ProseMirror[contenteditable="true"]',
    '.rich_media_content.ProseMirror[contenteditable="true"]',
    '#js_ueditor .ProseMirror[contenteditable="true"]',
    '#js_ueditor [contenteditable="true"][role="textbox"]',
    'iframe[id^="ueditor"]'
  ].join(', '));
  const field = await editor.evaluate(node => node.tagName) === 'IFRAME'
    ? editor.contentFrame().locator('body[contenteditable="true"]')
    : editor;
  await field.click();
  for (const [index, line] of lines.entries()) {
    if (index) await page.keyboard.press('Enter');
    await page.keyboard.insertText(line);
  }
  await page.keyboard.press('Enter');
  const inserted = await field.evaluate((element, { text, url }) => {
    const link = element.ownerDocument.createElement('a');
    link.href = url;
    link.textContent = text;
    element.ownerDocument.execCommand('insertHTML', false, link.outerHTML);
    return element.textContent.includes(text);
  }, { text: moreNewsText, url: moreNewsUrl });
  if (!inserted) await page.keyboard.insertText(moreNewsText);

  const bodyText = await field.innerText();
  const normalizedBody = bodyText.replace(/\s+/g, ' ').trim();
  const expectedBody = [...lines, moreNewsText].join(' ').replace(/\s+/g, ' ').trim();
  if (!normalizedBody.includes(expectedBody)) throw new Error('微信图文正文校验失败。');
}

async function generateCover(page, beginStep) {

  beginStep('cover_selection', '未能打开微信图文的封面选择菜单。');
  const coverArea = page.getByText('拖拽或选择封面', { exact: true }).filter({ visible: true }).first();
  await coverArea.or(visible(page, '.js_cover_btn_area')).first().click();

  beginStep('cover_generation', '未能通过微信图文编辑器的一键生成封面功能设置封面。');
  const generate = page.getByText('一键生成封面', { exact: true }).filter({ visible: true }).first();
  await generate.click();

  beginStep('cover_confirmation', '微信已收到生成封面的操作，但未能确认封面预览。');

  const preview = visible(page, '.js_cover_preview_new, .js_cover_preview_square');
  const coverDialog = page.locator(dialogs).filter({ hasText: /生成封面|编辑封面|设置封面/ }).first();
  const confirm = button(coverDialog, /^\s*(确定|确认|完成|使用封面)\s*$/);
  await preview.or(confirm).first().waitFor();
  if (await confirm.isVisible()) await confirm.click();
  await preview.waitFor();
}

async function setNewsSource(page) {
  const option = page.getByText(newsSourceLabel).filter({ visible: true }).first();
  if (!await option.isVisible()) {
    await page.getByText(/^(选择声明类型|创作来源|添加声明)$/)
      .filter({ visible: true }).first().click();
  }
  const dialog = page.locator(dialogs).filter({ hasText: /声明类型|创作来源|素材来源/ }).first();
  const source = dialog.getByText(newsSourceLabel).filter({ visible: true }).first();
  await option.waitFor();
  if (await source.isVisible()) {
    await source.click();
    await button(dialog, /^\s*(确定|确认|完成|保存)\s*$/).click();
    await dialog.waitFor({ state: 'hidden' });
  } else {
    await option.click();
  }
  await option.waitFor();
}

async function markOriginal(page) {
  const declared = page.getByText(/^已声明原创$|^已声明$/).filter({ visible: true }).first();
  const declaredArea = visible(page, '#js_original_open');
  if (await declared.isVisible() || await declaredArea.isVisible()) return;

  const toggle = visible(page, '.js_edit_ori').or(
    page.getByText(/^(标记为原创|声明原创)$/).filter({ visible: true }).first()
  ).first();
  await toggle.click();
  const dialog = page.locator(dialogs).filter({ hasText: /原创/ }).first();
  const editDeclaration = page.getByText('编辑声明', { exact: true }).filter({ visible: true }).first();
  await dialog.or(editDeclaration).first().waitFor();
  if (!await dialog.isVisible()) await editDeclaration.click();
  const author = visible(dialog, 'input.js_author, input[placeholder*="作者"]');
  await author.fill('七巧板小栈');
  const agreement = dialog.locator('label, .weui-desktop-form__checkbox-wrp')
    .filter({ hasText: /我已阅读|我同意/ }).filter({ visible: true }).first();
  if (await agreement.isVisible()) {
    const checkbox = agreement.locator('input[type="checkbox"]').first();
    if (!await checkbox.count() || !await checkbox.isChecked()) await agreement.click();
  }
  await button(dialog, /^\s*(确定|确认|完成|声明原创)\s*$/).click();
  await dialog.waitFor({ state: 'hidden' });
  await declared.or(declaredArea).first().waitFor();
}

async function publish(page, job, id, beginStep) {
  if (new URL(page.url()).origin !== origin) throw new Error('微信编辑器地址已变化。');
  const publishButton = button(page, /^\s*发表\s*$/);
  await publishButton.click({ trial: true });
  const db = getDb();
  // Once the first publish click is attempted, never automatically submit again.
  const claim = db.prepare("INSERT OR IGNORE INTO wechat_publications (pushId, status) VALUES (?, 'unknown')").run(id);
  if (!claim.changes) throw new Error('该选稿已经提交，请到微信公众平台核对结果。');
  job.status = 'publishing';
  beginStep('publish_submit', '未能提交发表操作。');
  await publishButton.click();
  beginStep('publish_result', '未能确认发表结果。');
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
        operationLog(job, 'publish.confirmation_clicked', { button: 'dialog' });
        await confirm.click();
        confirmed = true;
      } else if (!confirmed && await continuePublish.isVisible()) {
        operationLog(job, 'publish.confirmation_clicked', { button: 'continue' });
        await continuePublish.click();
        confirmed = true;
      }
    }
    await pause(650);
  }
  throw new Error('微信未显示发表成功，请到微信公众平台核对。');
}

async function runBrowserJob(job, push) {
  let browser;
  let stage;
  let stageStartedAt;
  let failure;
  job.logId = randomUUID();
  const finishStep = () => {
    operationLog(job, 'step.completed', { stage, durationMs: Date.now() - stageStartedAt });
  };
  const beginStep = (nextStage, message) => {
    if (stage) finishStep();
    stage = nextStage;
    stageStartedAt = Date.now();
    failure = message;
    operationLog(job, 'step.started', { stage });
  };
  try {
    beginStep('browser_launch', '无法启动公众号浏览器。请查看后端操作日志。');
    browser = await launchWechatBrowser();
    beginStep('session_restore', '无法读取公众号登录会话。');
    const dir = join(dirname(getDb().location() || ''), 'wechat-browser');
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await chmod(dir, 0o700);
    const sessionPath = join(dir, `admin-${job.userId}.json`);
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
    operationLog(job, 'session.loaded', { restored: Boolean(storageState) });
    beginStep('wechat_login', '无法打开微信登录页或保存登录会话。');
    const token = await login(page, context, job, sessionPath);
    if (!token) {
      failure = '登录等待超时，请重新发起扫码登录。';
      throw new Error(failure);
    }
    if (!push) {
      finishStep();
      job.status = 'logged_in';
      return;
    }
    job.status = 'preparing';
    const broadcast = push.articles.length === 1 && push.articles[0].sourceType === 'xinwenlianbo'
      ? push.articles[0]
      : null;
    await prepareArticle(page, push, token, broadcast, beginStep);
    await generateCover(page, beginStep);
    beginStep('news_source', '未能设置创作来源为「素材来源官方媒体 / 网络新闻」。');
    await setNewsSource(page);
    beginStep('original_declaration', '未能完成微信原创声明。');
    await markOriginal(page);
    beginStep('publish_ready', '微信发表按钮不可用，或选稿已提交。');
    await publish(page, job, push.id, beginStep);
    finishStep();
    job.qr = null;
    job.status = 'published';
  } catch (error) {
    if (error.code === 'WECHAT_BROWSER_ROOT') {
      failure = '当前后端以 root 运行，Chromium 沙箱无法启动。请使用普通系统账号运行后端。';
    }
    const stored = push && getDb().prepare('SELECT status FROM wechat_publications WHERE pushId = ?').get(push.id);
    job.status = stored?.status || 'failed';
    const reason = error.name === 'TimeoutError' ? '等待微信页面响应超时。' : '';
    job.message = job.status === 'unknown'
      ? `${failure}${reason}请到微信公众平台检查发表记录。同一选稿已锁定。`
      : `${failure}${reason}`;
    job.qr = null;
    // Browser errors can contain session URLs and article content.
    operationLog(job, 'step.failed', {
      stage, durationMs: Date.now() - stageStartedAt, errorName: error.name,
      errorCode: error.code, message: job.message
    }, 'error');
  } finally {
    await browser?.close().catch(error => {
      operationLog(job, 'browser.close_failed', { errorName: error.name }, 'warn');
    });
    operationLog(job, 'job.finished', { status: job.status });
    job.finished = true;
  }
}

export function getBrowserLoginStatus(userId) {
  if (!lastLogin || lastLogin.userId !== userId) return { status: 'idle' };
  const { status, qr, message } = lastLogin;
  return { status, qr, message };
}

export function startBrowserLogin(userId) {
  if (activeJob && !activeJob.finished) {
    if (activeJob === lastLogin && activeJob.userId === userId) return getBrowserLoginStatus(userId);
    throw httpError('已有公众号任务正在进行，请稍候。', 409);
  }
  activeJob = lastLogin = { userId, status: 'starting', qr: null, finished: false };
  void runBrowserJob(activeJob);
  return getBrowserLoginStatus(userId);
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
    throw httpError('已有公众号任务正在进行，请稍候。', 409);
  }
  const current = getPublicationStatus(id, userId);
  if (['published', 'unknown'].includes(current.status)) return current;
  activeJob = { id, userId, status: 'starting', qr: null, finished: false };
  void runBrowserJob(activeJob, push);
  return getPublicationStatus(id, userId);
}
