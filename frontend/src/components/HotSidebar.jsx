import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function HotSidebar() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.getHotSidebar('today').then(data => setItems(data.items)).catch(() => {});
  }, []);

  return (
    <aside className="hidden lg:block w-72 shrink-0">
      <div className="bg-white border rounded-lg p-4">
        <h3 className="font-bold text-lg mb-3">今日热门</h3>
        <ol className="space-y-3">
          {items.map((item, idx) => (
            <li key={item.id} className="flex gap-2">
              <span className="text-gray-400 w-5 shrink-0">{idx + 1}</span>
              <Link to={`/article/${item.id}`} className="text-sm hover:text-blue-600 line-clamp-2">{item.title}</Link>
            </li>
          ))}
        </ol>
        <Link to="/hot" className="block mt-3 text-sm text-blue-600 hover:underline">查看完整榜单 →</Link>
      </div>
    </aside>
  );
}
