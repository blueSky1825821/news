import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../services/api.js';
import XinwenlianboHistory, { RECORDING_LABELS } from './XinwenlianboHistory.jsx';

const RUNNING = new Set(['recording', 'finishing', 'stopping', 'transcribing', 'summarizing']);
const STEPS = ['录制', '转录', '提取标题与摘要'];
const PROCESSING_LABELS = {
  transcribing: '正在转录完整录音',
  'extract-headlines': '正在提取片头标题',
  'summary-request': '正在等待摘要服务响应',
  'summary-response': '正在读取摘要服务响应',
  'validate-summary': '正在校验摘要',
  'summary-fallback': '正在根据转录文本生成摘要',
  'publish-summary': '正在保存摘要'
};
const PHASE = { recording: 0, finishing: 0, transcribing: 1, summarizing: 2, completed: 3 };

export default function XinwenlianboRecording({ refresh = 0 }) {
  const [task, setTask] = useState(null);
  const [config, setConfig] = useState(null);
  const [duration, setDuration] = useState('');
  const [action, setAction] = useState('');
  const [actionError, setActionError] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [confirm, setConfirm] = useState(null);

  const status = task?.status ?? 'pending';
  const running = RUNNING.has(status);
  const validDuration = Number.isInteger(Number(duration)) && Number(duration) >= 1 && Number(duration) <= 120;
  const ready = !!config?.enabled && !!task && validDuration;

  useEffect(() => {
    let active = true;
    api.getXinwenlianboConfig().then(data => {
      if (!active) return;
      setConfig(data);
      setDuration(value => value || String(data.durationMinutes || 30));
    }).catch(() => { if (active) setConfig({ error: true }); });
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    if (action) return;
    const controller = new AbortController();
    let timer;
    async function update() {
      try {
        const data = await api.getXinwenlianboStatus({ signal: controller.signal });
        if (controller.signal.aborted) return;
        setTask(data);
        setStatusError(false);
      } catch {
        if (!controller.signal.aborted) setStatusError(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(update, running ? 2500 : 20_000);
      }
    }
    update();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [action, running, refresh]);

  async function perform(next) {
    if (action) return;
    setConfirm(null);
    setAction(next);
    setActionError('');
    try {
      const data = next === 'start' || next === 'redo'
        ? await api.triggerXinwenlianbo({ durationMinutes: Number(duration), force: next === 'redo' })
        : await api.stopXinwenlianbo({ finish: next === 'finish' });
      if (data) setTask(data);
      else setActionError('录制已结束，正在刷新任务状态。');
    } catch (err) {
      setActionError(err.message);
    } finally {
      setAction('');
    }
  }

  const plannedSeconds = task?.durationMinutes * 60;
  const captured = task?.capturedSeconds;
  const progress = status === 'recording' && plannedSeconds > 0;
  const phase = PHASE[status] ?? -1;
  const processing = task?.progress;
  const processingLabel = PROCESSING_LABELS[processing?.step] ??
    (status === 'transcribing' ? '正在转录完整录音' : '正在生成摘要');
  const transcriptionPercent = status === 'transcribing' ? processing?.percent : null;

  return (
    <>
      <section className="mb-6 rounded-xl border bg-white p-5" aria-label="CCTV 新闻联播手动录制">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">CCTV 新闻联播</h2>
          <p role="status" className="text-sm font-medium text-gray-700">
            {task?.date && `${task.date} · `}{task ? RECORDING_LABELS[status] ?? status : '正在获取状态…'}
          </p>
        </div>
        <p className="mt-1 text-sm text-gray-600">手动录制从当前直播开始。录制期间提供切片预览。录制结束后转录完整录音，再提取标题并生成摘要。留存音频超过 15 天后自动清理。</p>
        <ol className="my-4 flex flex-wrap gap-2 text-sm" aria-label="录制处理步骤">
          {STEPS.map((label, index) => (
            <li key={label} aria-current={phase === index ? 'step' : undefined}
              className={`rounded-full px-3 py-1 ${phase >= index ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
              {label}{phase > index ? ' ✓' : ''}
            </li>
          ))}
        </ol>
        {progress && (
          <div className="mb-4">
            <progress className="block h-2 w-full accent-blue-600" max={plannedSeconds}
              value={Number.isFinite(captured) ? Math.min(captured, plannedSeconds) : undefined} aria-label="音频录制进度" />
            <p className="mt-2 text-xs text-gray-600">
              {captured > 0
                ? `已收录 ${Math.floor(captured / 60)} 分 ${captured % 60} 秒`
                : '正在等待直播音频'} · 计划 {task.durationMinutes} 分钟
              {task.transcribedSeconds > 0 &&
                ` · 已预览 ${Math.floor(task.transcribedSeconds / 60)} 分 ${task.transcribedSeconds % 60} 秒`}
            </p>
            {!task.transcriptPreview && <p className="mt-1 text-xs text-gray-600">录满首个 60 秒分段后开始识别。</p>}
          </div>
        )}
        {(status === 'transcribing' || status === 'summarizing') && (
          <div className="mb-4">
            <progress className="block h-2 w-full accent-blue-600" max={100}
              value={transcriptionPercent ?? undefined} aria-label={processingLabel} />
            <p className="mt-2 text-xs text-gray-600">
              {processingLabel}
              {transcriptionPercent != null && ` · ${transcriptionPercent}%`}
              {processing && ` · 当前步骤已用时 ${Math.floor(processing.elapsedSeconds / 60)} 分 ${processing.elapsedSeconds % 60} 秒`}
            </p>
          </div>
        )}
        {running && task?.transcriptPreview && (
          <section className="mb-4 rounded-lg bg-gray-50 p-3" aria-label="转录预览">
            <h3 className="text-sm font-medium text-gray-700">转录预览</h3>
            <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm text-gray-700">
              {task.transcriptPreview}
            </p>
          </section>
        )}
        {statusError && <p role="alert" className="mb-3 text-sm text-red-700">暂时无法获取任务状态，正在重试。</p>}
        {config?.error && <p role="alert" className="mb-3 text-sm text-red-700">录制配置加载失败，请点击页面的「刷新」。</p>}
        {config?.enabled === false && <p className="mb-3 text-sm text-gray-600">新闻联播录制已禁用。</p>}
        {(actionError || task?.errorMessage) && (
          <p role={actionError || status === 'failed' ? 'alert' : undefined} className="mb-3 text-sm text-gray-700">
            {actionError || task.errorMessage}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          {!running && (
            <>
              <label className="text-sm text-gray-700">
                录制时长（分钟）
                <input type="number" min="1" max="120" step="1" value={duration} disabled={!!action}
                  onChange={event => setDuration(event.target.value)}
                  className="mt-1 block w-36 rounded border bg-white px-3 py-2" />
              </label>
              <button type="button" className="news-primary" disabled={!ready || !!action || !!confirm}
                onClick={() => status === 'completed' ? setConfirm('redo') : perform('start')}>
                {action ? '处理中…' : status === 'completed' ? '重新录制' : status === 'failed' ? '重试录制' : '手动录制'}
              </button>
            </>
          )}
          {status === 'recording' && (
            <>
              <button type="button" className="news-primary" disabled={!!action || !!confirm || captured === 0}
                onClick={() => perform('finish')}>结束录制并提取标题</button>
              <button type="button" className="news-action" disabled={!!action || !!confirm}
                onClick={() => setConfirm('cancel')}>取消录制</button>
            </>
          )}
          {!running && task?.articleId && (
            <Link to={`/article/${task.articleId}`} className="news-action">{status === 'completed' ? '查看摘要' : '查看上次摘要'}</Link>
          )}
        </div>
        {confirm && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <p>{confirm === 'redo' ? '重新录制会从当前直播开始，原录音会保留，成功后更新当天摘要。' : '取消后，本次录制不会生成摘要。'}</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="news-action" onClick={() => perform(confirm)}>确认</button>
              <button type="button" className="news-action" onClick={() => setConfirm(null)}>返回</button>
            </div>
          </div>
        )}
      </section>
      <XinwenlianboHistory refresh={refresh} task={task} busy={running || !!action} onTaskChange={setTask} />
    </>
  );
}
