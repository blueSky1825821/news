import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';

export default function LikeUsersModal({ articleId, onClose }) {
  const [users, setUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    api.getLikes(articleId, page).then(data => {
      setUsers(prev => page === 1 ? data.users : [...prev, ...data.users]);
      setPagination(data.pagination);
    }).catch(() => {});
  }, [articleId, page]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-sm w-full max-h-[60vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold mb-4">点赞用户</h3>
        <ul className="space-y-2">
          {users.map(u => <li key={u.id} className="text-sm text-gray-700">{u.displayName}</li>)}
        </ul>
        {pagination && page < pagination.totalPages && (
          <button onClick={() => setPage(p => p + 1)} className="mt-4 text-blue-600 text-sm">加载更多</button>
        )}
      </div>
    </div>
  );
}
