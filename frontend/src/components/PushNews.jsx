import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api.js';

function generateWechatHtml(push) {
  if (!push?.articles?.length) return '';
  const today = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });
  const articles = push.articles;

  const articleSections = articles.map((article, index) => {
    const num = index + 1;
    const title = (article.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const summary = (article.summary || '暂无摘要')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
    const source = (article.sourceName || '未知来源').replace(/</g, '&lt;');
    const url = (article.originalUrl || '').replace(/"/g, '&quot;');

    return `
<section style="margin-bottom:28px;padding:16px;background:#fafbfc;border-radius:8px;border:1px solid #e8e8e8;">
  <p style="margin:0 0 10px 0;font-size:17px;font-weight:bold;color:#1a1a1a;line-height:1.5;">
    <span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;background:#07c160;color:#fff;border-radius:50%;font-size:14px;margin-right:8px;vertical-align:middle;">${num}</span>
    <span style="vertical-align:middle;">${title}</span>
  </p>
  <p style="margin:0 0 8px 0;font-size:13px;color:#888;">来源：${source}</p>
  <p style="margin:0 0 12px 0;font-size:15px;color:#333;line-height:1.7;">${summary}</p>
  <p style="margin:0;">
    <a href="${url}" style="color:#576b95;font-size:14px;text-decoration:none;" target="_blank">👉 阅读原文</a>
  </p>
</section>`;
  }).join('\n');

  return `<section style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;line-height:1.8;max-width:680px;margin:0 auto;padding:16px;">
  <p style="text-align:center;margin:0 0 8px 0;">
    <span style="font-size:28px;">📰</span>
  </p>
  <h2 style="text-align:center;margin:0 0 8px 0;font-size:20px;font-weight:bold;color:#1a1a1a;">${push.title || '今日新闻精选'}</h2>
  <p style="text-align:center;margin:0 0 24px 0;font-size:13px;color:#888;">${today} · 共 ${articles.length} 篇</p>
  <p style="margin:0 0 20px 0;font-size:15px;color:#555;line-height:1.7;">以下是为您精选的今日新闻，点击标题下方链接可查看原文。</p>
  ${articleSections}
  <section style="margin-top:32px;padding-top:20px;border-top:1px solid #e8e8e8;text-align:center;">
    <p style="margin:0 0 8px 0;font-size:13px;color:#999;">— 本文由 AI 新闻播报系统自动生成 —</p>
    <p style="margin:0;font-size:13px;color:#bbb;">更多精彩内容，敬请期待</p>
  </section>
</section>`;
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  return new Promise((resolve, reject) => {
    try {
      document.execCommand('copy');
      resolve();
    } catch (err) {
      reject(err);
    } finally {
      document.body.removeChild(textarea);
    }
  });
}

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

  const handleCopy = useCallback(async () => {
    const html = generateWechatHtml(push);
    try {
      await copyToClipboard(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('复制失败，请手动复制');
    }
  }, [push]);

  const handleCopyText = useCallback(async () => {
    if (!push?.articles?.length) return;
    const lines = [
      `📰 ${push.title || '今日新闻精选'}`,
      `${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })} · 共 ${push.articles.length} 篇`,
      '',
      ...push.articles.map((a, i) => {
        const s = a.summary ? `\n${a.summary}` : '';
        const u = a.originalUrl ? `\n阅读原文：${a.originalUrl}` : '';
        return `${i + 1}. ${a.title}${s}${u}`;
      }),
      '',
      '— 本文由 AI 新闻播报系统自动生成 —'
    ];
    try {
      await copyToClipboard(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('复制失败，请手动复制');
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

  const wechatHtml = generateWechatHtml(push);

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

      {/* Tab: WeChat Preview */}
      {activeTab === 'wechat' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-blue-50 p-4">
            <div>
              <p className="text-sm font-medium text-blue-800">公众号排版预览</p>
              <p className="text-xs text-blue-600">点击下方按钮复制 HTML，粘贴到微信公众号编辑器中</p>
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
              {copied ? '已复制!' : '复制公众号 HTML'}
            </button>
          </div>

          {/* Live Preview */}
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-4 py-2 text-xs text-gray-400">预览效果</div>
            <div className="p-4">
              <div
                className="mx-auto max-w-[680px]"
                dangerouslySetInnerHTML={{ __html: wechatHtml }}
              />
            </div>
          </div>

          {/* Raw HTML for advanced users */}
          <details className="rounded-lg border border-gray-200 bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50">
              查看原始 HTML 代码
            </summary>
            <div className="border-t border-gray-100">
              <textarea
                readOnly
                value={wechatHtml}
                className="h-64 w-full resize-y bg-gray-50 p-4 font-mono text-xs text-gray-700 focus:outline-none"
              />
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
