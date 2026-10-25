import React, { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import NewsCard from './NewsCard.jsx';
import SourceFilter from './SourceFilter.jsx';

export default function NewsList({ activeArticleId, onPlaySingle, onPlayAll }) {
  const [articles, setArticles] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [sources, setSources] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  const fetchData = async (page = 1, sourceId) => {
    setLoading(true);
    try {
      const [articlesRes, sourcesRes] = await Promise.all([
        api.getArticles({ page, limit: 20, sourceId }),
        api.getSources()
      ]);
      setArticles(articlesRes.items || []);
      setPagination(articlesRes.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
      setSources(sourcesRes || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(1, selectedSourceId);
  }, [selectedSourceId]);

  const handleSourceChange = (sourceId) => {
    setSelectedSourceId(sourceId);
  };

  const handlePageChange = (page) => {
    fetchData(page, selectedSourceId);
  };

  const handleTriggerCrawl = async () => {
    setTriggering(true);
    try {
      await api.triggerCrawl();
      setTimeout(() => fetchData(1, selectedSourceId), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setTriggering(false);
    }
  };

  const textsForPlayAll = articles.map((a) => `${a.title}。${a.summary || ''}`);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">新闻头条播报</h1>
        <div className="flex items-center gap-3">
          <SourceFilter
            sources={sources}
            selectedId={selectedSourceId}
            onChange={handleSourceChange}
          />
          <button
            onClick={() => onPlayAll && onPlayAll(articles, textsForPlayAll)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            全部播报
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-500">加载中...</div>
      ) : articles.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">暂无新闻，请等待首次抓取完成</p>
          <button
            onClick={handleTriggerCrawl}
            disabled={triggering}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {triggering ? '触发中...' : '立即触发抓取'}
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {articles.map((article) => (
              <NewsCard
                key={article.id}
                article={article}
                isActive={activeArticleId === article.id}
                onPlay={(a) => onPlaySingle && onPlaySingle(a, `${a.title}。${a.summary || ''}`)}
              />
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                上一页
              </button>
              <span className="text-sm text-gray-600">
                {pagination.page} / {pagination.totalPages}
              </span>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
