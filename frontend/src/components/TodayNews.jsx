import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import NewsCard from './NewsCard.jsx';
import NewsPagination from './NewsPagination.jsx';

export default function TodayNews({ activeArticleId, onPlaySingle, user }) {
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const loading = !result && !error;
  const { items: articles = [], pagination } = result ?? {};

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError(null);
    api.getTodayArticles({ page, limit: 20 }, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message || '加载失败'); });
    return () => controller.abort();
  }, [page, attempt, user?.id]);

  return (
    <div aria-busy={loading}>
      <header className="news-section-header">
        <h1>最近 24 小时收录</h1>
        <Link
          to="/"
          className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          返回首页按发布日期查找
        </Link>
      </header>

      {loading ? (
        <div className="py-12 text-center text-gray-500">加载中...</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}<button type="button" className="news-listen ml-3" onClick={() => setAttempt(value => value + 1)}>重试</button></div>
      ) : articles.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">最近 24 小时暂无新收录</p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-gray-500">
            共 {pagination.total} 篇，按发布时间倒序展示
          </p>
          <div className="news-feed">
            {articles.map((article) => (
              <NewsCard
                key={article.id}
                article={article}
                user={user}
                isActive={activeArticleId === article.id}
                onPlay={onPlaySingle}
              />
            ))}
          </div>

          <NewsPagination key={pagination.page} {...pagination} onChange={(next) => {
            if (next === page) return;
            setPage(next);
            window.scrollTo(0, 0);
          }} />
        </>
      )}
    </div>
  );
}
