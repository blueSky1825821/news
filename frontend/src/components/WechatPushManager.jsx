import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import WechatPublication from './WechatPublication.jsx';
import WechatAutoPublish from './WechatAutoPublish.jsx';

export default function WechatPushManager({ massSendEnabled = false }) {
  const [articles, setArticles] = useState([]);
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState([]);
  const [draft, setDraft] = useState(null);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const categories = [...new Set(articles.map(article => article.category).filter(Boolean))]
    .sort((first, second) => first.localeCompare(second, 'zh-CN'));
  const activeCategory = categories.includes(category) ? category : '';
  const visibleArticles = activeCategory
    ? articles.filter(article => article.category === activeCategory)
    : articles;

  async function load() {
    setBusy(true);
    setError('');
    try {
      const [news, history] = await Promise.allSettled([api.getArticles({ limit: 100, view: 'card' }), api.getWechatPushLogs()]);
      if (news.status === 'fulfilled') setArticles(news.value.items);
      if (history.status === 'fulfilled') setLogs(history.value.logs);
      if (news.status === 'rejected' || history.status === 'rejected') {
        const failed = [
          news.status === 'rejected' && '新闻',
          history.status === 'rejected' && '推送记录'
        ].filter(Boolean);
        setError(`${failed.join('、')}加载失败，请刷新重试。`);
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);
  function select(id) {
    setSelected((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
    setDraft(null);
    setConfirmed(false);
    setSubmitted(false);
    setMessage('');
  }
  async function prepare() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.createWechatPush(selected);
      setDraft(result);
      setConfirmed(false);
      setSubmitted(false);
      return result;
    } catch (err) {
      setError(err.message);
      return null;
    }
    finally { setBusy(false); }
  }
  async function send(preview) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api.sendWechatPush(draft.id, preview);
      setMessage(`微信已受理${preview ? '预览' : '群发'}，消息 ID：${result.msgId}。受理不代表所有用户已收到。`);
    } catch (err) { setError(err.message); }
    finally {
      if (!preview) setSubmitted(true);
      try { setLogs((await api.getWechatPushLogs()).logs); } catch { /* retain prior history */ }
      setBusy(false);
    }
  }
  return <section className="mt-8 space-y-4 rounded-lg border bg-white p-6">
    <h2 className="text-lg font-semibold">{massSendEnabled ? '主动推送新闻' : '生成公众号发布内容'}</h2>
    <p className="text-sm text-gray-600">选择 1 篇生成单条新闻，选择多篇生成固定新闻列表。{massSendEnabled ? '通过公众号接口发送标题和平台链接，实际发送受接口权限与额度限制。' : '生成后可复制只含新闻标题的正文。'}</p>
    <button onClick={load} disabled={busy} className="rounded bg-gray-100 px-3 py-2 text-sm">刷新新闻与记录</button>
    {categories.length > 0 && (
      <div role="group" aria-label="新闻标签筛选" className="flex flex-wrap gap-2">
        {['', ...categories].map(tag => (
          <button key={tag} type="button" onClick={() => setCategory(tag)} aria-pressed={activeCategory === tag}
            className={`rounded-full border px-3 py-1.5 text-sm ${activeCategory === tag
              ? 'border-blue-700 bg-blue-700 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-100'}`}>
            {tag || '全部标签'}
          </button>
        ))}
      </div>
    )}
    <p role="status" className="text-sm text-gray-500">最新 {articles.length} 篇 · 当前显示 {visibleArticles.length} 篇 · 已选 {selected.length} 篇</p>
    <div className="max-h-80 space-y-2 overflow-y-auto">
      {visibleArticles.map((article) => <label key={article.id} className="flex gap-3 rounded border p-3 text-sm">
        <input type="checkbox" disabled={busy} checked={selected.includes(article.id)} onChange={() => select(article.id)} />
        <span>{article.title}</span>
      </label>)}
    </div>
    {!articles.length && <p className="text-gray-500">暂无新闻，请先抓取来源。</p>}
    <button onClick={prepare} disabled={busy || !selected.length} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">生成内容与列表链接</button>
    {draft && <div className="space-y-3 rounded bg-gray-50 p-4">
      <WechatPublication key={draft.id} title={draft.title} articles={draft.topArticles}
        url={draft.url} />
      {massSendEnabled && <>
      <button onClick={() => send(true)} disabled={busy} className="rounded bg-gray-200 px-4 py-2 disabled:opacity-50">发送给预览 OpenID</button>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || submitted} onChange={(e) => setConfirmed(e.target.checked)} />确认向公众号全部关注者群发此内容</label>
      <button onClick={() => send(false)} disabled={busy || !confirmed || submitted} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50">{submitted ? '已提交，请核对记录' : '立即群发'}</button>
      </>}
    </div>}
    <WechatAutoPublish pushId={draft?.id} prepare={selected.length ? prepare : null} disabled={busy} />
    {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <h3 className="font-semibold">最近推送记录</h3>
    {!logs.length && <p className="text-sm text-gray-500">暂无记录</p>}
    <div className="max-h-64 space-y-2 overflow-y-auto">{logs.map((log) => <div key={log.id} className="border-t pt-2 text-sm">
      <p>{log.createdAt} · {log.pushType === 'preview' ? '预览' : '群发'} · {({ submitted: '微信已受理', success: '已提交', failed: '失败或待核对' })[log.status] || log.status}</p>
      {log.wxMessageId && <p>消息 ID：{log.wxMessageId}</p>}
      {log.errorMessage && <p className="text-red-600">{log.errorMessage}</p>}
    </div>)}</div>
  </section>;
}
