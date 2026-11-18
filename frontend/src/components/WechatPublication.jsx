import { useRef, useState } from 'react';
import { copyWechatPublication, formatWechatPublication, publicationUrl } from '../services/wechatPublication.js';

export default function WechatPublication({ title, articles, url, createdAt }) {
  const [message, setMessage] = useState('');
  const preview = useRef(null);
  const titleField = useRef(null);
  const linkField = useRef(null);
  const listUrl = publicationUrl(url);
  const publication = formatWechatPublication({ title, articles, url: listUrl, createdAt });

  async function copy(content, success, fallbackField) {
    try {
      await copyWechatPublication(content);
      setMessage(success);
    } catch {
      if (fallbackField) {
        fallbackField.focus();
        fallbackField.select();
      } else {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(preview.current);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setMessage('浏览器未允许自动复制，已选中内容，请按 Ctrl+C 或 ⌘C 复制。');
    }
  }

  function downloadText() {
    const fileUrl = URL.createObjectURL(new Blob([publication.text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = '公众号新闻稿.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(fileUrl), 1_000);
  }

  return (
    <section className="space-y-4" aria-label="公众号排版">
      <div>
        <label className="block text-sm font-medium text-gray-700">
          公众号标题
          <input ref={titleField} aria-label="公众号标题" readOnly value={title} onFocus={(event) => event.target.select()}
            className="mt-1 block w-full rounded border bg-white px-3 py-2 text-sm" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="rounded bg-blue-700 px-4 py-2 text-sm text-white"
          onClick={() => copy(publication, '已复制带排版的正文，请粘贴到微信公众平台的正文编辑区。')}>
          复制排版正文
        </button>
        <button type="button" className="rounded bg-gray-100 px-3 py-2 text-sm"
          onClick={() => copy({ text: title }, '已复制标题。', titleField.current)}>复制标题</button>
        <button type="button" className="rounded bg-gray-100 px-3 py-2 text-sm" onClick={downloadText}>下载纯文本</button>
      </div>
      <div className="rounded border border-gray-200 bg-white p-4 sm:p-6" aria-label="正文预览">
        <div ref={preview} className="mx-auto max-w-2xl" dangerouslySetInnerHTML={{ __html: publication.html }} />
      </div>
      {listUrl && (
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            固定新闻列表链接
            <input ref={linkField} aria-label="固定新闻列表链接" readOnly value={listUrl} onFocus={(event) => event.target.select()}
              className="mt-1 block w-full rounded border bg-white px-3 py-2 text-sm" />
          </label>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button type="button" className="rounded bg-gray-100 px-3 py-2"
              onClick={() => copy({ text: listUrl }, '已复制固定新闻列表链接。', linkField.current)}>
              复制列表链接
            </button>
            <a href={listUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">打开列表</a>
          </div>
        </div>
      )}
      {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
    </section>
  );
}
