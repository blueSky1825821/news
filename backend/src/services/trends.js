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
    const providerUrl = 'https://tunbang.com/hot/weibo';
    const response = await fetchResponse(fetcher, providerUrl, 'text/html');
    const html = await response.text();
    const list = html.match(/<ol\b[^>]*\bid="list"[^>]*>([\s\S]*?)<\/ol>/i)?.[1] ?? '';
    const items = normalizeItems(Array.from(list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi), ([, row]) => {
      const title = decodeHtmlText(row.match(/<a\b[^>]*\bclass="row-title"[^>]*>([^<]*)<\/a>/i)?.[1] ?? '');
      const heat = row.match(/<span\b[^>]*\bclass="hot"[^>]*>([^<]*)<\/span>/i)?.[1];
      return { title, url: weiboLink(title), heat };
    }));
    return { items, provider: '豚榜', providerUrl };
  }
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
  { id: 'baidu', name: '百度热搜', url: 'https://top.baidu.com/board?tab=realtime', load: loadBaidu }
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
