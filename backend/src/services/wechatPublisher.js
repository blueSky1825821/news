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
const editorReadyTimeout = 30_000;
const qrCaptureInterval = 4000;
const dialogs = '.weui-desktop-dialog:visible, [role="dialog"]:visible';
const qrImage = 'img[src*="qrcode"], img[src*="scanlogin"], canvas';
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

async function login(page, context, job, sessionPath, beginStep) {
  beginStep('wechat_login_navigation', '未能打开微信公众平台登录页。');
  await page.goto(`${origin}/`, { waitUntil: 'commit', timeout: 30_000 });
  beginStep('wechat_login_scan', '未能完成微信扫码登录。');
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
      beginStep('wechat_login_save', '微信扫码登录已完成，但未能保存登录会话。');
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
  const title = Array.from(push.title.trim()).slice(0, 64).join('').trimEnd();
  const titleSelector = [
    'textarea#title', 'input#title', '#title[contenteditable="true"]',
    '.title-editor__input[contenteditable="true"]', '.title-editor__input [contenteditable="true"]',
    '#js_title_main textarea', '#js_title_main input', '#js_title_main [contenteditable="true"]',
    'textarea[placeholder*="标题"]', 'input[placeholder*="标题"]',
    '[contenteditable="true"][data-placeholder*="标题"]',
    '[contenteditable="true"][aria-label*="标题"]'
  ].join(', ');
  const titleField = visible(page, titleSelector);
  for (let attempt = 1; ; attempt++) {
    if (attempt > 1) await pause(attempt === 2 ? 2000 : 5000);
    let scriptFailures = 0;
    const scriptFailureCodes = new Set();
    let pageErrors = 0;
    const onRequestFailed = request => {
      if (request.resourceType() !== 'script') return;
      scriptFailures++;
      const code = request.failure()?.errorText;
      if (/^(?:net::)?ERR_[A-Z_0-9]+$/.test(code ?? '')) scriptFailureCodes.add(code);
    };
    const onPageError = () => { pageErrors++; };
    page.on('requestfailed', onRequestFailed);
    page.on('pageerror', onPageError);
    let response;
    let checkingTitle = false;
    try {
      query.set('timestamp', String(Date.now()));
      response = await page.goto(`${origin}/cgi-bin/appmsg?${query}`, { waitUntil: 'commit', timeout: editorReadyTimeout });
      const current = new URL(page.url());
      if (current.origin !== origin || current.pathname !== '/cgi-bin/appmsg') {
        throw new Error('微信未返回图文编辑器，请检查公众号登录状态。');
      }
      if (response && !response.ok()) throw new Error(`微信编辑器请求失败（HTTP ${response.status()}）。`);
      beginStep('editor_title', '未能填写微信图文标题，请检查微信公众平台是否能正常打开图文编辑器。');
      checkingTitle = true;
      await titleField.fill(title, { timeout: editorReadyTimeout });
      break;
    } catch (error) {
      if (!checkingTitle) {
        const networkCode = /net::(ERR_[A-Z_0-9]+)/.exec(error.message)?.[1];
        error.editorNavigation = { attempt, httpStatus: response?.status(), networkCode };
        if ((attempt === 1 && (networkCode || error.name === 'TimeoutError' || response?.status() >= 500)) ||
            (attempt === 2 && networkCode === 'ERR_NETWORK_CHANGED')) {
          beginStep('editor_navigation_retry', '重新打开微信图文编辑器失败。');
          continue;
        }
        throw error;
      }
      if (error.name !== 'TimeoutError') throw error;
      const fields = await page.locator(titleSelector).count().catch(() => null);
      const editorShape = await page.evaluate(() => ({
        textInputs: document.querySelectorAll('textarea, input[type="text"], input:not([type])').length,
        editableRegions: document.querySelectorAll('[contenteditable="true"]').length,
        frames: document.querySelectorAll('iframe').length,
        saveDraftVisible: Array.from(document.querySelectorAll('button, a, [role="button"]'))
          .some(node => node.getClientRects().length && node.textContent.trim() === '保存为草稿')
      })).catch(() => null);
      error.editorTitle = { attempt, matchingFields: fields, httpStatus: response?.status(),
        scriptFailures, scriptFailureCodes: [...scriptFailureCodes], pageErrors, editorShape };
      const networkChanged = scriptFailureCodes.has('net::ERR_NETWORK_CHANGED') || scriptFailureCodes.has('ERR_NETWORK_CHANGED');
      if (fields !== 0 || attempt >= (networkChanged ? 3 : 2)) throw error;
      beginStep('editor_navigation_retry', '微信编辑器未加载标题控件，重新打开失败。');
    } finally {
      page.off('requestfailed', onRequestFailed);
      page.off('pageerror', onPageError);
    }
  }
  const filledTitle = await titleField.evaluate(node => node.value ?? node.textContent);
  if (filledTitle.trim() !== title) throw new Error('微信图文标题校验失败。');
  beginStep('editor_body_locate', '未找到可编辑的微信图文正文输入区。');
  const summary = broadcast?.summary?.trim();
  const lines = summary
    ? summary.replace(/([：:；;。])\s*(?=\d{1,2}[.．、](?!\d))/g, '$1\n')
      .split(/\r?\n/).map(line => line.trim()).filter(Boolean)
    : formatHeadlineLines(push.articles);
  const editor = visible(page, [
    '#ueditor_0[contenteditable="true"]',
    '#ueditor_0 [contenteditable="true"]',
    '#js_ueditor[contenteditable="true"]',
    '#js_ueditor [contenteditable="true"]',
    '#js_content[contenteditable="true"]',
    '.rich_media_content[contenteditable="true"]',
    '.rich_media_content .ProseMirror[contenteditable="true"]',
    'iframe[id^="ueditor"], iframe[name^="ueditor"], #js_ueditor iframe, #ueditor_0 iframe'
  ].join(', '));
  const bodyEditor = visible(page, '#ueditor_0 .ProseMirror[contenteditable="true"], .rich_media_content .ProseMirror[contenteditable="true"]');
  await bodyEditor.or(editor).first().waitFor();
  const bodyTarget = await bodyEditor.isVisible() ? bodyEditor : editor;
  const field = await bodyTarget.evaluate(node => node.tagName) === 'IFRAME'
    ? visible(bodyTarget.contentFrame(), 'body[contenteditable="true"], .ProseMirror[contenteditable="true"], #ueditor_0[contenteditable="true"]')
    : bodyTarget;
  await field.waitFor();
  beginStep('editor_body_write', '已找到正文输入区，但未能写入微信图文正文。');
  await field.click();
  await field.evaluate((element, { lines, broadcast, text, url }) => {
    const doc = element.ownerDocument;
    const content = doc.createElement('div');
    for (const line of lines) {
      const paragraph = doc.createElement('p');
      paragraph.style.cssText = 'margin:0 0 14px;line-height:1.8;font-size:16px;color:#263244';
      const numbered = broadcast && /^(\d{1,2}[.．、])\s*(.*)$/.exec(line);
      if (broadcast && (numbered || /主要内容[：:]$/.test(line))) {
        const heading = doc.createElement('strong');
        heading.style.color = '#164b82';
        heading.textContent = numbered ? numbered[1] : line;
        paragraph.append(heading);
        if (numbered) paragraph.append(` ${numbered[2]}`);
      } else {
        paragraph.textContent = line;
      }
      content.append(paragraph);
    }
    const footer = doc.createElement('p');
    footer.style.cssText = 'margin:20px 0 0;line-height:1.7;font-size:14px';
    const link = doc.createElement('a');
    link.href = url;
    link.textContent = text;
    footer.append(link);
    content.append(footer);
    const selection = doc.getSelection();
    if (!selection || !element.contains(selection.anchorNode)) throw new Error('微信正文编辑区未获得焦点。');
    // Let ProseMirror parse the rich text into its document model through its paste handler.
    const clipboard = new DataTransfer();
    clipboard.setData('text/html', content.innerHTML);
    clipboard.setData('text/plain', [...lines, text].join('\n'));
    const handled = !element.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true, cancelable: true, clipboardData: clipboard
    }));
    if (!handled && !doc.execCommand('insertHTML', false, content.innerHTML)) {
      throw new Error('微信图文正文排版写入失败。');
    }
  }, { lines, broadcast: Boolean(summary), text: moreNewsText, url: moreNewsUrl });

  beginStep('editor_body_settle', '微信编辑器未完成富文本粘贴，请检查是否显示格式校验提示。');
  // WeChat may asynchronously check the pasted HTML before committing it to ProseMirror.
  await field.getByText(moreNewsText, { exact: true }).first().waitFor({ timeout: editorReadyTimeout });

  const readTitle = () => titleField.evaluate(node => (node.value ?? node.textContent).trim());
  if (await readTitle() !== title) {
    beginStep('editor_title_restore', '微信标题在正文写入后发生变化，未能恢复标题。');
    await titleField.fill(title, { timeout: editorReadyTimeout });
    await field.click();
    if (await readTitle() !== title) throw new Error('微信图文标题校验失败。');
  }

  beginStep('editor_body_verify', '微信正文回读校验失败，新闻内容或「查看更多」链接文字可能未完整写入。');
  // Editors render paragraph boundaries differently in the DOM.
  const compact = text => text.normalize('NFC').replace(/[\s\u200B-\u200D\uFEFF]+/g, '');
  const bodyText = compact(await field.textContent());
  let offset = 0;
  for (const [lineIndex, line] of [...lines, moreNewsText].entries()) {
    const expected = compact(line);
    const index = bodyText.indexOf(expected, offset);
    if (index < 0) {
      throw Object.assign(new Error('微信图文正文校验失败。'), {
        editorBody: { lineIndex: lineIndex + 1, expectedLines: lines.length + 1, actualLength: bodyText.length }
      });
    }
    offset = index + expected.length;
  }
}

async function selectCover(page, beginStep) {
  const filename = 'wenxu.png';
  beginStep('cover_selection', `未能从微信图片库选择 loog/${filename} 作为封面。`);
  const coverArea = page.getByText('拖拽或选择封面', { exact: true }).filter({ visible: true }).first();
  await coverArea.or(visible(page, '.js_cover_btn_area')).first().click();
  await page.getByText(/^(从图片库选择|从图片库选取)$/).filter({ visible: true }).first().click();

  const library = page.locator(dialogs).filter({ hasText: '选择图片' }).first();
  await library.getByText(/^我的图片(?:\s*\(\d+\))?$/).filter({ visible: true }).first().click();
  await library.getByText(/^loog(?:\s*[（(]\d+[）)])?$/).filter({ visible: true }).first().click();
  await library.getByText(filename, { exact: true }).filter({ visible: true }).first().click();

  beginStep('cover_confirmation', `已选择 ${filename}，但未能确认封面。`);
  const coverDialog = page.locator(dialogs).filter({ hasText: /选择图片|裁剪图片|裁剪封面|编辑封面|设置封面/ }).first();
  const confirm = button(coverDialog, /^\s*(确定|确认|完成)\s*$/);
  const next = button(library, /^\s*下一步\s*$/);
  await confirm.or(next).first().waitFor();
  if (!await confirm.isVisible()) await next.click();
  await confirm.click();
  await visible(page, '.js_cover_preview_new, .js_cover_preview_square').waitFor();
}

async function saveDraft(page, job, id, beginStep) {
  if (new URL(page.url()).origin !== origin) throw new Error('微信编辑器地址已变化。');
  job.status = 'saving';
  beginStep('draft_save_click', '未能点击「保存为草稿」。');
  const save = visible(page, '#js_submit').filter({ hasText: /^\s*保存为草稿\s*$/ });
  await save.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const submit = document.getElementById('js_submit');
    const button = submit?.querySelector('button');
    return button && !button.disabled && !submit.classList.contains('btn_disabled') &&
      submit.getAttribute('aria-disabled') !== 'true';
  });
  await save.click({ trial: true });
  const savedIndicator = visible(page,
    '#js_save_success, #js_save_success_with_ad, #js_save_success_with_ad_op');
  // The editor keeps its previous save indicator in the DOM.
  await savedIndicator.waitFor({ state: 'hidden' });
  const selfCheckExpected = await page.evaluate(() => {
    const config = window.wx?.cgiData;
    return config?.selfcheck_firsttime === 1 || config?.selfcheck_autocheck === 1;
  });
  const draftResponses = [];
  const receipt = page.waitForResponse(async response => {
    const url = new URL(response.url());
    if (url.origin !== origin || url.pathname !== '/cgi-bin/operate_appmsg' ||
        response.request().method() !== 'POST') return false;
    const action = url.searchParams.get('sub') ?? new URLSearchParams(response.request().postData() ?? '').get('sub');
    const diagnostic = { action: ['create', 'update'].includes(action) ? action : 'other', httpStatus: response.status() };
    if (draftResponses.length < 8) draftResponses.push(diagnostic);
    if (!response.ok()) return false;
    if (!['create', 'update'].includes(action)) return false;
    const result = await response.json().catch(() => null);
    const draftId = result?.appMsgId ?? result?.appmsgid ?? result?.appmsg_id ??
      result?.data?.appMsgId ?? result?.data?.appmsgid ?? result?.data?.appmsg_id;
    const returnCode = String(result?.base_resp?.ret ?? result?.ret);
    diagnostic.returnCode = /^-?\d{1,10}$/.test(returnCode) ? Number(returnCode) : null;
    diagnostic.hasDraftId = /^\d+$/.test(String(draftId)) && Number(draftId) > 0;
    return diagnostic.returnCode === 0 && diagnostic.hasDraftId;
  }, { timeout: editorReadyTimeout });
  const validation = page.getByText(/^(请先新建内容|请输入标题|请输入正文|请填写标题|请填写正文|请选择封面|保存失败|保存超时)[！!。]?$/
  ).filter({ visible: true }).first();
  const review = button(page.locator(dialogs), /^\s*继续保存\s*$/);
  const previousDraftId = new URL(page.url()).searchParams.get('appmsgid');
  const draftUrl = page.waitForURL(url => {
    const draftId = url.searchParams.get('appmsgid');
    return url.origin === origin && url.pathname === '/cgi-bin/appmsg' &&
      ['media/appmsg_edit', 'media/appmsg_edit_v2'].includes(url.searchParams.get('t')) &&
      url.searchParams.get('action') === 'edit' && !url.searchParams.has('isNew') &&
      /^[1-9]\d*$/.test(draftId ?? '') && draftId !== previousDraftId;
  }, { waitUntil: 'commit', timeout: editorReadyTimeout });
  const confirmation = Promise.any([
    receipt.then(() => null),
    draftUrl.then(() => null),
    savedIndicator.waitFor({ state: 'visible', timeout: editorReadyTimeout }).then(() => null),
    validation.waitFor({ state: 'visible', timeout: editorReadyTimeout }).then(() => validation.innerText()),
    review.waitFor({ state: 'visible', timeout: editorReadyTimeout }).then(() => '微信要求先处理内容检测提示')
  ]).then(reason => ({ confirmed: !reason, reason }), () => ({ confirmed: false }));
  await save.click();
  beginStep('draft_save_confirmation', '未能确认微信已保存草稿，请先检查草稿箱。');
  const result = await confirmation;
  if (!result.confirmed) {
    const error = new Error('微信未返回可核验的草稿保存回执。');
    error.draftResponses = draftResponses;
    error.draftValidation = result.reason ?? (selfCheckExpected ? '微信已启用保存前内容检测，未收到草稿保存回执' : undefined);
    throw error;
  }
  getDb().prepare("INSERT INTO wechat_publications (pushId, status) VALUES (?, 'draft_saved')").run(id);
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
    const token = await login(page, context, job, sessionPath, beginStep);
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
    await selectCover(page, beginStep);
    await saveDraft(page, job, push.id, beginStep);
    finishStep();
    job.qr = null;
    job.status = 'draft_saved';
  } catch (error) {
    if (error.code === 'WECHAT_BROWSER_ROOT') {
      failure = '当前后端以 root 运行，Chromium 沙箱无法启动。请使用普通系统账号运行后端。';
    }
    const editorShape = error.editorTitle?.editorShape;
    if (error.editorNavigation?.networkCode) {
      failure = `打开微信图文编辑器时连接中断（${error.editorNavigation.networkCode}）。`;
    } else if (error.editorNavigation?.httpStatus >= 400) {
      failure = `微信图文编辑器返回 HTTP ${error.editorNavigation.httpStatus}。`;
    }
    if (stage === 'editor_title' && editorShape && !editorShape.textInputs &&
        !editorShape.editableRegions && !editorShape.frames && !editorShape.saveDraftVisible) {
      const codes = error.editorTitle.scriptFailureCodes;
      failure = codes.some(code => code.endsWith('ERR_NETWORK_CHANGED'))
        ? '网络变化中断了微信编辑器脚本加载，重试后仍未恢复。'
        : '微信编辑器主体未加载，已尝试重新打开。';
    }
    const stored = push && getDb().prepare('SELECT status FROM wechat_publications WHERE pushId = ?').get(push.id);
    job.status = stored?.status || 'failed';
    const reason = error.draftValidation ? `${error.draftValidation}。`
      : error.name === 'TimeoutError' ? '等待微信页面响应超时。' : '';
    job.message = job.status === 'unknown'
      ? `${failure}${reason}请到微信公众平台检查发表记录。同一选稿已锁定。`
      : `${failure}${reason}`;
    job.qr = null;
    // Browser errors can contain session URLs and article content.
    operationLog(job, 'step.failed', {
      stage, durationMs: Date.now() - stageStartedAt, errorName: error.name,
      errorCode: error.code, message: job.message, editorTitle: error.editorTitle, draftResponses: error.draftResponses,
      draftValidation: error.draftValidation, editorBody: error.editorBody, editorNavigation: error.editorNavigation
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
  if (['draft_saved', 'published', 'unknown'].includes(current.status)) return current;
  activeJob = { id, userId, status: 'starting', qr: null, finished: false };
  void runBrowserJob(activeJob, push);
  return getPublicationStatus(id, userId);
}
