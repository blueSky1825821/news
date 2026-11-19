import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api.js';

import WechatPublication from './WechatPublication.jsx';
import { copyWechatPublication, formatWechatPublication } from '../services/wechatPublication.js';

export default function PushNews({ user, isLoading }) {
  const { id } = useParams();
  const [push, setPush] = useState(null);
  const [error, setError] = useState('');
  const [wechatEnabled, setWechatEnabled] = useState(false);
  const [activeTab, setActiveTab] = useState('list'); // 'list' | 'wechat'
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.getWechatLoginStatus().then((data) => setWechatEnabled(data.enabled)).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setPush(null);
    setError('');
    setActiveTab('list');
    api.getWechatPush(id).then((data) => { if (active) setPush(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id]);

  const listUrl = new URL(window.location.pathname, window.location.origin).href;

  const handleCopyText = useCallback(async () => {
    if (!push?.articles?.length) return;
    const { text } = formatWechatPublication({ articles: push.articles });
    try {
      await copyWechatPublication({ text });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('复制失败，可在公众号排版中下载纯文本。');
    }
  }, [push]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
        <Link to="/" className="inline-block rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200">返回首页</Link>
      </div>
    );
  }

  if (!push) {
    return <div className="mx-auto max-w-3xl px-4 py-8 text-center text-gray-500">正在加载推送内容...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{push.title}</h1>
          <p className="mt-1 text-sm text-gray-500">
            共 {push.articles.length} 篇 · {push.createdAt ? new Date(push.createdAt).toLocaleString('zh-CN') : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!user && !isLoading && wechatEnabled && (
            <a
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              href={`/news/api/wechat/auth/start?returnTo=${encodeURIComponent(`/push/${id}`)}`}
            >
              微信登录
            </a>
          )}
          <Link to="/" className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
            返回首页
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-4 py-2.5 text-sm font-medium ${activeTab === 'list' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          文章列表
        </button>
        <button
          onClick={() => setActiveTab('wechat')}
          className={`px-4 py-2.5 text-sm font-medium ${activeTab === 'wechat' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          公众号排版预览
        </button>
      </div>

      {/* Tab: Article List */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">以下文章保留推送时的标题与摘要</p>
            <div className="flex gap-2">
              <button
                onClick={handleCopyText}
                className="flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                {copied ? '已复制!' : '复制纯文本'}
              </button>
              <button
                onClick={() => setActiveTab('wechat')}
                className="flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                公众号排版
              </button>
            </div>
          </div>

          {push.articles.map((article, index) => (
            <article key={article.id} className="rounded-lg border bg-white p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-gray-900">
                    <Link to={`/article/${article.id}`} className="hover:text-blue-600">
                      {article.title}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-gray-400">{article.sourceName}</p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600">
                    {article.summary}
                  </p>
                  <div className="mt-3 flex items-center gap-4">
                    <Link to={`/article/${article.id}`} className="text-sm text-blue-600 hover:underline">
                      查看详情
                    </Link>
                    {/^https?:\/\//i.test(article.originalUrl || '') && (
                      <a href={article.originalUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                        阅读原文
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {activeTab === 'wechat' && (
        <WechatPublication key={push.id} title={push.title} articles={push.articles}
          url={listUrl} />
      )}
    </div>
  );
}
