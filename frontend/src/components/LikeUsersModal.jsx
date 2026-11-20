import React, { useEffect, useId, useRef, useState } from 'react';
import { api } from '../services/api.js';

export default function LikeUsersModal({ articleId, onClose }) {
  const dialog = useRef(null);
  const titleId = useId();
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  useEffect(() => {
    let active = true;
    api.getLikes(articleId, page).then(data => {
      if (!active) return;
      setUsers(current => page === 1 ? data.users : [...current, ...data.users]);
      setPagination(data.pagination);
      setStatus('ready');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [articleId, page, attempt]);

  return (
    <dialog ref={dialog} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      className="w-[calc(100%-2rem)] max-w-sm rounded-xl border p-0 shadow-xl backdrop:bg-black/50">
      <div className="max-h-[70vh] overflow-auto p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="font-semibold">点赞用户</h2>
          <button type="button" className="news-listen" onClick={onClose}>关闭</button>
        </div>
        <ul className="mt-3 divide-y">
          {users.map(user => <li key={user.id} className="break-words py-2 text-sm">{user.displayName}</li>)}
        </ul>
        {status === 'ready' && users.length === 0 && <p className="text-sm text-gray-600">还没有人点赞</p>}
        {status === 'loading' && <p role="status" className="text-sm text-gray-600">加载中…</p>}
        {status === 'error' && (
          <button type="button" className="news-listen" onClick={() => {
            setStatus('loading');
            setAttempt(value => value + 1);
          }}>加载失败，重试</button>
        )}
        {status === 'ready' && page < pagination?.totalPages && (
          <button type="button" className="news-listen mt-3" onClick={() => {
            setStatus('loading');
            setPage(value => value + 1);
          }}>加载更多</button>
        )}
      </div>
    </dialog>
  );
}
