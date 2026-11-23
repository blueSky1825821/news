import React from 'react';

import { Link } from 'react-router-dom';

export default function AutoPlayBar({ currentIndex, total, isPlaying, isLoadingArticle, mode, notice, onChangeMode, onPause, onResume, onNext, onStop }) {
  if (total === 0) return null;

  return (
    <div className="news-player fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white px-4 pt-3 shadow-lg">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-gray-700">
          播报进度：{currentIndex + 1} / {total}
          {isLoadingArticle && <span role="status" className="ml-2">正在加载全文…</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode && (
            <select className="news-action" aria-label="切换播报内容" value={mode}
              onChange={(event) => onChangeMode(event.target.value)}>
              <option value="title">仅标题</option>
              <option value="summary">标题和摘要</option>
              <option value="full">全文</option>
            </select>
          )}
          {mode && <Link to="/settings?tab=tts" className="news-listen">音色与语速</Link>}
          {isPlaying ? (
            <button
              onClick={onPause}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600"
            >
              暂停
            </button>
          ) : (
            <button
              onClick={onResume}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
            >
              继续
            </button>
          )}
          <button
            onClick={onNext}
            disabled={currentIndex + 1 >= total}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            下一条
          </button>
          <button
            onClick={onStop}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            停止
          </button>
        </div>
      </div>
      {notice && <p className="mx-auto mt-1 max-w-5xl text-sm" role="status">{notice}</p>}
    </div>
  );
}
