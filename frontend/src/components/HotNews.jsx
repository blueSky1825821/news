import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function HotNews() {
  const [range, setRange] = useState('today');
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    setPage(1);
    api.getHotArticles(range, 1).then(data => { setItems(data.items); setPagination(data.pagination); }).catch(() => {});
  }, [range]);

  const loadMore = async () => {
    const nextPage = page + 1;
    const data = await api.getHotArticles(range, nextPage);
    setItems(prev => [...prev, ...data.items]);
    setPagination(data.pagination);
    setPage(nextPage);
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">热门排行榜</h2>
      <div className="flex gap-4 mb-6 border-b">
        <button onClick={() => setRange('today')} className={`pb-2 ${range === 'today' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>今日热门</button>
        <button onClick={() => setRange('week')} className={`pb-2 ${range === 'week' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}>本周热门</button>
      </div>
      <div className="space-y-4">
        {items.map(item => (
          <div key={item.id} className="border rounded-lg p-4 hover:shadow-md">
            <Link to={`/article/${item.id}`} className="font-bold hover:text-blue-600">{item.title}</Link>
            <p className="text-sm text-gray-500 mt-1">{item.sourceName} · {item.category} · ❤️ {item.likeCount || 0}</p>
            {item.summary && <p className="text-sm text-gray-600 mt-2 line-clamp-2">{item.summary}</p>}
          </div>
        ))}
      </div>
      {pagination && page < pagination.totalPages && (
        <button onClick={loadMore} className="mt-6 w-full py-2 border rounded hover:bg-gray-50">加载更多</button>
      )}
    </div>
  );
}
