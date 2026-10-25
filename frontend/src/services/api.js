const BASE_URL = '';

async function request(url, options = {}) {
  const res = await fetch(BASE_URL + url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  const json = await res.json();
  if (json.code !== 0) {
    const err = new Error(json.message || 'Request failed');
    err.status = res.status;
    err.code = json.code;
    throw err;
  }
  return json.data;
}

export const api = {
  getArticles(params = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.sourceId) qs.set('sourceId', String(params.sourceId));
    if (params.category) qs.set('category', params.category);
    const query = qs.toString();
    return request('/api/articles' + (query ? '?' + query : ''));
  },

  getArticle(id) {
    return request('/api/articles/' + id);
  },

  getTodayArticles(params = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return request('/api/articles/today' + (query ? '?' + query : ''));
  },

  getSources() {
    return request('/api/sources');
  },

  getSourceHealth() {
    return request('/api/sources/health');
  },

  activateSource(id) {
    return request(`/api/sources/${id}/activate`, { method: 'POST' });
  },

  deleteSource(id) {
    return request(`/api/sources/${id}`, { method: 'DELETE' });
  },

  triggerCrawl() {
    return request('/api/crawl/trigger', { method: 'POST' });
  },

  triggerCrawlForSource(id) {
    return request(`/api/crawl/sources/${id}`, { method: 'POST' });
  },

  getFailureThreshold() {
    return request('/api/settings/failure-threshold');
  },

  setFailureThreshold(threshold) {
    return request('/api/settings/failure-threshold', {
      method: 'PUT',
      body: JSON.stringify({ threshold })
    });
  },

  // Auth
  login(credentials) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
  },

  register(data) {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  getMe() {
    return request('/api/auth/me');
  },

  setUserCategories(categories) {
    return request('/api/user-categories', {
      method: 'PUT',
      body: JSON.stringify({ categories })
    });
  },

  getCategories() {
    return request('/api/categories');
  },

  getSettings() {
    return request('/api/settings');
  },

  updateSettings(settings) {
    return request('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },

  // WeChat
  getWechatSettings() {
    return request('/api/wechat/settings');
  },

  setWechatSettings(settings) {
    return request('/api/wechat/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },

  toggleFlagArticle(articleId) {
    return request('/api/wechat/flag', {
      method: 'POST',
      body: JSON.stringify({ articleId })
    });
  },

  getFlaggedArticleIds() {
    return request('/api/wechat/flags');
  },

  getPreviewContent() {
    return request('/api/wechat/preview-content');
  },

  sendPreview() {
    return request('/api/wechat/preview', { method: 'POST' });
  }
};
