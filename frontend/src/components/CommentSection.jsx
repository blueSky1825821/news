import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

function CommentForm({ label, submitLabel, onSubmit, onCancel }) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (pending || !draft.trim()) return;
    setPending(true);
    setError('');
    try {
      await onSubmit(draft.trim());
      setDraft('');
    } catch (err) {
      setError(err.code === 1023 ? '请先验证邮箱' : '发送失败，草稿已保留，请重试');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <label className="block text-sm font-medium">
        {label}
        <textarea className="mt-1 block w-full rounded-lg border p-3 font-normal"
          rows={3} required maxLength={2000} disabled={pending}
          value={draft} onChange={event => setDraft(event.target.value)} />
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="submit" className="news-primary disabled:opacity-50" disabled={pending || !draft.trim()}>
          {pending ? '发送中…' : submitLabel}
        </button>
        {onCancel && <button type="button" className="news-listen" disabled={pending} onClick={onCancel}>取消</button>}
        <span className="ml-auto text-xs text-gray-500">{draft.length} / 2000</span>
      </div>
    </form>
  );
}

function ReportForm({ commentId }) {
  const [reason, setReason] = useState('');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('idle');

  async function submit(event) {
    event.preventDefault();
    if (!reason || status === 'pending') return;
    setStatus('pending');
    try {
      await api.reportComment(commentId, reason);
      setStatus('done');
    } catch (err) {
      setStatus(err.code === 1024 ? 'done' : 'error');
    }
  }

  if (status === 'done') return <span role="status" className="text-xs text-gray-600">已举报</span>;
  if (!open) return <button type="button" className="news-listen" onClick={() => setOpen(true)}>举报</button>;

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <select aria-label="举报原因" className="rounded border p-1.5 text-sm" required value={reason}
        disabled={status === 'pending'} onChange={event => setReason(event.target.value)}>
        <option value="">选择举报原因</option>
        {['垃圾广告', '人身攻击', '违法违规', '其他'].map(option => <option key={option}>{option}</option>)}
      </select>
      <button type="submit" className="news-listen" disabled={!reason || status === 'pending'}>
        {status === 'pending' ? '提交中…' : '提交举报'}
      </button>
      <button type="button" className="news-listen" disabled={status === 'pending'} onClick={() => setOpen(false)}>取消</button>
      {status === 'error' && <span role="alert" className="text-xs text-red-700">举报失败，请重试</span>}
    </form>
  );
}

function CommentItem({ comment, user, onReply }) {
  const [replying, setReplying] = useState(false);

  return (
    <article className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="break-all font-medium">{comment.user?.displayName || '未知用户'}</span>
        <time dateTime={comment.createdAt} className="text-xs text-gray-500">
          {new Date(comment.createdAt).toLocaleString('zh-CN')}
        </time>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">
        {comment.isDeleted ? <i>该评论已删除</i> : comment.content}
      </p>
      {!comment.isDeleted && user && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {onReply && user.emailVerified && !replying && (
            <button type="button" className="news-listen" onClick={() => setReplying(true)}>回复</button>
          )}
          {user.id !== comment.user?.id && <ReportForm key={user.id} commentId={comment.id} />}
        </div>
      )}
      {replying && user?.emailVerified && onReply && !comment.isDeleted && (
        <CommentForm key={user.id} label="回复内容" submitLabel="发送回复" onCancel={() => setReplying(false)}
          onSubmit={async content => {
            await onReply(comment.id, content);
            setReplying(false);
          }} />
      )}
      {comment.replies?.length > 0 && (
        <ul className="mt-3 space-y-3 rounded-lg border-l-2 bg-gray-50 p-3 sm:ml-4">
          {comment.replies.map(reply => <li key={reply.id}><CommentItem comment={reply} user={user} /></li>)}
        </ul>
      )}
    </article>
  );
}

export default function CommentSection({ articleId, user }) {
  return <ArticleComments key={articleId} articleId={articleId} user={user} />;
}

function ArticleComments({ articleId, user }) {
  const [comments, setComments] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api.getComments(articleId)
      .then(data => { if (active) setComments(data.comments); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [articleId, attempt]);

  async function post(content) {
    const comment = await api.postComment(articleId, content);
    setComments(current => [{ ...comment, replies: [] }, ...current]);
  }

  async function reply(parentId, content) {
    const comment = await api.postReply(parentId, content);
    setComments(current => current.map(item => item.id === parentId
      ? { ...item, replies: [...(item.replies ?? []), comment] }
      : item));
  }

  return (
    <section id="article-comments" tabIndex={-1} className="mt-8 scroll-mt-4 rounded-xl border bg-white p-4 sm:p-6" aria-label="评论">
      <h2 className="text-lg font-semibold">评论</h2>
      {!user ? (
        <Link to="/login" className="mt-3 inline-block text-sm text-blue-700 hover:underline">登录后发表评论</Link>
      ) : !user.emailVerified ? (
        <p className="mt-3 text-sm text-gray-600">验证邮箱后可以发表评论和回复</p>
      ) : comments && (
        <CommentForm key={user.id} label="发表评论" submitLabel="发表" onSubmit={post} />
      )}
      {error ? (
        <button type="button" className="news-listen mt-4" onClick={() => {
          setError(false);
          setAttempt(value => value + 1);
        }}>评论加载失败，重试</button>
      ) : comments === null ? (
        <p role="status" className="mt-4 text-sm text-gray-600">正在加载评论…</p>
      ) : comments.length === 0 ? (
        <p className="mt-4 text-sm text-gray-600">暂无评论</p>
      ) : (
        <ul className="mt-4 divide-y border-t">
          {comments.map(comment => (
            <li key={comment.id} className="py-4"><CommentItem comment={comment} user={user} onReply={reply} /></li>
          ))}
        </ul>
      )}
    </section>
  );
}
