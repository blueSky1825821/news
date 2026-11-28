import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';
import WechatAutoPublish from './WechatAutoPublish.jsx';
import WechatPushManager from './WechatPushManager.jsx';

export default function WechatSettings() {
  const [settings, setSettings] = useState({
    appId: '',
    appSecret: '',
    previewOpenId: '',
    summaryPushEnabled: false,
    summaryPushCron: '0 8 * * *'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.getWechatSettings()
      .then((data) => {
        if (data) {
          setSettings((prev) => ({ ...prev, ...data, appSecret: '', summaryPushEnabled: !!data.summaryPushEnabled }));
        }
      })
      .catch((err) => alert('加载配置失败：' + err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await api.setWechatSettings({
        appId: settings.appId,
        appSecret: settings.appSecret,
        previewOpenId: settings.previewOpenId,
        summaryPushEnabled: !!settings.massSendEnabled && !!settings.summaryPushEnabled,
        summaryPushCron: settings.summaryPushCron
      });
      setSettings((prev) => ({ ...prev, ...data, appSecret: '', summaryPushEnabled: !!data.summaryPushEnabled }));
      alert('配置已保存');
    } catch (err) {
      alert('保存失败：' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const loadPreview = async () => {
    setPreviewLoading(true);
    try {
      const data = await api.getPreviewContent();
      setPreview(data);
    } catch (err) {
      alert('加载预览失败：' + err.message);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSendPreview = async () => {
    if (!settings.previewOpenId) {
      alert('请先配置预览目标 OpenID');
      return;
    }
    setSending(true);
    try {
      const result = await api.sendPreview();
      alert(`预览已发送！共 ${result.totalCount} 篇，推送 ${result.pushedCount} 篇`);
    } catch (err) {
      alert('发送预览失败：' + err.message);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="py-12 text-center text-gray-500">加载中...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">公众号后台</h1>
        <Link to="/" className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">
          返回首页
        </Link>
      </div>

      <div className="mb-6 space-y-2 rounded-lg border bg-white p-4 text-sm">
        <p>平台入口：{settings.entryUrl ? <a className="break-all text-blue-600" href={settings.entryUrl}>{settings.entryUrl}</a> : '待设置服务端 PUBLIC_BASE_URL'}</p>
        {!settings.oauthEnabled && <p className="text-gray-600">当前未开启微信网页授权，用户可直接浏览新闻，或使用邮箱登录。</p>}
        {!settings.massSendEnabled && <p className="text-gray-600">未认证订阅号使用手动发布模式：在下方生成新闻内容与列表链接，再到微信公众平台手动发布。无需 AppSecret 即可生成分享内容。</p>}
        {settings.oauthEnabled && <p className="text-gray-500">在微信公众平台配置网页授权域名及服务器 IP 白名单。将上方入口用于公众号网页授权登录。</p>}
      </div>

      <details open={!!settings.oauthEnabled || !!settings.massSendEnabled}>
      <summary className="mb-4 cursor-pointer text-sm font-medium text-gray-600">公众号接口配置（取得对应权限后使用）</summary>
      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700">AppID</label>
          <input
            type="text"
            name="appId"
            value={settings.appId || ''}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="wx1234567890abcdef"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">AppSecret</label>
          <input
            type="password"
            name="appSecret"
            value={settings.appSecret || ''}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder={settings.appSecretConfigured ? '已配置，留空保留原密钥' : '请输入 AppSecret'}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">预览目标 OpenID</label>
          <input
            type="text"
            name="previewOpenId"
            value={settings.previewOpenId || ''}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="o1234567890abcdef"
          />
          <p className="mt-1 text-xs text-gray-500">点击"推送到公众号预览"时，消息会发送到这个微信号的公众号会话中</p>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            name="summaryPushEnabled"
            disabled={!settings.massSendEnabled}
            checked={!!settings.massSendEnabled && !!settings.summaryPushEnabled}
            onChange={handleChange}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label className="text-sm font-medium text-gray-700">启用定时汇总推送</label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">定时推送 Cron</label>
          <input
            type="text"
            name="summaryPushCron"
            value={settings.summaryPushCron || '0 8 * * *'}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder="0 8 * * *"
          />
          <p className="mt-1 text-xs text-gray-500">默认每天早上 8:00，格式为 cron 表达式</p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存配置'}
        </button>
      </form>
      </details>

      <section className="mt-8 space-y-3 rounded-lg border bg-white p-6">
        <h2 className="text-lg font-semibold">微信公众平台登录</h2>
        <p className="text-sm text-gray-600">保存公众号草稿前可先扫码登录。草稿保存后，可在微信公众平台手动发表。</p>
        <WechatAutoPublish loginOnly />
      </section>
      <WechatPushManager massSendEnabled={settings.massSendEnabled} />

      {settings.massSendEnabled && <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">推送内容预览</h2>
          <div className="flex gap-2">
            <button
              onClick={loadPreview}
              disabled={previewLoading}
              className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
            >
              {previewLoading ? '加载中...' : '刷新预览'}
            </button>
            <button
              onClick={handleSendPreview}
              disabled={sending}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {sending ? '发送中...' : '发送到公众号预览'}
            </button>
          </div>
        </div>

        {!preview && (
          <div className="py-8 text-center text-gray-500">
            <p className="mb-2">点击"刷新预览"查看今日即将推送的内容</p>
          </div>
        )}

        {preview && preview.status === 'skipped' && (
          <div className="py-8 text-center text-amber-600">
            <p>最近 24 小时内没有抓取到新闻，无法生成推送内容</p>
          </div>
        )}

        {preview && preview.status !== 'skipped' && (
          <div>
            <div className="mb-4 rounded-md bg-gray-50 p-4">
              <h3 className="text-base font-semibold text-gray-900">{preview.title}</h3>
              <p className="mt-1 text-sm text-gray-500">摘要：{preview.digest}</p>
              <p className="mt-1 text-xs text-gray-400">
                共 {preview.totalCount} 篇，将推送前 {preview.pushedCount} 篇
              </p>
            </div>

            <div className="space-y-2">
              {preview.topArticles.map((article, idx) => (
                <div key={article.id} className="flex items-start gap-2 rounded-md border border-gray-100 p-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {article.title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {article.sourceName} · {article.category}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {preview.totalCount > preview.pushedCount && (
              <p className="mt-4 text-center text-sm text-gray-500">
                还有 {preview.totalCount - preview.pushedCount} 篇文章未显示，将在"查看更多"中展示
              </p>
            )}
          </div>
        )}
      </div>}
    </div>
  );
}
