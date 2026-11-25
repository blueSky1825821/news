import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../services/api.js';
import WechatAutoPublish from './WechatAutoPublish.jsx';
import XinwenlianboHistory, { TASK_LABELS } from './XinwenlianboHistory.jsx';

export default function XinwenlianboCollection({ refresh = 0 }) {
  const [task, setTask] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const [publication, setPublication] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const publicationPanel = useRef(null);
  const status = task?.status ?? 'pending';
  const running = status === 'collecting';
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
        const data = await api.getXinwenlianboStatus({ signal: controller.signal });
        if (controller.signal.aborted) return;
        setTask(data);
        delay = data.status === 'collecting' ? 2500 : 20_000;
        setStatusError(false);
      } catch {
        if (!controller.signal.aborted) setStatusError(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(update, delay);
      }
    }
    update();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [submitting, refresh]);

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
      setTask(await api.triggerXinwenlianbo({ force }));
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="mb-6 rounded-xl border bg-white p-5" aria-label="CCTV 新闻联播抓取">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">CCTV 新闻联播</h2>
          <p role="status" className="text-sm font-medium text-gray-700">
            {task?.date && `${task.date} · `}{task ? TASK_LABELS[status] ?? status : '正在获取状态…'}
          </p>
        </div>
        <p className="mt-1 text-sm text-gray-600">读取央视网当天《新闻联播》完整版的内容简介。</p>
        {statusError && <p role="alert" className="mb-3 text-sm text-red-700">暂时无法获取任务状态，正在重试。</p>}
        {task?.enabled === false && <p className="mb-3 text-sm text-gray-600">新闻联播抓取已禁用。</p>}
        {(actionError || task?.errorMessage) && (
          <p role={actionError || status === 'failed' ? 'alert' : undefined} className="mb-3 text-sm text-gray-700">
            {actionError || task.errorMessage}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          {!running && (
            <button type="button" className="news-primary" disabled={!task?.enabled || submitting || confirm}
              onClick={() => status === 'completed' ? setConfirm(true) : collect()}>
              {submitting ? '处理中…' : status === 'completed' ? '重新抓取' : status === 'failed' ? '重试抓取' : '手动抓取'}
            </button>
          )}
          {!running && task?.articleId && (
            <Link to={`/article/${task.articleId}`} className="news-action">{status === 'completed' ? '查看主要内容' : '查看上次内容'}</Link>
          )}
        </div>
        <div ref={publicationPanel} className="mt-3 space-y-2">
          {targetDate && <p className="text-sm text-gray-700">公众号发表 · {targetDate} 新闻联播</p>}
          <div className="flex flex-wrap items-start gap-3">
            <WechatAutoPublish
              pushId={target && publication?.articleId === target.articleId && publication?.completedAt === target.completedAt
                ? publication.draft.id : undefined}
              prepare={target ? preparePublication : null}
              disabled={running || submitting || confirm} />
            <Link to="/wechat-settings" className="news-action">公众号后台扫码登录</Link>
            {selectedRecord && <button type="button" className="news-action" onClick={() => setSelectedRecord(null)}>返回今日选稿</button>}
          </div>
        </div>
        {confirm && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <p>重新抓取成功后会更新当天主要内容。</p>
            <div className="mt-2 flex gap-2">
              <button type="button" className="news-action" onClick={() => collect(true)}>确认</button>
              <button type="button" className="news-action" onClick={() => setConfirm(false)}>返回</button>
            </div>
          </div>
        )}
      </section>
      <XinwenlianboHistory refresh={refresh} task={task} busy={running || submitting} onTaskChange={setTask} onSelectPublication={selectPublication}
        onRecordDeleted={id => setSelectedRecord(current => current?.id === id ? null : current)} />
    </>
  );
}
