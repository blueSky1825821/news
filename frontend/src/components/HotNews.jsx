import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function HotNews() {
  const [range, setRange] = useState('today');

  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-2xl font-bold">热门排行榜</h1>
      <div role="group" aria-label="榜单时间范围" className="mb-5 inline-flex gap-1 rounded-lg bg-gray-100 p-1">
        {[['today', '今日'], ['week', '近 7 天']].map(([value, label]) => (
          <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}
            className={`rounded-md px-4 py-2 text-sm ${range === value ? 'bg-white font-semibold shadow-sm' : 'text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>
      <Ranking key={range} range={range} />
    </section>
  );
}

function Ranking({ range }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    api.getHotArticles(range, page).then(data => {
      if (!active) return;
      setItems(current => page === 1 ? data.items : [
        ...current, ...data.items.filter(item => !current.some(existing => existing.id === item.id))
      ]);
      setTotalPages(data.pagination.totalPages);
      setStatus('ready');
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [range, page, attempt]);

  return (
    <>
      <ol className="divide-y rounded-xl border bg-white empty:hidden">
        {items.map((item, index) => (
          <li key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-4 sm:gap-5">
            <span className="w-7 text-right font-semibold tabular-nums text-gray-500">{index + 1}</span>
            <div>
              <Link to={`/article/${item.id}`} className="font-semibold hover:underline">{item.title}</Link>
              <p className="mt-1 text-sm text-gray-600">{item.sourceName} · {item.likeCount} 赞</p>
              {item.summary && <p className="mt-2 line-clamp-2 text-sm text-gray-700">{item.summary}</p>}
            </div>
          </li>
        ))}
      </ol>
      {status === 'ready' && items.length === 0 && <p className="text-gray-600">这个时段暂无上榜新闻</p>}
      {status === 'loading' && <p role="status" className="mt-4 text-gray-600">加载中…</p>}
      {status === 'error' && (
        <button type="button" className="news-listen mt-4" onClick={() => {
          setStatus('loading');
          setAttempt(value => value + 1);
        }}>加载失败，重试</button>
      )}
      {status === 'ready' && page < totalPages && (
        <button type="button" className="news-listen mt-4" onClick={() => {
          setStatus('loading');
          setPage(value => value + 1);
        }}>加载更多</button>
      )}
    </>
  );
}
