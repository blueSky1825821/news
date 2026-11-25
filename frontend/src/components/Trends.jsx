import { useEffect, useId, useRef, useState } from 'react';

import { trendBoards } from '../../../shared/trendBoards.js';
import { api } from '../services/api.js';

const INITIAL_ITEMS = 10;
const timeFormat = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
});

function TrendBoard({ board, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  const items = expanded ? board.items : board.items.slice(0, INITIAL_ITEMS);

  return (
    <section className="min-w-0 self-start rounded-xl border bg-white p-4 sm:p-5">
      <header className="border-b pb-3">
        <h2 className="text-lg font-semibold">{board.name}</h2>
        {board.updatedAt && (
          <p className="mt-1 text-xs text-gray-600">
            {board.status === 'stale' ? '上次获取 ' : '获取于 '}
            <time dateTime={board.updatedAt}>{timeFormat.format(new Date(board.updatedAt))}</time>
            {board.providerUrl && (
              <> · 数据来自 <a className="underline" href={board.providerUrl} target="_blank" rel="noopener noreferrer">{board.provider}</a></>
            )}
          </p>
        )}
      </header>
      {board.status === 'stale' && <p className="mt-3 text-sm text-amber-800">更新失败，当前显示上次获取的榜单。</p>}
      {items.length === 0 ? (
        <p className="py-5 text-sm text-gray-600">
          {board.status === 'missing' ? '当前接口未提供此榜单。' : '暂时无法获取。'}<a className="text-blue-700 underline" href={board.url} target="_blank" rel="noopener noreferrer">打开平台榜单</a>
        </p>
      ) : (
        <ol className="divide-y">
          {items.map(item => (
            <li key={item.rank}>
              <button type="button" aria-haspopup="dialog" onClick={() => onSelect({ item, board })}
                aria-label={`查看详情：${item.title}`}
                className="grid w-full grid-cols-[1.65rem_minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-3 text-left text-sm hover:bg-gray-50">
                <span aria-hidden="true" className={`tabular-nums ${item.rank <= 3 ? 'font-bold text-red-700' : 'text-gray-500'}`}>
                  {String(item.rank).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <span className="block break-words font-medium">{item.title}</span>
                  {item.heat && <span className="mt-1 block text-xs tabular-nums text-gray-600">{item.heat}</span>}
                </span>
                <span aria-hidden="true" className="whitespace-nowrap text-xs text-blue-700">详情 ›</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {board.items.length > INITIAL_ITEMS && (
        <button type="button" className="news-action mt-2" aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}>
          {expanded ? '收起' : `展开全部 ${board.items.length} 条`}
        </button>
      )}
    </section>
  );
}

function TrendDetail({ item, board, onClose }) {
  const dialog = useRef(null);
  const headingId = useId();

  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);

  function closeDetail() {
    dialog.current.close();
    onClose();
  }

  return (
    <dialog ref={dialog} aria-labelledby={headingId}
      onCancel={event => { event.preventDefault(); closeDetail(); }}
      onClick={event => { if (event.target === event.currentTarget) closeDetail(); }}
      className="w-[calc(100%-2rem)] max-w-xl rounded-xl border bg-white p-0 shadow-xl backdrop:bg-black/50">
      <div className="max-h-[75vh] overflow-y-auto p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-gray-600">{board.name} · 第 {item.rank} 名</p>
          <button type="button" className="news-action" onClick={closeDetail}>关闭</button>
        </div>
        <h2 id={headingId} className="mt-4 break-words text-xl font-bold text-gray-900">{item.title}</h2>
        {item.heat && <p className="mt-2 text-sm text-gray-600">{item.heat}{/^[\d.,万亿]+$/.test(item.heat) ? ' 热度' : ''}</p>}
        <p className="mt-4 whitespace-pre-line break-words leading-relaxed text-gray-700">
          {item.description || '该榜单只提供话题标题和排名。'}
        </p>
        <a className="news-action mt-4" href={item.url} target="_blank" rel="noopener noreferrer">打开平台原文</a>
        {board.updatedAt && (
          <p className="mt-4 text-xs text-gray-600">获取于 <time dateTime={board.updatedAt}>
            {timeFormat.format(new Date(board.updatedAt))}
          </time></p>
        )}
      </div>
    </dialog>
  );
}

export default function Trends() {
  const [boards, setBoards] = useState(null);
  const [selected, setSelected] = useState('');
  const [detail, setDetail] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api.getTrends({ refresh: attempt > 0, signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        const supplied = new Map(data.boards.map(board => [board.id, board]));
        setBoards(trendBoards.map(board => supplied.get(board.id) ?? { ...board, status: 'missing', items: [] }));
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const visible = boards?.filter(board => !selected || board.id === selected) ?? [];

  const missingBoards = boards?.filter(board => board.status === 'missing').length ?? 0;

  function refresh() {
    setLoading(true);
    setError(false);
    setAttempt(value => value + 1);
  }

  return (
    <div>
      <header className="news-section-header">
        <h1>一键热搜</h1>
        <button type="button" className="news-action disabled:opacity-50" disabled={loading} onClick={refresh}>
          {loading ? '正在获取…' : '刷新榜单'}
        </button>
      </header>
      {boards && (
        <div className="news-interest-options mb-4" role="group" aria-label="筛选热搜平台">
          <button type="button" aria-pressed={!selected} onClick={() => setSelected('')}>全部平台</button>
          {boards.map(board => (
            <button key={board.id} type="button" aria-pressed={selected === board.id}
              onClick={() => setSelected(board.id)}>{board.name}</button>
          ))}
        </div>
      )}
      {missingBoards > 0 && (
        <p role="status" className="mb-4 text-sm text-amber-800">
          当前热搜接口只返回了 {trendBoards.length - missingBoards} 个榜单。请检查部署版本和代理路由，或直接打开平台榜单。
        </p>
      )}
      {error && <p role="alert" className="mb-4 text-sm text-red-700">获取榜单失败，请点击「刷新榜单」重试。</p>}
      {loading && !boards && <p role="status" className="news-message">正在获取各平台热搜…</p>}
      <div aria-busy={loading} className={selected ? 'max-w-2xl' : 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'}>
        {visible.map(board => <TrendBoard key={board.id} board={board} onSelect={setDetail} />)}
      </div>
      {detail && <TrendDetail {...detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
