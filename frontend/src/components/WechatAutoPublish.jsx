import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../services/api.js';

const storageKey = 'news-wechat-publication';
const pending = ['starting', 'login_scan', 'preparing', 'publishing', 'publish_scan'];
const messages = {
  starting: '正在打开微信公众平台…',
  login_scan: '请用有公众号管理权限的微信扫码，并在手机上确认登录。确认后自动继续发表。',
  preparing: '已登录，正在填写图文及封面…',
  publishing: '正在等待微信确认发表结果…',
  publish_scan: '微信要求核验发表操作，请扫码并在手机上确认。',
  logged_in: '登录已确认，发表时会尝试复用本次会话。',
  published: '微信已确认发表成功。',
  unknown: '发表结果待核对。请到微信公众平台检查发表记录。',
  failed: '发表未完成，请重试。',
  idle: '发表任务已中断，请重新生成或选择内容。'
};

export default function WechatAutoPublish({ pushId, prepare, disabled, loginOnly = false }) {
  const operationKey = loginOnly ? 'news-wechat-browser-login' : storageKey;
  const dialogTitle = useId();
  const [jobId, setJobId] = useState(() => sessionStorage.getItem(operationKey));
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const dialog = useRef(null);
  const running = !!jobId && (!job || pending.includes(job.status));
  const scanning = ['login_scan', 'publish_scan'].includes(job?.status);

  useEffect(() => {
    if (!running || starting) return;
    const controller = new AbortController();
    const { signal } = controller;
    let timer;
    async function poll() {
      try {
        const status = await (loginOnly
          ? api.getWechatBrowserLogin({ signal })
          : api.getWechatPublication(jobId, { signal }));
        if (signal.aborted) return;
        setJob(status);
        setError('');
        if (!pending.includes(status.status)) {
          sessionStorage.removeItem(operationKey);
          return;
        }
      } catch (err) {
        if (signal.aborted) return;
        if (err.endpointUnavailable || [401, 403, 404].includes(err.status)) {
          sessionStorage.removeItem(operationKey);
          setJob(null);
          setJobId(null);
          setError(err.message);
          return;
        }
        setError(`获取任务状态失败，正在重试。${err.message}`);
      }
      timer = setTimeout(poll, 1500);
    }
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [jobId, running, starting, loginOnly, operationKey]);

  useEffect(() => {
    const modal = dialog.current;
    if (scanning && !modal.open) modal.showModal();
    if (!scanning && modal.open) modal.close();
  }, [scanning]);

  async function start() {
    setStarting(true);
    setError('');
    try {
      const targetId = loginOnly ? 'login' : pushId || (await prepare())?.id;
      if (!targetId) return;
      // Keep polling the same selection if the POST response is lost.
      sessionStorage.setItem(operationKey, targetId);
      setJobId(targetId);
      setJob(null);
      const result = await (loginOnly ? api.startWechatBrowserLogin() : api.startWechatPublication(targetId));
      if (!pending.includes(result.status)) sessionStorage.removeItem(operationKey);
      setJob(result);
    } catch (err) {
      if (err.endpointUnavailable || (err.status >= 400 && err.status < 500)) {
        sessionStorage.removeItem(operationKey);
        setJob(null);
        setJobId(null);
      }
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  const statusMessage = loginOnly && job?.status === 'login_scan'
    ? '请用有公众号管理权限的微信扫码，并在手机上确认登录。'
    : loginOnly && job?.status === 'idle'
      ? '登录任务已中断，请重新扫码。'
      : messages[job?.status || 'starting'];
  const taskMessage = job?.message || statusMessage;
  const failed = ['failed', 'unknown', 'idle'].includes(job?.status);
  const alreadySubmitted = jobId === pushId && ['published', 'unknown'].includes(job?.status);
  return <div className="space-y-2">
    {(loginOnly || pushId || prepare) && <button type="button" onClick={start} disabled={disabled || starting || running || alreadySubmitted}
      className="rounded bg-green-700 px-4 py-2 text-sm text-white disabled:opacity-50">{loginOnly ? '扫码登录公众号' : '自动发表到公众号'}</button>}
    {(job || starting || running) && <p role={failed && !starting ? "alert" : "status"} className={failed && !starting ? "text-sm text-red-600" : "text-sm text-gray-700"}>
      {starting ? messages.starting : taskMessage}
    </p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <dialog ref={dialog} onCancel={event => event.preventDefault()} aria-labelledby={dialogTitle}
      className="w-[min(90vw,400px)] rounded-lg p-6 text-center backdrop:bg-black/50">
      <h3 id={dialogTitle} className="font-semibold">{job?.status === 'publish_scan' ? '微信发表核验' : '登录微信公众平台'}</h3>
      {job?.qr && <img src={job.qr} alt="微信扫码二维码" className="mx-auto my-3 max-w-full" />}
      {scanning && <p role="status" className="text-sm text-gray-700">{taskMessage}</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </dialog>
  </div>;
}
