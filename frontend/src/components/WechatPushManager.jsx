import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function WechatPushManager({ massSendEnabled = false }) {
  const [articles, setArticles] = useState([]);
  const [selected, setSelected] = useState([]);
  const [draft, setDraft] = useState(null);
  const [logs, setLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  async function load() {
    setBusy(true);
    setError('');
    try {
      const [data, history] = await Promise.all([api.getArticles({ limit: 100 }), api.getWechatPushLogs()]);
      setArticles(data.items);
      setLogs(history.logs);
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
      setDraft(await api.createWechatPush(selected));
      setConfirmed(false);
      setSubmitted(false);
    } catch (err) { setError(err.message); }
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
  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.text);
      setMessage('已复制，可粘贴到微信公众平台发布。');
    } catch {
      setMessage('当前浏览器不支持自动复制，请在下方文本框中全选复制，或下载文本。');
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([draft.text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `news-${draft.id}.txt`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="mt-8 space-y-4 rounded-lg border bg-white p-6">
    <h2 className="text-lg font-semibold">{massSendEnabled ? '主动推送新闻' : '生成公众号发布内容'}</h2>
    <p className="text-sm text-gray-600">选择 1 篇生成单条新闻，选择多篇生成固定新闻列表。{massSendEnabled ? '通过公众号接口发送标题和平台链接，实际发送受接口权限与额度限制。' : '当前使用手动发布模式：生成内容后复制或下载，到微信公众平台自行发布。'}</p>
    <button onClick={load} disabled={busy} className="rounded bg-gray-100 px-3 py-2 text-sm">刷新新闻与记录</button>
    <p className="text-sm text-gray-500">最新 100 篇新闻，已选 {selected.length} 篇</p>
    <div className="max-h-80 space-y-2 overflow-y-auto">
      {articles.map((article) => <label key={article.id} className="flex gap-3 rounded border p-3 text-sm">
        <input type="checkbox" disabled={busy} checked={selected.includes(article.id)} onChange={() => select(article.id)} />
        <span>{article.title}</span>
      </label>)}
    </div>
    {!articles.length && <p className="text-gray-500">暂无新闻，请先抓取来源。</p>}
    <button onClick={prepare} disabled={busy || !selected.length} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">生成内容与列表链接</button>
    {draft && <div className="space-y-3 rounded bg-gray-50 p-4">
      <textarea aria-label="公众号发布内容" readOnly value={draft.text} rows={10} onFocus={(e) => e.target.select()} className="w-full rounded border p-3 text-sm" />
      <a href={draft.url} target="_blank" rel="noreferrer" className="block text-blue-600">打开固定新闻列表</a>
      <div className="flex gap-3"><button onClick={copy} className="rounded bg-blue-600 px-4 py-2 text-white">复制内容</button><button onClick={download} className="rounded bg-gray-200 px-4 py-2">下载文本</button></div>
      {!massSendEnabled && <p className="text-sm text-gray-600">生成内容不会向关注者发送消息。请登录微信公众平台，在账号允许的发布方式中手动使用这些标题和链接。</p>}
      {massSendEnabled && <>
      <button onClick={() => send(true)} disabled={busy} className="rounded bg-gray-200 px-4 py-2 disabled:opacity-50">发送给预览 OpenID</button>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || submitted} onChange={(e) => setConfirmed(e.target.checked)} />确认向公众号全部关注者群发此内容</label>
      <button onClick={() => send(false)} disabled={busy || !confirmed || submitted} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50">{submitted ? '已提交，请核对记录' : '立即群发'}</button>
      </>}
    </div>}
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
