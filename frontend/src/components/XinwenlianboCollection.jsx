import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../services/api.js';
import WechatAutoPublish from './WechatAutoPublish.jsx';
import XinwenlianboHistory, { TASK_LABELS } from './XinwenlianboHistory.jsx';

export default function XinwenlianboCollection({ refresh = 0 }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
  const [date, setDate] = useState(today);
  const [statusRevision, setStatusRevision] = useState(0);
  const [task, setTask] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const [publication, setPublication] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const publicationPanel = useRef(null);
  const status = task?.status ?? 'pending';
  const running = Boolean(task?.activeDate);
  const target = selectedRecord || (status === 'completed' && task?.articleId ? task : null);
  const targetDate = target?.taskDate ?? target?.date;

  function selectPublication(record) {
    setSelectedRecord(record);
    publicationPanel.current.scrollIntoView({ block: 'nearest' });
  }

  useEffect(() => {
    if (submitting) return;
    const controller = new AbortController();
    let timer;
    let delay = 20_000;
    async function update() {
      try {
        const data = await api.getXinwenlianboStatus({ date, signal: controller.signal });
        if (controller.signal.aborted) return;
        setTask(data);
        delay = data.activeDate ? 2500 : 20_000;
        setStatusError(false);
      } catch {
        if (!controller.signal.aborted) setStatusError(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(update, delay);
      }
    }
    update();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [date, submitting, refresh, statusRevision]);

  async function preparePublication() {
    const draft = await api.createWechatPush([target.articleId]);
    setPublication({ articleId: target.articleId, completedAt: target.completedAt, draft });
    return draft;
  }

  async function collect(force = false) {
    if (submitting) return;
    setConfirm(false);
    setSubmitting(true);
    setActionError('');
    try {
      setTask(await api.triggerXinwenlianbo({ date, force }));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="mb-6 overflow-hidden rounded-xl border bg-white" aria-label="CCTV 新闻联播抓取">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 sm:px-6">
          <h2 className="text-xl font-semibold">CCTV 新闻联播</h2>
          <p role="status" className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
            {task?.date && `${task.date} · `}{task ? status === 'completed' ? '抓取完成' : TASK_LABELS[status] ?? status : '正在获取状态…'}
          </p>
        </header>
        <div className="grid gap-4 p-4 sm:gap-6 sm:p-6 xl:grid-cols-2">
          <div className="min-w-0 space-y-3">
            <h3 className="font-semibold">央视网抓取</h3>
            {running && task.activeDate !== date && (
              <p role="status" className="mt-1 text-sm text-gray-600">正在抓取 {task.activeDate} 的新闻联播。</p>
            )}
            {statusError && <p role="alert" className="mb-3 text-sm text-red-700">暂时无法获取任务状态，正在重试。</p>}
            {task?.enabled === false && <p className="mb-3 text-sm text-gray-600">新闻联播抓取已禁用。</p>}
            {(actionError || task?.errorMessage) && (
              <p role={actionError || status === 'failed' ? 'alert' : undefined} className="mb-3 text-sm text-gray-700">
                {actionError || task.errorMessage}
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-gray-700">
                抓取日期
                <input type="date" className="min-h-11 w-full rounded-md border px-3 py-2 sm:w-auto" value={date} max={today}
                  disabled={submitting || confirm}
                  onChange={event => {
                    if (!event.target.value || !event.target.validity.valid) return;
                    setTask(null);
                    setActionError('');
                    setStatusError(false);
                    setDate(event.target.value);
                  }} />
              </label>
              {!running && (
                <button type="button" className="news-primary min-h-11 justify-center" disabled={!task?.enabled || submitting || confirm}
                  onClick={() => status === 'completed' ? setConfirm(true) : collect()}>
                  {submitting ? '处理中…' : status === 'completed' ? '重新抓取' : status === 'failed' ? '重试抓取' : '手动抓取'}
                </button>
              )}
              {!running && task?.articleId && (
                <Link to={`/article/${task.articleId}`} className="news-action min-h-11 justify-center">{status === 'completed' ? '查看主要内容' : '查看上次内容'}</Link>
              )}
            </div>
            {confirm && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                <p>重新抓取成功后会更新 {date} 的主要内容。</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" className="news-action" onClick={() => collect(true)}>确认</button>
                  <button type="button" className="news-action" onClick={() => setConfirm(false)}>返回</button>
                </div>
              </div>
            )}
          </div>
          <section ref={publicationPanel} aria-label="公众号草稿" className="min-w-0 space-y-3 rounded-lg border bg-gray-50 p-4">
            <div>
              <h3 className="font-semibold">公众号草稿</h3>
              <p className="mt-1 text-sm text-gray-600">{targetDate ? `已选稿件：${targetDate} 新闻联播` : '从任务记录选择一篇已完成的新闻联播。'}</p>
            </div>
            {target && <WechatAutoPublish
              pushId={target && publication?.articleId === target.articleId && publication?.completedAt === target.completedAt
                ? publication.draft.id : undefined}
              prepare={target ? preparePublication : null}
              disabled={running || submitting || confirm} />}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <Link to="/wechat-settings" className="inline-flex min-h-11 items-center underline underline-offset-4">公众号后台登录</Link>
              {selectedRecord && <button type="button" className="min-h-11 underline underline-offset-4" onClick={() => setSelectedRecord(null)}>返回当前抓取日期</button>}
            </div>
          </section>
        </div>
      </section>
      <XinwenlianboHistory refresh={refresh} task={task} busy={running || submitting}
        onTaskChange={updated => {
          if (updated.date === date) setTask(updated);
          setStatusRevision(value => value + 1);
        }} onSelectPublication={selectPublication}
        onRecordDeleted={id => setSelectedRecord(current => current?.id === id ? null : current)} />
    </>
  );
}
