import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api.js';

export default function SourceManager() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activatingIds, setActivatingIds] = useState(new Set());
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [crawlingIds, setCrawlingIds] = useState(new Set());
  const [crawlingAll, setCrawlingAll] = useState(false);
  const [threshold, setThreshold] = useState(5);
  const [thresholdLoading, setThresholdLoading] = useState(false);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSourceHealth();
      setSources(data || []);
    } catch (err) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchThreshold = async () => {
    try {
      const data = await api.getFailureThreshold();
      if (data?.threshold) {
        setThreshold(data.threshold);
      }
    } catch (err) {
      console.error('加载阈值失败:', err);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchThreshold();
  }, []);

  const handleActivate = async (id) => {
    setActivatingIds((prev) => new Set(prev).add(id));
    try {
      await api.activateSource(id);
      await fetchHealth();
    } catch (err) {
      alert('激活失败：' + err.message);
    } finally {
      setActivatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleActivateAll = async () => {
    const inactive = sources.filter((s) => !s.isActive);
    if (inactive.length === 0) return;

    const ids = inactive.map((s) => s.id);
    setActivatingIds((prev) => new Set([...prev, ...ids]));
    try {
      await Promise.all(ids.map((id) => api.activateSource(id)));
      await fetchHealth();
    } catch (err) {
      alert('批量激活失败：' + err.message);
    } finally {
      setActivatingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  const handleCrawl = async (id) => {
    setCrawlingIds((prev) => new Set(prev).add(id));
    try {
      const result = await api.triggerCrawlForSource(id);
      alert(`"${result.source}" 抓取完成，新增 ${result.count} 篇文章`);
    } catch (err) {
      alert('抓取失败：' + err.message);
    } finally {
      setCrawlingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleCrawlAll = async () => {
    setCrawlingAll(true);
    try {
      const data = await api.triggerCrawl();
      if (!data || !Array.isArray(data.results)) {
        alert('抓取完成，但返回数据异常');
        return;
      }
      const lines = [
        `新增 ${data.total || 0} 篇文章`,
        ...data.results.map((r) => {
          if (r.error) return `❌ ${r.source}: ${r.error}`;
          return `✅ ${r.source}: ${r.count} 篇`;
        }),
      ];
      alert(lines.join('\n'));
    } catch (err) {
      alert('全部抓取失败：' + (err.message || '未知错误'));
    } finally {
      setCrawlingAll(false);
    }
  };

  const handleDelete = async (source) => {
    const confirmed = window.confirm(
      `确定删除来源 "${source.name}" 吗？\n该来源下的所有已抓取文章也会被一并删除，此操作不可恢复。`
    );
    if (!confirmed) return;

    setDeletingIds((prev) => new Set(prev).add(source.id));
    try {
      await api.deleteSource(source.id);
      await fetchHealth();
    } catch (err) {
      alert('删除失败：' + err.message);
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(source.id);
        return next;
      });
    }
  };

  const handleUpdateThreshold = async () => {
    const value = parseInt(threshold, 10);
    if (!Number.isFinite(value) || value < 1) {
      alert('阈值必须是大于等于 1 的整数');
      return;
    }
    setThresholdLoading(true);
    try {
      const data = await api.setFailureThreshold(value);
      setThreshold(data.threshold);
      alert('阈值已保存');
    } catch (err) {
      alert('保存失败：' + err.message);
    } finally {
      setThresholdLoading(false);
    }
  };

  const inactiveCount = sources.filter((s) => !s.isActive).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">来源健康管理</h1>
          <p className="mt-1 text-sm text-gray-500">
            连续失败达到阈值的来源会自动停用，可在此重新激活或删除来源
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            返回首页
          </Link>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '刷新中...' : '刷新'}
          </button>
          <button
            onClick={handleCrawlAll}
            disabled={crawlingAll}
            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {crawlingAll ? '抓取中...' : '全部抓取'}
          </button>
        </div>
      </div>

      {inactiveCount > 0 && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-yellow-800">
              当前有 {inactiveCount} 个来源处于停用状态
            </span>
            <button
              onClick={handleActivateAll}
              className="rounded-md bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700"
            >
              全部重新激活
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-600">
          加载失败：{error}
        </div>
      )}

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label htmlFor="threshold" className="block text-sm font-medium text-gray-700">
              自动停用阈值
            </label>
            <p className="text-xs text-gray-500">
              来源连续失败多少次后自动停用（最小 1）
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              id="threshold"
              type="number"
              min={1}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleUpdateThreshold}
              disabled={thresholdLoading}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {thresholdLoading ? '保存中...' : '保存阈值'}
            </button>
          </div>
        </div>
      </div>

      {loading && sources.length === 0 ? (
        <div className="py-12 text-center text-gray-500">加载中...</div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  来源
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  状态
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  连续失败
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  最后错误
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sources.map((source) => (
                <tr key={source.id} className={!source.isActive ? 'bg-red-50' : ''}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900">{source.name}</div>
                    <div className="max-w-xs truncate text-xs text-gray-500">{source.rssUrl}</div>
                  </td>
                  <td className="px-4 py-3">
                    {source.isActive ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                        活跃
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                        已停用
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {source.consecutiveFailures || 0}
                  </td>
                  <td className="px-4 py-3">
                    {source.lastError ? (
                      <div className="max-w-xs">
                        <div className="truncate text-sm text-red-600" title={source.lastError}>
                          {source.lastError}
                        </div>
                        <div className="text-xs text-gray-400">
                          {source.lastErrorAt ? new Date(source.lastErrorAt).toLocaleString('zh-CN') : '-'}
                        </div>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleCrawl(source.id)}
                        disabled={crawlingIds.has(source.id) || !source.isActive}
                        className="rounded-md bg-green-100 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-200 disabled:opacity-50"
                      >
                        {crawlingIds.has(source.id) ? '抓取中...' : '抓取'}
                      </button>
                      {!source.isActive && (
                        <button
                          onClick={() => handleActivate(source.id)}
                          disabled={activatingIds.has(source.id)}
                          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {activatingIds.has(source.id) ? '激活中...' : '重新激活'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(source)}
                        disabled={deletingIds.has(source.id)}
                        className="rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
                      >
                        {deletingIds.has(source.id) ? '删除中...' : '删除'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
