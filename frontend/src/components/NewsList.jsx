import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import NewsCard from './NewsCard.jsx';
import SourceFilter from './SourceFilter.jsx';
import HotSidebar from './HotSidebar.jsx';

export default function NewsList({ activeArticleId, onPlaySingle, onPlayAll, defaultMode, user, isAdmin = false }) {
  const [articles, setArticles] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [playMode, setPlayMode] = useState(null);
  const selectedMode = playMode ?? defaultMode;
  const [sources, setSources] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [triggering, setTriggering] = useState(false);

  const [categories, setCategories] = useState([]);
  const [categoryError, setCategoryError] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const interests = user?.categories || [];
  const interestFilter = interests.join(',');
  const channel = selectedChannel === 'interests' && !interestFilter ? '' : selectedChannel;
  const channelLabel = categories.find((item) => item.name === channel)?.label;
  const sourceOptions = sources.filter((source) =>
    !channel || (channel === 'interests' ? interests.includes(source.category) : source.category === channel)
  );

  useEffect(() => {
    let active = true;
    api.getCategories()
      .then((data) => { if (active) setCategories(data?.categories || []); })
      .catch(() => { if (active) setCategoryError(true); });
    api.getSources()
      .then((data) => { if (active) setSources(data || []); })
      .catch((err) => console.error('加载新闻来源失败', err));
    return () => { active = false; };
  }, []);

  const categoryFilter = channel === 'interests' ? interestFilter : channel;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api.getArticles({
      page, limit: 20, view: 'card', sourceId: selectedSourceId,
      category: categoryFilter ? categoryFilter.split(',') : undefined
    }, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        setArticles(data.items || []);
        setPagination(data.pagination || { page, limit: 20, total: 0, totalPages: 0 });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message || '加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, selectedSourceId, categoryFilter, refresh, user?.id]);

  const handleChannelChange = (next) => {
    setSelectedChannel(next);
    setSelectedSourceId(undefined);
    setPage(1);
  };

  const handleSourceChange = (sourceId) => {
    setSelectedSourceId(sourceId);
    setPage(1);
  };

  const handlePageChange = (nextPage) => {
    setPage(nextPage);
    window.scrollTo(0, 0);
  };

  const handleTriggerCrawl = async () => {
    setTriggering(true);
    try {
      await api.triggerCrawl();
      setPage(1);
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(err.message || '抓取失败');
    } finally {
      setTriggering(false);
    }
  };

  const showHeadlines = !channel && pagination.page === 1 && !selectedSourceId && articles.length >= 4;
  const [lead, ...briefs] = showHeadlines ? articles.slice(0, 4) : [];
  const latest = showHeadlines ? articles.slice(4) : articles;
  const renderStory = (article, variant) => (
    <NewsCard
      key={article.id}
      article={article}
      user={user}
      isAdmin={isAdmin}
      isActive={activeArticleId === article.id}
      variant={variant}
      onPlay={onPlaySingle}
    />
  );

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div className="flex-1 min-w-0">
      <section className="news-interests" aria-label="兴趣分类">
        <div className="news-interests-label">
          <h2>兴趣分类</h2>
          {user && <Link to="/settings">管理兴趣</Link>}
        </div>
        <div className="news-interest-options" role="group" aria-label="筛选新闻分类">
          {[
            { name: '', label: '全部' },
            ...(interests.length ? [{ name: 'interests', label: '我的兴趣' }] : []),
            ...categories
          ].map(({ name, label }) => (
            <button key={name} type="button" aria-pressed={channel === name} onClick={() => handleChannelChange(name)}>
              {label}
            </button>
          ))}
        </div>
        {categoryError && <p className="mt-2 text-sm text-gray-600" role="status">暂时无法加载分类</p>}
      </section>
      <div aria-busy={loading}>
        <header className="news-section-header">
          <h1>{channel === 'interests' ? '我的兴趣' : channelLabel || (showHeadlines ? '头条新闻' : '新闻快讯')}</h1>
          <div className="news-toolbar">
            <SourceFilter sources={sourceOptions} selectedId={selectedSourceId} onChange={handleSourceChange} />
            <select aria-label="全部播报范围" value={selectedMode} className="news-action"
              onChange={event => setPlayMode(event.target.value)}>
              <option value="title">仅标题</option>
              <option value="summary">标题和摘要</option>
              <option value="full">全文</option>
            </select>
            <button
              onClick={() => onPlayAll?.(articles, selectedMode)}
              disabled={loading || !!error || articles.length === 0}
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
            <button className="news-listen" onClick={() => setRefresh((value) => value + 1)}>重试</button>
          </div>
        ) : articles.length === 0 ? (
          <div className="news-message">
            <p>{selectedSourceId ? '该来源暂无新闻' : channel ? '该分类暂无新闻' : '暂无新闻，请等待首次抓取完成'}</p>
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
      </div>
      <HotSidebar />
    </div>
  );
}
