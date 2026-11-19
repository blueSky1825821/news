import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { api } from '../services/api.js';
import LikeButton from './LikeButton.jsx';
import CommentSection from './CommentSection.jsx';

const ALLOWED_TAGS = [
  'p', 'br', 'img', 'a', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'strong', 'em', 'ul', 'ol',
  'li', 'video', 'source', 'iframe', 'div', 'span'
];

const IFRAME_WHITELIST = [
  'bilibili.com',
  'player.bilibili.com',
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'youku.com',
  'player.youku.com',
  'iqiyi.com',
  'player.iqiyi.com',
  'v.qq.com',
  'open.iqiyi.com'
];

function isIframeAllowed(src) {
  if (!src) return false;
  try {
    const url = new URL(src);
    return IFRAME_WHITELIST.some((domain) => url.hostname.endsWith(domain));
  } catch {
    return false;
  }
}

function extractPlainText(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

export default function NewsDetail({ user, onPlaySingle, isAdmin = false, massSendEnabled = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFlagged, setIsFlagged] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.getArticle(id)
      .then((data) => {
        if (!cancelled) setArticle(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!article || !isAdmin) { setIsFlagged(false); return; }
    api.getFlaggedArticleIds().then((data) => {
      setIsFlagged(data.articleIds?.includes(article.id) || false);
    }).catch(() => {});
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

  if (loading) {
    return (
      <div className="news-reading">
        <div className="text-center text-gray-500">加载中...</div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="news-reading">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error || '文章不存在'}
        </div>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          返回列表
        </button>
      </div>
    );
  }

  const cleanHtml = DOMPurify.sanitize(article.content || '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'width', 'height', 'frameborder', 'allowfullscreen', 'controls', 'type'],
    KEEP_CONTENT: true
  });

  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanHtml, 'text/html');
  doc.querySelectorAll('iframe').forEach((iframe) => {
    const src = iframe.getAttribute('src');
    if (!isIframeAllowed(src)) {
      iframe.remove();
    }
  });
  doc.querySelectorAll('img').forEach((img) => {
    img.setAttribute('referrerpolicy', 'no-referrer');
  });
  const finalHtml = doc.body.innerHTML;

  const plainText = extractPlainText(article.content);

  return (
    <div className="news-reading">
      <button
        onClick={() => navigate(-1)}
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
        <button
          onClick={() => onPlaySingle && onPlaySingle(plainText)}
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
        {isAdmin && massSendEnabled && <button
          onClick={handlePreview}
          disabled={previewLoading}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {previewLoading ? '推送中...' : '推送到公众号预览'}
        </button>}
      </div>

      {article.category === 'xinwenlianbo' && article.headlines && (
        <div className="mb-4 rounded-lg bg-red-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-red-800">今日要闻</h3>
          <ol className="list-decimal pl-5 text-sm text-red-700">
            {(() => {
              try {
                return JSON.parse(article.headlines || '[]').map((h, i) => (
                  <li key={i}>{h}</li>
                ));
              } catch {
                return null;
              }
            })()}
          </ol>
        </div>
      )}

      <div className="news-reading-body mt-6">
        {article.content ? (
          <div
            className="prose max-w-none text-gray-800"
            dangerouslySetInnerHTML={{ __html: finalHtml }}
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

      {article.category === 'xinwenlianbo' && article.transcript && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
            查看完整转录文字
          </summary>
          <div className="mt-2 max-h-96 overflow-y-auto rounded bg-gray-50 p-4 text-sm text-gray-600">
            {article.transcript}
          </div>
        </details>
      )}

      <div className="mt-6 flex items-center gap-4">
        <LikeButton articleId={article.id} user={user} />
      </div>

      <CommentSection articleId={article.id} user={user} />
    </div>
  );
}
