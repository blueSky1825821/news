import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import LikeButton from './LikeButton.jsx';

export default function NewsCard({ article, isActive, onPlay, onOpen, related = [], isAdmin = false, variant = 'standard', user }) {
  const [isFlagged, setIsFlagged] = useState(false);

  useEffect(() => {
    if (!isAdmin) { setIsFlagged(false); return; }
    api.getFlaggedArticleIds().then((data) => {
      setIsFlagged(data.articleIds?.includes(article.id) || false);
    }).catch(() => {});
  }, [article.id, isAdmin]);

  const handleToggleFlag = async (e) => {
    const triggeredAt = new Date().toISOString();
    e.preventDefault();
    e.stopPropagation();
    try {
      const result = await api.toggleFlagArticle(article.id);
      setIsFlagged(result.flagged);
    } catch (err) {
      console.error(`[triggeredAt=${triggeredAt}]`, '标记失败:', err);
    }
  };

  return (
    <article id={`news-story-${article.id}`} className={`news-story news-story--${variant}${isActive ? ' is-playing' : ''}`}>
      <div className="news-story-meta">
        <span className="news-story-source">{article.sourceName}</span>
        {article.publishedAt && (
          <time dateTime={article.publishedAt}>
            {new Date(article.publishedAt).toLocaleString('zh-CN', {
              timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
            })}
          </time>
        )}
      </div>
      <div className="news-story-heading">
        <h3><Link to={`/article/${article.id}`} onClick={onOpen}>{article.title}</Link></h3>
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
      {article.summary && <p className="news-story-summary">{article.summary}</p>}
      {related.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer">另有 {related.length} 篇相关报道</summary>
          <ul className="ml-4 mt-1 list-disc">
            {related.map((report) => (
              <li key={report.id}>
                <Link className="underline" to={`/article/${report.id}`} onClick={onOpen}>{report.sourceName} · {report.title}</Link>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <LikeButton article={article} user={user} />
        {onPlay && (
          <button type="button" onClick={() => onPlay(article)} aria-label={`收听 ${article.title}`} className="news-listen">收听</button>
        )}
      </div>
    </article>
  );
}
