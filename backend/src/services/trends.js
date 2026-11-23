const CACHE_MS = 5 * 60_000;
const REFRESH_COOLDOWN_MS = 60_000;
const MAX_STALE_MS = 24 * 60 * 60_000;
const MAX_ITEMS = 30;

function cleanText(value) {
  return typeof value === 'string' ? value.trim().slice(0, 240) : '';
}

function normalizeItems(rows) {
  const seen = new Set();
  const items = [];
  for (const row of rows) {
    const title = cleanText(row.title);
    if (!title || !row.url || seen.has(title)) continue;

    seen.add(title);
    items.push({
      rank: items.length + 1, title, url: row.url, heat: cleanText(row.heat),
      description: typeof row.description === 'string' ? row.description.trim().slice(0, 500) : ''
    });
    if (items.length === MAX_ITEMS) break;
  }
  if (!items.length) throw new Error('No trend items');
  return items;
}

async function fetchResponse(fetcher, url, accept) {
  const response = await fetcher(url, {
    headers: { Accept: accept },
    redirect: 'error',
    signal: AbortSignal.timeout(3500)
  });
  if (!response.ok) throw new Error(`Upstream returned HTTP ${response.status}`);
  return response;
}

function weiboLink(title) {
  return `https://s.weibo.com/weibo?q=${encodeURIComponent(`#${title}#`)}`;
}

function decodeHtmlText(value) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
  return value.replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, entity) => entities[entity]);
}

async function loadTunbang(fetcher, path, getLink) {
  const providerUrl = `https://tunbang.com/hot/${path}`;
  const response = await fetchResponse(fetcher, providerUrl, 'text/html');
  const html = await response.text();
  const list = html.match(/<ol\b[^>]*\bid="list"[^>]*>([\s\S]*?)<\/ol>/i)?.[1] ?? '';
  const items = normalizeItems(Array.from(list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi), ([, row]) => {
    const link = row.match(/<a\b([^>]*\bclass="row-title"[^>]*)>([^<]*)<\/a>/i);
    const title = decodeHtmlText(link?.[2] ?? '');
    const href = decodeHtmlText(link?.[1].match(/\bhref="([^"]+)"/i)?.[1] ?? '');
    const heat = row.match(/<span\b[^>]*\bclass="hot"[^>]*>([^<]*)<\/span>/i)?.[1];
    return { title, url: getLink(title.trim(), href), heat };
  }));
  return { items, provider: '豚榜', providerUrl };
}

async function loadWeibo(fetcher) {
  try {
    const response = await fetchResponse(fetcher, 'https://weibo.com/ajax/side/hotSearch', 'application/json');
    const payload = await response.json();
    const items = normalizeItems((payload.data?.realtime ?? []).filter(row => !row.is_ad).map(row => {
      const title = cleanText(row.word);
      const heat = row.raw_hot ?? row.num;
      return { title, url: weiboLink(title), heat: heat == null ? '' : String(heat) };
    }));
    return { items, provider: '微博' };
  } catch {
    // The public board can return a visitor page depending on the deployment network.
    return loadTunbang(fetcher, 'weibo', weiboLink);
  }
}

function loadBilibili(fetcher) {
  return loadTunbang(fetcher, 'bilibili/', (title, href) => {
    const id = href.match(/^https:\/\/(?:b23\.tv\/|www\.bilibili\.com\/video\/)(BV[\da-z]+)(?:[/?#]|$)/i)?.[1];
    return id ? `https://www.bilibili.com/video/${id}/` : `https://search.bilibili.com/all?keyword=${encodeURIComponent(title)}`;
  });
}

function loadDouyin(fetcher) {
  return loadTunbang(fetcher, 'douyin', (title, href) => {
    const id = href.match(/^https:\/\/www\.douyin\.com\/hot\/(\d+)(?:[/?#]|$)/)?.[1];
    return id ? `https://www.douyin.com/hot/${id}` : `https://www.douyin.com/search/${encodeURIComponent(title)}`;
  });
}

async function loadDouban(fetcher) {
  const response = await fetchResponse(fetcher, 'https://movie.douban.com/chart', 'text/html');
  const html = await response.text();
  const rows = Array.from(html.matchAll(/<tr\b[^>]*\bclass="item"[^>]*>([\s\S]*?)<\/tr>/gi), ([, row]) => {
    const film = row.match(/<a\b[^>]*\bclass="nbg"[^>]*\bhref="https:\/\/movie\.douban\.com\/subject\/(\d+)\/"[^>]*\btitle="([^"]+)"/i);
    const score = row.match(/<span\b[^>]*\bclass="rating_nums"[^>]*>([\d.]+)<\/span>/i)?.[1];
    return { title: decodeHtmlText(film?.[2] ?? ''), url: film && `https://movie.douban.com/subject/${film[1]}/`, heat: score ? `评分 ${score}` : '' };
  });
  return { items: normalizeItems(rows), provider: '豆瓣' };
}

async function loadJuejin(fetcher) {
  const response = await fetchResponse(fetcher, 'https://api.juejin.cn/content_api/v1/content/article_rank?category_id=1&type=hot', 'application/json');
  const payload = await response.json();
  const rows = (payload.data ?? []).map(({ content, content_counter: counters }) => {
    const id = typeof content?.content_id === 'string' && /^\d+$/.test(content.content_id) ? content.content_id : null;
    return { title: content?.title, url: id && `https://juejin.cn/post/${id}`, description: content?.brief,
      heat: counters?.hot_rank == null ? '' : String(counters.hot_rank) };
  });
  return { items: normalizeItems(rows), provider: '稀土掘金' };
}

async function loadZhihu(fetcher) {
  const response = await fetchResponse(fetcher, 'https://api.zhihu.com/topstory/hot-lists/total?limit=30', 'application/json');
  const payload = await response.json();
  const items = normalizeItems((payload.data ?? []).map(row => {
    // IDs can exceed Number.MAX_SAFE_INTEGER, so preserve the digits from the URL.
    const id = String(row.target?.url ?? '').match(/\/questions?\/(\d+)(?:[/?#]|$)/)?.[1];
    return { title: row.target?.title, url: id && `https://www.zhihu.com/question/${id}`, heat: row.detail_text, description: row.target?.excerpt };
  }));
  return { items, provider: '知乎' };
}

async function loadBaidu(fetcher) {
  const response = await fetchResponse(fetcher, 'https://top.baidu.com/board?tab=realtime', 'text/html');
  const html = await response.text();
  const state = html.match(/<!--s-data:([\s\S]*?)-->/)?.[1];
  const cards = state ? JSON.parse(state).data?.cards ?? [] : [];
  const rows = cards.flatMap(card => Array.isArray(card.content) ? card.content : []);
  const items = normalizeItems(rows.filter(row => !row.isTop).map(row => {
    const title = cleanText(row.query || row.word);
    return { title, url: `https://www.baidu.com/s?wd=${encodeURIComponent(title)}`, heat: row.hotScore, description: row.desc };
  }));
  return { items, provider: '百度' };
}

const sources = [
  { id: 'weibo', name: '微博热搜', url: 'https://s.weibo.com/top/summary?cate=realtimehot', load: loadWeibo },
  { id: 'zhihu', name: '知乎热榜', url: 'https://www.zhihu.com/hot', load: loadZhihu },
  { id: 'baidu', name: '百度热搜', url: 'https://top.baidu.com/board?tab=realtime', load: loadBaidu },
  { id: 'bilibili', name: '哔哩哔哩热门', url: 'https://www.bilibili.com/v/popular/all', load: loadBilibili },
  { id: 'douyin', name: '抖音热榜', url: 'https://www.douyin.com/hot', load: loadDouyin },
  { id: 'douban', name: '豆瓣电影新片榜', url: 'https://movie.douban.com/chart', load: loadDouban },
  { id: 'juejin', name: '掘金热门文章', url: 'https://juejin.cn/', load: loadJuejin }
];

export function createTrendsService({ fetcher = globalThis.fetch, now = Date.now } = {}) {
  const states = new Map(sources.map(({ id }) => [id, {}]));

  function getBoard({ id, name, url, load }, refresh) {
    const state = states.get(id);
    if (state.pending) return state.pending;

    const time = now();
    const metadata = { id, name, url };
    const canReuse = state.lastAttempt !== undefined && time - state.lastAttempt < REFRESH_COOLDOWN_MS;
    const isFresh = state.updatedAt !== undefined && time - state.updatedAt < CACHE_MS;
    const snapshot = () => {
      if (!state.data || now() - state.updatedAt >= MAX_STALE_MS) {
        return { ...metadata, items: [], status: 'unavailable', updatedAt: null };
      }
      return { ...metadata, ...state.data, status: state.failed ? 'stale' : 'ready',
        updatedAt: new Date(state.updatedAt).toISOString() };
    };

    if (canReuse || (!refresh && isFresh && !state.failed)) return snapshot();

    state.pending = load(fetcher)
      .then(data => {
        state.data = data;
        state.updatedAt = now();
        state.failed = false;
      })
      .catch(() => { state.failed = true; })
      .finally(() => {
        state.lastAttempt = now();
        state.pending = null;
      })
      .then(snapshot);
    return state.pending;
  }

  return async ({ refresh = false } = {}) => ({
    boards: await Promise.all(sources.map(source => getBoard(source, refresh)))
  });
}

export const getTrends = createTrendsService();
