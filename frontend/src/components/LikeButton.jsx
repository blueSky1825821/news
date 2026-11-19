import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import LikeUsersModal from './LikeUsersModal.jsx';

export default function LikeButton({ articleId, user }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!articleId) return;
    api.getLikes(articleId, 1, 1).then(data => setLikeCount(data.pagination.total)).catch(() => {});
    if (user) {
      api.hasLiked(articleId).then(data => setLiked(data.liked)).catch(() => {});
    }
  }, [articleId, user?.id]);

  const handleToggle = async () => {
    if (!user) { alert('请先登录'); return; }
    setLoading(true);
    try {
      const data = await api.toggleLike(articleId);
      setLiked(data.liked);
      setLikeCount(data.likeCount);
    } catch (err) {
      if (err.code === 1023) alert('请验证邮箱后点赞');
      else alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={handleToggle} disabled={loading} className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-500">
        <span>{liked ? '❤️' : '🤍'}</span>
        <span onClick={(e) => { e.stopPropagation(); setShowModal(true); }} className="cursor-pointer hover:underline">{likeCount}</span>
      </button>
      {showModal && <LikeUsersModal articleId={articleId} onClose={() => setShowModal(false)} />}
    </>
  );
}
