import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function NewsCard({ article, isActive, onPlay }) {
  const [isFlagged, setIsFlagged] = useState(false);

  useEffect(() => {
    api.getFlaggedArticleIds().then((data) => {
      setIsFlagged(data.articleIds?.includes(article.id) || false);
    }).catch(() => {});
  }, [article.id]);

  const handleToggleFlag = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const result = await api.toggleFlagArticle(article.id);
      setIsFlagged(result.flagged);
    } catch (err) {
      console.error('标记失败:', err);
    }
  };

  return (
    <div
      className={`
        rounded-lg border p-4 shadow-sm transition-colors
        ${isActive ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center">
            <Link
              to={`/article/${article.id}`}
              className="text-lg font-semibold text-gray-900 hover:text-blue-600"
            >
              {article.title}
            </Link>
            <button
              onClick={handleToggleFlag}
              className="ml-2 text-lg focus:outline-none"
              title={isFlagged ? '取消标记' : '标记为重要'}
            >
              {isFlagged ? '★' : '☆'}
            </button>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
              {article.sourceName}
            </span>
            <span>{article.publishedAt ? new Date(article.publishedAt).toLocaleString('zh-CN') : ''}</span>
          </div>
          <p className="mt-2 text-sm text-gray-600 line-clamp-2">
            {article.summary || ''}
          </p>
        </div>
        <button
          onClick={() => onPlay && onPlay(article)}
          className="shrink-0 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="播报"
        >
          播报
        </button>
      </div>
    </div>
  );
}
