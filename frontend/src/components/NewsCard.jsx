import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import LikeButton from './LikeButton.jsx';

export default function NewsCard({ article, isActive, onPlay, isAdmin = false, variant = 'standard', user }) {
  const [isFlagged, setIsFlagged] = useState(false);

  useEffect(() => {
    if (!isAdmin) { setIsFlagged(false); return; }
    api.getFlaggedArticleIds().then((data) => {
      setIsFlagged(data.articleIds?.includes(article.id) || false);
    }).catch(() => {});
  }, [article.id, isAdmin]);

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
    <article className={`news-story news-story--${variant}${isActive ? ' is-playing' : ''}`}>
      <div className="news-story-meta">
        <span className="news-story-source">{article.sourceName}</span>
        {article.publishedAt && (
          <time dateTime={article.publishedAt}>
            {new Date(article.publishedAt).toLocaleString('zh-CN', {
              month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })}
          </time>
        )}
      </div>
      <div className="news-story-heading">
        <h3><Link to={`/article/${article.id}`}>{article.title}</Link></h3>
        {isAdmin && (
          <button
            onClick={handleToggleFlag}
            className="news-story-flag"
            title={isFlagged ? '取消标记' : '标记为重要'}
            aria-label={isFlagged ? '取消标记' : '标记为重要'}
            aria-pressed={isFlagged}
          >
            {isFlagged ? '★' : '☆'}
          </button>
        )}
      </div>
      {variant !== 'brief' && article.summary && <p className="news-story-summary">{article.summary}</p>}
      <div className="flex items-center gap-3 mt-2">
        <LikeButton articleId={article.id} user={user} />
        {onPlay && (
          <button onClick={() => onPlay(article)} className="news-listen" aria-label={`播报 ${article.title}`}>
            <span aria-hidden="true">▶</span> {isActive ? '播放中' : '播报'}
          </button>
        )}
      </div>
    </article>
  );
}
