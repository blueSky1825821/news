import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { prepareArticleContent } from '../services/articleContent.js';
import { api } from '../services/api.js';
import XinwenlianboHeadlines from './XinwenlianboHeadlines.jsx';
import { readNewsOutline } from '../services/newsHeadlines.js';
import LikeButton from './LikeButton.jsx';
import CommentSection from './CommentSection.jsx';
import InvestmentAnalysis from './InvestmentAnalysis.jsx';

export default function NewsDetail({ user, onPlaySingle, isAdmin = false, massSendEnabled = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const goBack = () => window.history.state?.idx > 0 ? navigate(-1) : navigate('/');
  const [isFlagged, setIsFlagged] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.getArticle(id, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setArticle(data);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message || '加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, attempt, user?.id]);

  useEffect(() => {
    setIsFlagged(false);
    if (!article?.id || !isAdmin) return;
    let current = true;
    api.getFlaggedArticleIds().then((data) => {
      if (current) setIsFlagged(data.articleIds?.includes(article.id) || false);
    }).catch(() => {});
    return () => { current = false; };
  }, [article?.id, isAdmin]);

  const handleToggleFlag = async () => {
    try {
      const result = await api.toggleFlagArticle(article.id);
      setIsFlagged(result.flagged);
    } catch (err) {
      alert('标记失败：' + err.message);
    }
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const draft = await api.createWechatPush([article.id]);
      const result = await api.sendWechatPush(draft.id, true);
      if (result.status === 'skipped') {
        alert('暂无文章可推送，请先抓取新闻');
      } else {
        alert(`预览推送已发送（共 ${result.totalCount || 0} 篇，推送前 ${result.pushedCount || 0} 篇），请检查微信公众号`);
      }
    } catch (err) {
      alert('预览推送失败：' + err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const headlines = readNewsOutline(article?.headlines, article?.transcript || article?.summary);
  const html = useMemo(() => prepareArticleContent(article?.content, article?.originalUrl), [article?.content, article?.originalUrl]);

  if (loading) {
    return (
      <div className="news-reading">
        <div role="status" className="news-message">正在加载文章…</div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="news-reading">
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error || '文章不存在'}
        </div>
        <button type="button" className="news-listen mr-3" onClick={() => setAttempt(value => value + 1)}>重试</button>
        <button
          onClick={goBack}
          className="mt-4 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="news-reading">
      <button
        onClick={goBack}
        className="mb-4 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
      >
        返回列表
      </button>

      <div className="flex items-center gap-2">
        <h1 className="text-gray-900">{article.title}</h1>
        {isAdmin && <button onClick={handleToggleFlag} className="text-xl" title={isFlagged ? '取消标记' : '标记为重要'}>
          {isFlagged ? '★' : '☆'}
        </button>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-500">
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
          {article.sourceName}
        </span>
        <span>
          {article.publishedAt ? new Date(article.publishedAt).toLocaleString('zh-CN') : ''}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => onPlaySingle?.(article, 'title')} className="news-action">
          播报标题
        </button>
        <button type="button"
          onClick={() => onPlaySingle?.(article, 'full')}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          播报全文
        </button>
        <a
          href={article.originalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          查看原文
        </a>
        <button type="button" className="news-action" onClick={() => {
          const comments = document.getElementById('article-comments');
          comments?.focus({ preventScroll: true });
          comments?.scrollIntoView({ block: 'start' });
        }}>查看评论</button>
        {isAdmin && massSendEnabled && <button
          onClick={handlePreview}
          disabled={previewLoading}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {previewLoading ? '推送中...' : '推送到公众号预览'}
        </button>}
      </div>

      {article.category === 'xinwenlianbo' && headlines.length > 0 && (
        <div className="mb-4 rounded-lg bg-red-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-red-800">今日要闻</h3>
          <XinwenlianboHeadlines headlines={headlines} className="list-decimal pl-5 text-sm text-red-700" />
        </div>
      )}

      <div className="news-reading-body mt-6">
        {article.content ? (
          <div
            className="prose max-w-none text-gray-800"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
            该文章暂无正文内容，请
            <a
              href={article.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-amber-700 underline"
            >
              查看原文
            </a>
            。
          </div>
        )}
      </div>

      {article.category === 'xinwenlianbo' && article.transcript && article.transcript !== article.summary && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
            查看新闻正文
          </summary>
          <div className="mt-2 max-h-96 overflow-y-auto rounded bg-gray-50 p-4 text-sm text-gray-600">
            {article.transcript}
          </div>
        </details>
      )}

      {article.category === 'xinwenlianbo' && (
        <InvestmentAnalysis key={article.id} articleId={article.id} isAdmin={isAdmin} />
      )}

      <div className="mt-6 flex items-center gap-4">
        <LikeButton article={article} user={user} />
      </div>

      <CommentSection articleId={article.id} user={user} />
    </div>
  );
}
