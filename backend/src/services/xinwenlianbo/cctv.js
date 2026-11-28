export const CCTV_COLUMN = 'https://tv.cctv.com/lm/xwlb/';

const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”', mdash: '—' };

function plainText(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] !== '#') return Object.hasOwn(entities, entity) ? entities[entity] : match;
    const code = Number(entity.replace(/^#x/i, '0x').replace(/^#/, ''));
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  }).replace(/\s+/g, ' ').trim();
}

function findEpisodeUrl(html, date) {
  const list = html.match(/<ul\b[^>]*\bid=["']content["'][^>]*>([\s\S]*?)<\/ul>/i)?.[1] ?? '';
  const day = date.replaceAll('-', '/');
  const episodeDate = date.replaceAll('-', '');
  for (const [, href, label] of list.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = plainText(label.replace(/<i\b[^>]*>[\s\S]*?<\/i>/gi, '')).replace(/^\[视频\]\s*/, '');
    if (/^《新闻联播》\s*(\d{8})/.exec(title)?.[1] !== episodeDate) continue;
    if (!URL.canParse(href, CCTV_COLUMN)) continue;
    const url = new URL(href, CCTV_COLUMN);
    if (url.origin !== 'https://tv.cctv.com' || !url.pathname.startsWith(`/${day}/`) ||
        !/^VIDE[a-z\d]+\.shtml$/i.test(url.pathname.split('/').at(-1))) continue;
    return `${url.origin}${url.pathname}`;
  }
  return null;
}

async function fetchPage(url, fetchPageResponse) {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetchPageResponse(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`央视网请求失败（HTTP ${response.status}）`);
      return await response.text();
    } catch (err) {
      const connectTimeout = err.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';
      if (!connectTimeout && err.name !== 'TimeoutError') throw err;
      if (attempt === 2) {
        const message = connectTimeout ? '连接央视网超时' : '等待央视网响应超时';
        throw new Error(`${message}（已自动重试一次）`, { cause: err });
      }
    }
  }
}

function readIntroduction(html) {
  const templates = [
    /<div\b[^>]*class=["'](?:[^"']*\s)?video_brief(?:\s[^"']*)?["'][^>]*>([\s\S]*?)<\/div>/i,
    /视频简介\s*<\/div>\s*<p\b[^>]*>([\s\S]*?)<\/p>/i
  ];
  for (const template of templates) {
    const markup = template.exec(html)?.[1] ?? '';
    const text = markup.replace(/<br\s*\/?>/gi, '\n').split(/\r?\n/).map(plainText).filter(Boolean).join('\n');
    if (text) return text;
  }
  return '';
}

export async function collectCctvNews(date, fetchPageResponse = fetch) {
  const originalUrl = findEpisodeUrl(await fetchPage(CCTV_COLUMN, fetchPageResponse), date);
  if (!originalUrl) return { status: 'pending', message: `央视网栏目页暂未找到 ${date} 的新闻联播完整版` };

  const text = readIntroduction(await fetchPage(originalUrl, fetchPageResponse));
  if (!text) return { status: 'pending', message: `央视网暂未提供 ${date} 的完整版内容简介` };
  return { status: 'ready', originalUrl, text };
}
