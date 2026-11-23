import React, { useState } from 'react';

export default function NewsPagination({ page, totalPages, onChange }) {
  const [target, setTarget] = useState(String(page));
  if (totalPages < 2) return null;

  return (
    <nav className="news-pagination flex-wrap" aria-label="新闻分页">
      <button type="button" className="news-listen" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
      <span>第 {page} / {totalPages} 页</span>
      <button type="button" className="news-listen" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>下一页</button>
      <form className="flex items-center gap-2" onSubmit={(event) => {
        event.preventDefault();
        const next = Number(target);
        if (Number.isInteger(next) && next >= 1 && next <= totalPages) onChange(next);
      }}>
        <input type="number" min="1" max={totalPages} step="1" required aria-label="跳转页码"
          className="news-action w-20" value={target} onChange={(event) => setTarget(event.target.value)} />
        <button type="submit" className="news-listen">跳页</button>
      </form>
    </nav>
  );
}
