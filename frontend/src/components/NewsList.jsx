import React, { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import NewsCard from './NewsCard.jsx';
import SourceFilter from './SourceFilter.jsx';

export default function NewsList({ activeArticleId, onPlaySingle, onPlayAll, isAdmin = false }) {
  const [articles, setArticles] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [sources, setSources] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [triggering, setTriggering] = useState(false);

  const fetchData = async (page = 1, sourceId) => {
    setLoading(true);
    setError('');
    try {
      const [articlesRes, sourcesRes] = await Promise.all([
        api.getArticles({ page, limit: 20, sourceId }),
        api.getSources()
      ]);
      setArticles(articlesRes.items || []);
      setPagination(articlesRes.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 });
      setSources(sourcesRes || []);
    } catch (err) {
      setError(err.message || '加载失败');
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
    window.scrollTo(0, 0);
  };

  const handleTriggerCrawl = async () => {
    setTriggering(true);
    try {
      await api.triggerCrawl();
      await fetchData(1, selectedSourceId);
    } catch (err) {
      setError(err.message || '抓取失败');
    } finally {
      setTriggering(false);
    }
  };

  const textsForPlayAll = articles.map((a) => `${a.title}。${a.summary || ''}`);

  const showHeadlines = pagination.page === 1 && !selectedSourceId && articles.length >= 4;
  const [lead, ...briefs] = showHeadlines ? articles.slice(0, 4) : [];
  const latest = showHeadlines ? articles.slice(4) : articles;
  const renderStory = (article, variant) => (
    <NewsCard
      key={article.id}
      article={article}
      isAdmin={isAdmin}
      isActive={activeArticleId === article.id}
      variant={variant}
      onPlay={onPlaySingle && ((a) => onPlaySingle(a, `${a.title}。${a.summary || ''}`))}
    />
  );

  return (
    <div aria-busy={loading}>
      <header className="news-section-header">
        <h1>{showHeadlines ? '头条新闻' : '新闻快讯'}</h1>
        <div className="news-toolbar">
          <SourceFilter sources={sources} selectedId={selectedSourceId} onChange={handleSourceChange} />
          <button
            onClick={() => onPlayAll?.(articles, textsForPlayAll)}
            disabled={loading || articles.length === 0}
            className="news-primary"
          >
            <span aria-hidden="true">▶</span> 全部播报
          </button>
        </div>
      </header>

      {loading ? (
        <div className="news-message" role="status">加载中…</div>
      ) : error ? (
        <div className="news-message" role="alert">
          <p>{error}</p>
          <button className="news-listen" onClick={() => fetchData(pagination.page, selectedSourceId)}>重试</button>
        </div>
      ) : articles.length === 0 ? (
        <div className="news-message">
          <p>{selectedSourceId ? '该来源暂无新闻' : '暂无新闻，请等待首次抓取完成'}</p>
          {isAdmin && (
            <button onClick={handleTriggerCrawl} disabled={triggering} className="news-primary mt-4">
              {triggering ? '抓取中…' : '立即抓取'}
            </button>
          )}
        </div>
      ) : (
        <>
          {lead && (
            <div className="news-headlines">
              <section aria-label="首条新闻">{renderStory(lead, 'lead')}</section>
              <section className="news-briefs" aria-labelledby="more-headlines">
                <h2 id="more-headlines">更多头条</h2>
                {briefs.map((article) => renderStory(article, 'brief'))}
              </section>
            </div>
          )}

          {latest.length > 0 && (
            <section className="news-feed" aria-label="新闻列表">
              {lead && <h2>最新消息</h2>}
              {latest.map((article) => renderStory(article))}
            </section>
          )}

          {pagination.totalPages > 1 && (
            <nav className="news-pagination" aria-label="新闻分页">
              <button className="news-listen" onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page <= 1}>
                上一页
              </button>
              <span>{pagination.page} / {pagination.totalPages}</span>
              <button className="news-listen" onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>
                下一页
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
