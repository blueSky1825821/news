import React, { useState } from 'react';
import { api } from '../services/api.js';
import LikeUsersModal from './LikeUsersModal.jsx';

export default function LikeButton({ article, user }) {
  return <ArticleLike key={`${article.id}:${user?.id ?? 'guest'}`} article={article} user={user} />;
}

function ArticleLike({ article, user }) {
  const articleId = article.id;
  const [change, setChange] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState('');
  const { liked = false, likeCount = null } = change ?? article;

  const handleToggle = async () => {
    if (!user) return setMessage('请先登录');
    if (!user.emailVerified) return setMessage('请先验证邮箱');
    setLoading(true);
    setMessage('');
    try {
      const data = await api.toggleLike(articleId);
      setChange(data);
    } catch (err) {
      setMessage(err.code === 1023 ? '请先验证邮箱' : '点赞状态更新失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={handleToggle} disabled={loading} aria-pressed={liked}
        className="news-listen disabled:opacity-50">
        <span aria-hidden="true" className={liked ? 'text-red-600' : ''}>{liked ? '♥' : '♡'}</span> 点赞
      </button>
      <button type="button" onClick={() => setShowModal(true)} aria-haspopup="dialog"
        aria-label={likeCount === null ? '查看点赞用户' : `查看点赞用户，共 ${likeCount} 人`}
        className="rounded px-2 py-1 text-sm tabular-nums text-gray-600 hover:bg-gray-100">
        {likeCount ?? '—'}
      </button>
      {message && <span role="status" className="text-xs text-gray-600">{message}</span>}
      {showModal && <LikeUsersModal articleId={articleId} onClose={() => setShowModal(false)} />}
    </div>
  );
}
