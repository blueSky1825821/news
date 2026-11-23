import { jest } from '@jest/globals';
import { CCTV_COLUMN, collectCctvNews } from '../src/services/xinwenlianbo/cctv.js';

const date = '2026-11-23';
const firstUrl = 'https://tv.cctv.com/2026/11/23/VIDEfirst.shtml';
const listing = `<ul id="content">
  <li><a href="/2026/11/22/VIDEold.shtml">《新闻联播》 20261122 19:00</a></li>
  <li><a href="/2026/11/23/VIDEstory.shtml">[视频]国内联播快讯</a></li>
  <li><a href="${firstUrl}?from=list"><i>完整版</i>《新闻联播》 20261123 19:00</a></li>
  <li><a href="/2026/11/23/VIDEsecond.shtml">《新闻联播》 20261123 21:00</a></li>
</ul>`;

it('reads only the first full episode and uses the available introduction template', async () => {
  const fetchPage = jest.fn()
    .mockResolvedValueOnce(new Response(listing))
    .mockResolvedValueOnce(new Response(`
      <div class="video_brief"></div>
      <div>视频简介</div><p>本期节目主要内容：<br>1.第一条新闻 &amp; 另一主题。</p>`));

  await expect(collectCctvNews(date, fetchPage)).resolves.toEqual({
    status: 'ready', originalUrl: firstUrl, text: '本期节目主要内容：\n1.第一条新闻 & 另一主题。'
  });
  expect(fetchPage.mock.calls.map(([url]) => url)).toEqual([CCTV_COLUMN, firstUrl]);
});

it('distinguishes an unpublished episode or introduction from an HTTP failure', async () => {
  const fetchPage = jest.fn()
    .mockResolvedValueOnce(new Response('<ul id="content"></ul>'))
    .mockResolvedValueOnce(new Response(listing))
    .mockResolvedValueOnce(new Response('<div class="video_brief"> </div>'))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));

  await expect(collectCctvNews(date, fetchPage)).resolves.toMatchObject({ status: 'pending', message: expect.stringContaining('完整版') });
  await expect(collectCctvNews(date, fetchPage)).resolves.toMatchObject({ status: 'pending', message: expect.stringContaining('内容简介') });
  await expect(collectCctvNews(date, fetchPage)).rejects.toThrow('HTTP 503');
});
