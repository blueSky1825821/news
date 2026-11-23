const BASE_URL = '/news';
const pendingFlaggedArticles = new Map();

async function request(url, options = {}) {
  const token = localStorage.getItem('news-auth-token');
  const isFormData = options.body instanceof FormData;
  const res = await fetch(BASE_URL + url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  getArticles(params = {}, options = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.sourceId) qs.set('sourceId', String(params.sourceId));
    if (params.view) qs.set('view', params.view);
    if (params.date) qs.set('date', params.date);
    if (params.q) qs.set('q', params.q);
    for (const category of [params.category].flat().filter(Boolean)) qs.append('category', category);
    const query = qs.toString();
    return request('/api/articles' + (query ? '?' + query : ''), options);
  },

  getArticle(id, options = {}) {
    return request('/api/articles/' + id + '?includeLikes=1', options);
  },

  getTodayArticles(params = {}, options = {}) {
    const qs = new URLSearchParams();
    if (params.page) qs.set('page', String(params.page));
    if (params.limit) qs.set('limit', String(params.limit));
    const query = qs.toString();
    return request('/api/articles/today' + (query ? '?' + query + '&view=card' : '?view=card'), options);
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
    return request('/api/users/categories', {
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
  getWechatLoginStatus() {
    return request('/api/wechat/auth/status');
  },

  exchangeWechatTicket(ticket) {
    return request('/api/wechat/auth/exchange', { method: 'POST', body: JSON.stringify({ ticket }) });
  },

  createWechatPush(articleIds) {
    return request('/api/wechat/pushes', { method: 'POST', body: JSON.stringify({ articleIds }) });
  },

  sendWechatPush(id, preview = false) {
    return request(`/api/wechat/pushes/${id}/send`, { method: 'POST', body: JSON.stringify({ preview, confirm: !preview }) });
  },

  getWechatPush(id) {
    return request(`/api/wechat/pushes/${id}`);
  },

  getWechatPushLogs() {
    return request('/api/wechat/logs');
  },

  getWechatSettings() {
    return request('/api/wechat/settings');
  },

  setWechatSettings(settings) {
    return request('/api/wechat/settings', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  },

  async toggleFlagArticle(articleId) {
    const token = localStorage.getItem('news-auth-token');
    const result = await request('/api/wechat/flag', {
      method: 'POST',
      body: JSON.stringify({ articleId })
    });
    pendingFlaggedArticles.delete(token);
    return result;
  },

  getFlaggedArticleIds() {
    const token = localStorage.getItem('news-auth-token');
    let pending = pendingFlaggedArticles.get(token);
    if (!pending) {
      pending = request('/api/wechat/flags')
        .finally(() => {
          if (pendingFlaggedArticles.get(token) === pending) pendingFlaggedArticles.delete(token);
        });
      pendingFlaggedArticles.set(token, pending);
    }
    return pending;
  },

  getPreviewContent() {
    return request('/api/wechat/preview-content');
  },

  sendPreview() {
    return request('/api/wechat/preview', { method: 'POST' });
  },

  // Xinwenlianbo
  getXinwenlianboStatus(options = {}) {
    return request('/api/xinwenlianbo/status', options);
  },
  triggerXinwenlianbo({ force = false } = {}) {
    return request(`/api/xinwenlianbo/trigger${force ? '?force=true' : ''}`, {
      method: 'POST'
    });
  },
  getXinwenlianboTasks(page = 1, options = {}) {
    return request(`/api/xinwenlianbo/tasks?page=${page}`, options);
  },
  getXinwenlianboRecord(id, options = {}) {
    return request(`/api/xinwenlianbo/tasks/${id}`, options);
  },
  deleteXinwenlianboRecord(id, { deleteArticle = false } = {}) {
    return request(`/api/xinwenlianbo/tasks/${id}`, {
      method: 'DELETE', body: JSON.stringify({ deleteArticle })
    });
  },

  // Email verification & password
  verifyEmail(token) {
    return request('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) });
  },
  resendVerification() {
    return request('/api/auth/resend-verification', { method: 'POST' });
  },
  forgotPassword(email) {
    return request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
  },
  resetPassword(token, password) {
    return request('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
  },
  changePassword(oldPassword, newPassword) {
    return request('/api/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ oldPassword, newPassword })
    });
  },

  // Likes
  toggleLike(articleId) {
    return request(`/api/articles/${articleId}/likes`, { method: 'POST' });
  },
  getLikes(articleId, page = 1, limit = 20) {
    return request(`/api/articles/${articleId}/likes?page=${page}&limit=${limit}`);
  },
  hasLiked(articleId) {
    return request(`/api/articles/${articleId}/likes/liked`);
  },

  // Comments
  postComment(articleId, content) {
    return request(`/api/articles/${articleId}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
  },
  postReply(commentId, content) {
    return request(`/api/comments/${commentId}/reply`, { method: 'POST', body: JSON.stringify({ content }) });
  },
  getComments(articleId) {
    return request(`/api/articles/${articleId}/comments`);
  },
  deleteComment(commentId) {
    return request(`/api/comments/${commentId}`, { method: 'DELETE' });
  },
  reportComment(commentId, reason) {
    return request(`/api/comments/${commentId}/report`, { method: 'POST', body: JSON.stringify({ reason }) });
  },
  getReportedComments() {
    return request('/api/comments/reported');
  },
  clearCommentReports(commentId) {
    return request(`/api/comments/${commentId}/clear-reports`, { method: 'POST' });
  },

  // Hot ranking
  getTrends({ refresh = false, signal } = {}) {
    return request(`/api/trends${refresh ? '?refresh=1' : ''}`, { signal });
  },

  getHotArticles(range = 'today', page = 1, limit = 20) {
    return request(`/api/articles/hot?view=card&range=${range}&page=${page}&limit=${limit}`);
  },
  getHotSidebar(range = 'today') {
    return request(`/api/articles/hot-sidebar?view=card&range=${range}`);
  },

  // Profile
  getProfile() {
    return request('/api/users/profile');
  },
  updateProfile(profile) {
    return request('/api/users/profile', {
      method: 'PUT',
      body: JSON.stringify(profile)
    });
  },
  uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    return request('/api/users/avatar', {
      method: 'POST',
      body: formData
    });
  }
};
