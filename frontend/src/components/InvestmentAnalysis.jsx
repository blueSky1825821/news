import React, { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function InvestmentAnalysis({ articleId, isAdmin }) {
  const [reports, setReports] = useState(null);
  const [models, setModels] = useState(null);
  const [modelId, setModelId] = useState('');
  const [selectedReport, setSelectedReport] = useState('');
  const [busy, setBusy] = useState(false);
  const [readError, setReadError] = useState('');
  const [modelError, setModelError] = useState('');
  const [generationError, setGenerationError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api.getInvestmentAnalyses(articleId, { signal: controller.signal })
      .then(setReports)
      .catch(err => { if (!controller.signal.aborted) setReadError(err.message); });
    if (isAdmin) {
      api.getInvestmentAnalysisModels({ signal: controller.signal })
        .then(data => {
          setModels(data);
          setModelId(data[0]?.id ?? '');
        })
        .catch(err => { if (!controller.signal.aborted) setModelError(err.message); });
    }
    return () => controller.abort();
  }, [articleId, isAdmin]);

  async function generate(event) {
    event.preventDefault();
    setBusy(true);
    setGenerationError('');
    try {
      const result = await api.generateInvestmentAnalysis(articleId, modelId);
      setReports(current => [result, ...(current ?? []).filter(item => item.modelId !== result.modelId)]);
      setSelectedReport(result.modelId);
      setReadError('');
    } catch (err) {
      setGenerationError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const report = reports?.find(item => item.modelId === selectedReport) ?? reports?.[0];

  return (
    <section className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4" aria-label="投资分析">
      <h2 className="text-lg font-semibold text-gray-900">投资分析</h2>
      {isAdmin && models?.length > 0 && (
        <form onSubmit={generate} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-sm text-gray-700">
            生成模型
            <select value={modelId} onChange={event => setModelId(event.target.value)} disabled={busy}
              className="rounded-md border border-gray-300 bg-white px-2 py-2">
              {models.map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
            </select>
          </label>
          <button type="submit" disabled={busy || !modelId || (!reports && !readError)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? '正在生成…' : reports?.some(item => item.modelId === modelId) ? '重新生成' : '生成分析'}
          </button>
        </form>
      )}
      {isAdmin && models?.length === 0 && <p className="mt-2 text-sm text-gray-600">后端尚未配置可用的分析模型。</p>}
      {isAdmin && modelError && <p role="alert" className="mt-2 text-sm text-red-700">{modelError}</p>}
      {generationError && <p role="alert" className="mt-2 text-sm text-red-700">{generationError}</p>}
      {readError && <p role="alert" className="mt-2 text-sm text-red-700">{readError}</p>}
      {!reports && !readError && <p role="status" className="mt-2 text-sm text-gray-600">正在加载分析…</p>}
      {reports?.length === 0 && <p className="mt-2 text-sm text-gray-600">本期暂无投资分析。</p>}
      {report && (
        <div className="mt-3">
          {reports.length > 1 && (
            <label className="mb-2 block text-sm text-gray-700">
              查看模型
              <select className="ml-2 rounded-md border border-gray-300 bg-white px-2 py-1"
                value={report.modelId} onChange={event => setSelectedReport(event.target.value)}>
                {reports.map(item => <option key={item.modelId} value={item.modelId}>{item.modelLabel}</option>)}
              </select>
            </label>
          )}
          <p className="mb-3 text-xs text-gray-600">
            AI 生成 · {report.modelLabel} · {new Date(report.generatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）
          </p>
          <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">{report.content}</div>
        </div>
      )}
    </section>
  );
}
