import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../services/api.js';
import { readNewsHeadlines } from '../services/newsHeadlines.js';

export const TASK_LABELS = {
  pending: '待抓取',
  collecting: '正在抓取央视网正文',
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
  if (!record) return <p role="status" className="mt-3 text-sm text-gray-600">正在加载任务详情…</p>;

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
        <h4 className="font-semibold">节目主要内容</h4>
        <p className="mt-1 whitespace-pre-wrap break-words text-gray-700">{record.summary || '暂无内容。'}</p>
      </div>
      {record.transcript && record.transcript !== record.summary && (
        <details>
          <summary className="cursor-pointer font-semibold">新闻正文</summary>
          <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-gray-700">
            {record.transcript}
          </p>
        </details>
      )}
    </div>
  );
}

export default function XinwenlianboHistory({ refresh, task, busy, onTaskChange, onSelectPublication, onRecordDeleted }) {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteArticle, setDeleteArticle] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState('');
  const [detailsId, setDetailsId] = useState(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const revision = `${refresh}:${task?.date}:${task?.status}:${task?.completedAt}`;

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
      .catch(() => { if (!controller.signal.aborted) setError('任务记录加载失败。'); });
    return () => controller.abort();
  }, [page, revision, attempt]);

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
      onRecordDeleted(id);
      setDeleteTarget(null);
      setDetailsId(current => current === id ? null : current);
      setResult(null);
      setAttempt(value => value + 1);
      setNotice(data.articleDeleted ? '任务记录和新闻已删除。' : '任务记录已删除。');
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
    <section className="mb-6 rounded-xl border bg-white p-5" aria-labelledby="broadcast-history-title">
      <h2 id="broadcast-history-title" className="text-lg font-semibold">任务记录</h2>
      {notice && <p role="status" className="mt-3 text-sm text-green-700">{notice}</p>}
      {actionError && <p role="alert" className="mt-3 text-sm text-red-700">{actionError}</p>}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error} <button type="button" className="underline" onClick={() => setAttempt(value => value + 1)}>重试</button>
        </p>
      ) : !result ? (
        <p role="status" className="mt-3 text-sm text-gray-600">正在加载任务记录…</p>
      ) : !result.items.length ? (
        <p className="mt-3 text-sm text-gray-600">暂无任务记录。</p>
      ) : (
        <ul className="mt-3 divide-y border-t">
          {result.items.map(record => {
            const expanded = detailsId === record.id;
            const confirmingDelete = deleteTarget === record.id;
            const activeRecord = busy && task?.date === record.taskDate;
            return (
              <li key={record.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{record.taskDate}</h3>
                    <p className="mt-1 text-sm text-gray-600">
                      {TASK_LABELS[record.status] ?? record.status} · 开始于 {formatTime(record.startedAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="news-action" aria-expanded={expanded}
                      onClick={() => setDetailsId(expanded ? null : record.id)}>
                      {expanded ? '收起记录' : '查看记录'}
                    </button>
                    {record.articleId && <Link to={`/article/${record.articleId}`} className="news-action">查看新闻</Link>}
                    {record.articleId && record.status === 'completed' && (
                      <button type="button" className="news-action" disabled={busy || deleting}
                        onClick={() => onSelectPublication(record)}>选作公众号发表</button>
                    )}
                    <button type="button" className="news-action text-red-700"
                      disabled={activeRecord || deleting || confirmingDelete}
                      onClick={() => confirmDeletion(record.id)}>
                      删除
                    </button>
                  </div>
                </div>
                {confirmingDelete && (
                  <div className="mt-3 space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
                    <p>确认删除 {record.taskDate} 的任务记录及其内容？此操作不可撤销。</p>
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
        <nav className="news-pagination" aria-label="任务记录分页">
          <button type="button" className="news-listen" disabled={deleting || page <= 1} onClick={() => showPage(page - 1)}>上一页</button>
          <span>{page} / {result.pagination.totalPages}</span>
          <button type="button" className="news-listen" disabled={deleting || page >= result.pagination.totalPages}
            onClick={() => showPage(page + 1)}>下一页</button>
        </nav>
      )}
    </section>
  );
}
