import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../services/api.js';

export default function PushNews({ user, isLoading }) {
  const { id } = useParams();
  const [push, setPush] = useState(null);
  const [error, setError] = useState('');
  const [wechatEnabled, setWechatEnabled] = useState(false);
  useEffect(() => {
    api.getWechatLoginStatus().then((data) => setWechatEnabled(data.enabled)).catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    setPush(null);
    setError('');
    api.getWechatPush(id).then((data) => { if (active) setPush(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [id]);
  return <div className="mx-auto max-w-3xl space-y-4">
    {error && <p className="text-red-600">{error}</p>}
    {!push && !error && <p>正在加载新闻...</p>}
    {push && <>
      <h1 className="text-2xl font-bold">{push.title}</h1>
      <p className="text-sm text-gray-500">共 {push.articles.length} 篇 · 此列表保留推送时的标题与摘要</p>
      {!user && !isLoading && wechatEnabled && <a className="inline-block rounded bg-green-600 px-4 py-2 text-white" href={`/news/api/wechat/auth/start?returnTo=${encodeURIComponent(`/push/${id}`)}`}>微信登录</a>}
      {push.articles.map((article, index) => <article key={article.id} className="rounded-lg border bg-white p-5">
        <h2 className="text-lg font-semibold"><Link to={`/article/${article.id}`}>{index + 1}. {article.title}</Link></h2>
        <p className="mt-2 text-sm text-gray-500">{article.sourceName}</p>
        <p className="mt-3 whitespace-pre-line text-gray-700">{article.summary}</p>
        <Link to={`/article/${article.id}`} className="mt-3 inline-block text-blue-600">查看详情</Link>
        {/^https?:\/\//i.test(article.originalUrl || '') && <a href={article.originalUrl} target="_blank" rel="noreferrer" className="ml-4 text-blue-600">阅读原文</a>}
      </article>)}
    </>}
  </div>;
}
