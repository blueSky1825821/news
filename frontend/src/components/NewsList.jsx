import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Link, useLocation, useNavigationType, useSearchParams } from 'react-router-dom';
import { api } from '../services/api.js';
import NewsCard from './NewsCard.jsx';
import SourceFilter from './SourceFilter.jsx';
import HotSidebar from './HotSidebar.jsx';
import NewsPagination from './NewsPagination.jsx';

const scrollPositions = new Map();

function groupReports(articles) {
  const groups = new Map();
  for (const article of articles) {
    const title = article.title.normalize('NFKC').toLowerCase().replace(/[\p{P}\s]/gu, '');
    const date = Date.parse(article.publishedAt);
    const day = Math.floor((date + 8 * 3600000) / 86400000);
    const key = title.length >= 12 && Number.isFinite(day) ? `${day}:${title}` : article.id;
    const group = groups.get(key);
    if (group) group.related.push(article);
    else groups.set(key, { article, related: [] });
  }
  return [...groups.values()];
}

export default function NewsList({ activeArticleId, onPlaySingle, onPlayAll, defaultMode, user, isAdmin = false }) {
  const [params, setParams] = useSearchParams();
  const { key: locationKey } = useLocation();
  const navigationType = useNavigationType();
  const selectedChannel = params.get('category') || '';
  const selectedSourceId = Number(params.get('source')) || undefined;
  const requestedPage = Number(params.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const date = params.get('date') || '';
  const query = params.get('q') || '';
  const [search, setSearch] = useState(query);
  useEffect(() => setSearch(query), [query]);
  const [articles, setArticles] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [playMode, setPlayMode] = useState(null);
  const selectedMode = playMode ?? defaultMode;
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [triggering, setTriggering] = useState(false);

  const [categories, setCategories] = useState([]);
  const [categoryError, setCategoryError] = useState(false);
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
    const triggeredAt = new Date().toISOString();
    api.getSources()
      .then((data) => { if (active) setSources(data || []); })
      .catch((err) => console.error(`[triggeredAt=${triggeredAt}]`, '加载新闻来源失败', err));
    return () => { active = false; };
  }, []);

  const categoryFilter = channel === 'interests' ? interestFilter : channel;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    api.getArticles({
      page, limit: 20, view: 'card', sourceId: selectedSourceId, date, q: query,
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
  }, [page, selectedSourceId, categoryFilter, date, query, refresh, user?.id]);

  useLayoutEffect(() => {
    if (!loading && !error && navigationType === 'POP' && scrollPositions.has(locationKey)) {
      const { id, top, scrollY } = scrollPositions.get(locationKey);
      const card = document.getElementById(`news-story-${id}`);
      window.scrollTo(0, card ? window.scrollY + card.getBoundingClientRect().top - top : scrollY);
    }
  }, [loading, error, navigationType, locationKey]);

  const updateFilters = (updates) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries({ page: null, ...updates })) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next);
  };

  const handleChannelChange = (next) => {
    updateFilters({ category: next, source: null });
  };

  const handleSourceChange = (sourceId) => {
    updateFilters({ source: sourceId });
  };

  const handlePageChange = (nextPage) => {
    if (page === nextPage) return;
    updateFilters({ page: nextPage > 1 ? nextPage : null });
    window.scrollTo(0, 0);
  };

  const handleTriggerCrawl = async () => {
    setTriggering(true);
    try {
      await api.triggerCrawl();
      updateFilters({});
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(err.message || '抓取失败');
    } finally {
      setTriggering(false);
    }
  };

  const groups = groupReports(articles);
  const filtered = channel || selectedSourceId || date || query;
  const showHeadlines = !filtered && page === 1 && groups.length >= 4;
  const [lead, ...briefs] = showHeadlines ? groups.slice(0, 4) : [];
  const latest = showHeadlines ? groups.slice(4) : groups;
  const queue = groups.map(({ article }) => article);
  const renderStory = ({ article, related }, variant) => (
    <NewsCard
      key={article.id}
      article={article}
      user={user}
      isAdmin={isAdmin}
      isActive={activeArticleId === article.id}
      variant={variant}
      onPlay={onPlaySingle}
      related={related}
      onOpen={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const card = event.currentTarget.closest('article');
        scrollPositions.set(locationKey, { id: article.id, top: card.getBoundingClientRect().top, scrollY: window.scrollY });
        if (scrollPositions.size > 50) scrollPositions.delete(scrollPositions.keys().next().value);
      }}
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
          <h1>{channel === 'interests' ? '我的兴趣' : channelLabel || (showHeadlines ? '最新更新' : '新闻快讯')}</h1>
          <div className="news-toolbar">
            <select aria-label="本页播报内容" value={selectedMode} className="news-action"
              onChange={event => setPlayMode(event.target.value)}>
              <option value="title">仅标题</option>
              <option value="summary">标题和摘要</option>
              <option value="full">全文</option>
            </select>
            <button
              onClick={() => onPlayAll?.(queue, selectedMode)}
              disabled={loading || !!error || articles.length === 0}
              className="news-primary"
            >
              <span aria-hidden="true">▶</span> 播报本页{!loading && !error && queue.length > 0 ? ` · ${queue.length} 条` : ''}
            </button>
          </div>
        </header>
        <form className="news-filters" aria-label="查找新闻" onSubmit={(event) => {
          event.preventDefault();
          updateFilters({ q: search.trim() });
        }}>
          <div className="news-filter-field news-filter-search">
            <label htmlFor="news-keyword">搜索新闻</label>
            <div>
              <input id="news-keyword" type="search" className="news-action" placeholder="输入人物、事件或关键词" maxLength={100}
                value={search} onChange={(event) => setSearch(event.target.value)} />
              <button type="submit" className="news-action">搜索</button>
            </div>
          </div>
          <label className="news-filter-field">
            发布日期（北京时间）
            <input type="date" className="news-action" value={date}
              onChange={(event) => updateFilters({ date: event.target.value })} />
          </label>
          <div className="news-filter-field">
            <span>新闻来源</span>
            <SourceFilter sources={sourceOptions} selectedId={selectedSourceId} onChange={handleSourceChange} />
          </div>
          {filtered && <button type="button" className="news-action" onClick={() => {
            setSearch('');
            setParams({});
          }}>清除筛选</button>}
        </form>
        {filtered && !loading && !error && <p className="news-result-count" role="status">找到 {pagination.total} 篇报道</p>}

        {loading ? (
          <div className="news-message" role="status">加载中…</div>
        ) : error ? (
          <div className="news-message" role="alert">
            <p>{error}</p>
            <button className="news-listen" onClick={() => setRefresh((value) => value + 1)}>重试</button>
          </div>
        ) : articles.length === 0 ? (
          <div className="news-message">
            <p>{filtered ? '没有符合条件的新闻，请调整筛选' : '暂无新闻，请等待首次抓取完成'}</p>
            {page > 1 && <button type="button" className="news-listen" onClick={() => handlePageChange(1)}>返回第 1 页</button>}
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
                  <h2 id="more-headlines">更多新闻</h2>
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

            <NewsPagination key={pagination.page} {...pagination} onChange={handlePageChange} />
          </>
        )}
      </div>
      </div>
      <HotSidebar />
    </div>
  );
}
