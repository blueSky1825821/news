import React, { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function HotSidebar() {
  const listId = useId();
  const [expanded, setExpanded] = useState(false);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api.getHotSidebar('today')
      .then(data => { if (active) setItems(data.items); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [attempt]);

  return (
    <aside className="order-first self-stretch lg:order-last lg:w-64 lg:shrink-0 lg:self-start">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">今日热门</h2>
          <Link to="/hot" className="text-sm text-blue-700 hover:underline">完整榜单 →</Link>
        </div>
        {error ? (
          <button type="button" className="mt-3 text-sm text-blue-700" onClick={() => {
            setError(false);
            setAttempt(value => value + 1);
          }}>加载失败，重试</button>
        ) : items === null ? (
          <p role="status" className="mt-3 text-sm text-gray-500">加载中…</p>
        ) : items.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">今日暂无上榜新闻</p>
        ) : (
          <ol id={listId} className="mt-2 divide-y">
            {items.map((item, index) => (
              <li key={item.id}
                className={`grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-2 py-2.5 text-sm ${expanded || index < 2 ? 'grid' : 'hidden lg:grid'}`}>
                <span className="font-medium tabular-nums text-gray-500">{index + 1}</span>
                <Link to={`/article/${item.id}`} className="line-clamp-2 hover:underline">{item.title}</Link>
                <span className="whitespace-nowrap text-xs text-gray-600">{item.likeCount} 赞</span>
              </li>
            ))}
          </ol>
        )}
        {items?.length > 2 && (
          <button type="button" className="news-action mt-2 lg:hidden" aria-expanded={expanded}
            aria-controls={listId} onClick={() => setExpanded(value => !value)}>
            {expanded ? '收起热门' : `查看更多（${items.length - 2} 条）`}
          </button>
        )}
      </div>
    </aside>
  );
}
