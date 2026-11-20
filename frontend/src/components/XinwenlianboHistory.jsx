import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../services/api.js';
import { readNewsHeadlines } from '../services/newsHeadlines.js';

export const RECORDING_LABELS = {
  pending: '待录制',
  recording: '录制中',
  finishing: '正在保存音频',
  stopping: '正在取消',
  transcribing: '正在转录',
  summarizing: '正在提取标题与摘要',
  completed: '已完成',
  cancelled: '已取消',
  failed: '失败'
};

const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit'
});

function formatTime(value) {
  return value ? timeFormat.format(new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z')) : '—';
}

function RecordContent({ id, status, revision }) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.getXinwenlianboRecord(id, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        setRecord(data);
        setError(false);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [id, status, revision, attempt]);

  if (error) return (
    <button type="button" className="news-action mt-3" onClick={() => {
      setError(false);
      setAttempt(value => value + 1);
    }}>详情加载失败，重试</button>
  );
  if (!record) return <p role="status" className="mt-3 text-sm text-gray-600">正在加载录制详情…</p>;

  const headlines = readNewsHeadlines(record.headlines);
  return (
    <div className="mt-3 space-y-3 rounded-lg bg-gray-50 p-3 text-sm">
      <div>
        <h4 className="font-semibold">提取的标题</h4>
        {headlines.length ? (
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-gray-700">
            {headlines.map((title, index) => <li key={index}>{title}</li>)}
          </ol>
        ) : <p className="mt-1 text-gray-600">暂无可提取的标题。</p>}
      </div>
      <div>
        <h4 className="font-semibold">新闻摘要</h4>
        <p className="mt-1 whitespace-pre-wrap break-words text-gray-700">{record.summary || '暂无摘要。'}</p>
      </div>
      {record.transcript && (
        <details>
          <summary className="cursor-pointer font-semibold">转录原文</summary>
          <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-gray-700">
            {record.transcript}
          </p>
        </details>
      )}
    </div>
  );
}

export default function XinwenlianboHistory({ refresh, task, busy, onTaskChange }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [pendingId, setPendingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteArticle, setDeleteArticle] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState('');
  const [detailsId, setDetailsId] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const revision = `${refresh}:${task?.date}:${task?.status}`;

  useEffect(() => {
    const controller = new AbortController();
    api.getXinwenlianboTasks(page, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, data.pagination.totalPages);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setResult(data);
        setError('');
      })
      .catch(() => { if (!controller.signal.aborted) setError('录制记录加载失败。'); });
    return () => controller.abort();
  }, [page, refresh, task?.date, task?.status, attempt]);

  async function summarize(id) {
    setPendingId(id);
    setActionError('');
    try {
      onTaskChange(await api.summarizeXinwenlianboRecord(id));
    } catch (err) {
      setActionError(err.message || '无法开始总结，请重试。');
    } finally {
      setPendingId(null);
    }
  }

  function confirmDeletion(id) {
    setDeleteTarget(id);
    setDeleteArticle(false);
    setActionError('');
    setNotice('');
  }

  async function removeRecord(id) {
    setDeleting(true);
    setActionError('');
    try {
      const data = await api.deleteXinwenlianboRecord(id, { deleteArticle });
      onTaskChange(data.status);
      setDeleteTarget(null);
      setDetailsId(current => current === id ? null : current);
      setResult(null);
      setAttempt(value => value + 1);
      setNotice(data.articleDeleted ? '录制记录和新闻已删除。' : '录制记录已删除。');
    } catch (err) {
      setActionError(err.message || '删除失败，请重试。');
    } finally {
      setDeleting(false);
    }
  }

  function showPage(nextPage) {
    setPage(nextPage);
    setResult(null);
    setDetailsId(null);
    setDeleteTarget(null);
  }

  return (
    <section className="mb-6 rounded-xl border bg-white p-5" aria-labelledby="recording-history-title">
      <h2 id="recording-history-title" className="text-lg font-semibold">录制记录</h2>
      <p className="mt-1 text-sm text-gray-600">按日期查看录制结果。已有转录的记录可以重新提取标题和摘要。</p>
      {notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
      {actionError && <p role="alert" className="mt-3 text-sm text-red-700">{actionError}</p>}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error} <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>重试</button>
        </p>
      ) : !result ? (
        <p role="status" className="mt-3 text-sm text-gray-600">正在加载录制记录…</p>
      ) : !result.items.length ? (
        <p className="mt-3 text-sm text-gray-600">暂无录制记录。</p>
      ) : (
        <ul className="mt-3 divide-y border-t">
          {result.items.map(record => {
            const isSummarizing = record.status === 'summarizing';
            const expanded = detailsId === record.id;
            const confirmingDelete = deleteTarget === record.id;
            const activeRecord = busy && task?.date === record.taskDate;
            return (
              <li key={record.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{record.taskDate}</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {RECORDING_LABELS[record.status] ?? record.status} · 开始于 {formatTime(record.startedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="news-action" aria-expanded={expanded}
                      onClick={() => setDetailsId(expanded ? null : record.id)}>
                      {expanded ? '收起记录' : '查看记录'}
                    </button>
                    {record.hasTranscript && (
                      <button type="button" className="news-primary"
                        disabled={busy || pendingId !== null || isSummarizing || deleting || confirmingDelete}
                        onClick={() => summarize(record.id)}>
                        {isSummarizing || pendingId === record.id ? '正在提取…' : '提取标题和摘要'}
                      </button>
                    )}
                    {record.articleId && <Link to={`/article/${record.articleId}`} className="news-action">查看新闻</Link>}
                    <button type="button" className="news-action text-red-700"
                      disabled={activeRecord || pendingId !== null || deleting || confirmingDelete}
                      onClick={() => confirmDeletion(record.id)}>
                      删除
                    </button>
                  </div>
                </div>
                {confirmingDelete && (
                  <div className="mt-3 space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                    <p>确认删除 {record.taskDate} 的录制记录、转录和留存音频？此操作不可撤销。</p>
                    {record.articleId && (
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={deleteArticle} disabled={deleting}
                          onChange={event => setDeleteArticle(event.target.checked)} />
                        同时删除已生成的新闻
                      </label>
                    )}
                    <div className="flex gap-2">
                      <button type="button" className="news-action" disabled={deleting || activeRecord}
                        onClick={() => removeRecord(record.id)}>
                        {deleting ? '正在删除…' : '确认删除'}
                      </button>
                      <button type="button" className="news-action" disabled={deleting}
                        onClick={() => setDeleteTarget(null)}>取消</button>
                    </div>
                  </div>
                )}
                {record.errorMessage && <p className="mt-2 text-sm text-red-700">{record.errorMessage}</p>}
                {expanded && <RecordContent id={record.id} status={record.status} revision={revision} />}
              </li>
            );
          })}
        </ul>
      )}
      {result?.pagination.totalPages > 1 && (
        <nav className="news-pagination" aria-label="录制记录分页">
          <button type="button" className="news-listen" disabled={deleting || page <= 1} onClick={() => showPage(page - 1)}>上一页</button>
          <span>{page} / {result.pagination.totalPages}</span>
          <button type="button" className="news-listen" disabled={deleting || page >= result.pagination.totalPages}
            onClick={() => showPage(page + 1)}>下一页</button>
        </nav>
      )}
    </section>
  );
}
