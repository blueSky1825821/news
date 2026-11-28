import { getDb, withWriteTransaction } from '../../db.js';
import { insertArticle } from '../../models/article.js';
import { escapeHtml } from '../../utils/html.js';

export const INTRODUCTION_FORMAT = 'cctv-full-introduction';

const taskFields = `
  t.id, t.taskDate, t.status, t.startedAt, t.completedAt, t.errorMessage,
  (SELECT a.id FROM articles a JOIN sources s ON s.id = a.sourceId
    WHERE s.type = 'xinwenlianbo' AND a.title IN (t.taskDate || ' 新闻联播主要内容', t.taskDate || ' 新闻联播摘要')
    ORDER BY a.id DESC LIMIT 1) AS articleId
`;

export function findTaskByDate(date) {
  return getDb().prepare(`SELECT ${taskFields} FROM xinwenlianbo_tasks t WHERE t.taskDate = ?`).get(date);
}

export function findTaskById(id, db = getDb()) {
  return db.prepare(`
    SELECT ${taskFields}, t.transcript, t.summary, t.headlines
    FROM xinwenlianbo_tasks t WHERE t.id = ?
  `).get(id);
}

export function hasPublishedIntroduction(date, { includeInterruptedRefresh = false } = {}) {
  return Boolean(getDb().prepare(`
    SELECT 1 FROM xinwenlianbo_tasks
    WHERE taskDate = ? AND (status = 'completed' OR ?) AND json_extract(webNews, '$.format') = ?
  `).get(date, Number(includeInterruptedRefresh), INTRODUCTION_FORMAT));
}

export function findBroadcastSource() {
  return getDb().prepare("SELECT id FROM sources WHERE type = 'xinwenlianbo' ORDER BY id LIMIT 1").get();
}

export function markCollecting(date) {
  getDb().prepare(`
    INSERT INTO xinwenlianbo_tasks (taskDate, status, startedAt)
    VALUES (?, 'collecting', datetime('now'))
    ON CONFLICT(taskDate) DO UPDATE SET status = 'collecting',
      startedAt = excluded.startedAt, completedAt = NULL, errorMessage = NULL
  `).run(date);
}

export function markPending(date, message) {
  getDb().prepare("UPDATE xinwenlianbo_tasks SET status = 'pending', errorMessage = ? WHERE taskDate = ?")
    .run(message, date);
}

export function markFailed(date, message) {
  getDb().prepare(`
    UPDATE xinwenlianbo_tasks SET status = 'failed', errorMessage = ?, completedAt = datetime('now')
    WHERE taskDate = ?
  `).run(message, date);
}

export function publishIntroduction(date, sourceId, news) {
  const title = `${date} 新闻联播主要内容`;
  const { originalUrl, text } = news;
  const content = text.split('\n').map(line => `<p>${escapeHtml(line)}</p>`).join('');
  const summary = text;
  const headlines = JSON.stringify([...text.matchAll(/(?:^|[\s：；])\d{1,2}[.．、]([^；。\n]+)/g)]
    .map(([, headline]) => headline.trim()).filter(Boolean));
  return withWriteTransaction(db => {
    const existing = db.prepare('SELECT id FROM articles WHERE sourceId = ? AND title IN (?, ?) ORDER BY id DESC LIMIT 1')
      .get(sourceId, title, `${date} 新闻联播摘要`);
    const articleId = existing?.id ?? insertArticle({
      title, summary, content, originalUrl, sourceId,
      publishedAt: new Date().toISOString(), transcript: text, headlines
    });
    if (!articleId) throw new Error('新闻联播主要内容保存失败');
    if (existing) {
      db.prepare('UPDATE articles SET title = ?, summary = ?, content = ?, transcript = ?, headlines = ?, originalUrl = ? WHERE id = ?')
        .run(title, summary, content, text, headlines, originalUrl, articleId);
    }
    db.prepare(`
      UPDATE xinwenlianbo_tasks
      SET status = 'completed', summary = ?, headlines = ?, transcript = ?, webNews = ?, errorMessage = NULL,
        completedAt = COALESCE(completedAt, datetime('now'))
      WHERE taskDate = ?
    `).run(summary, headlines, text, JSON.stringify({ ...news, format: INTRODUCTION_FORMAT }), date);
    return { articleId, status: 'completed' };
  });
}

export function listTasks(page, limit) {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) AS total FROM xinwenlianbo_tasks').get().total;
  const offset = (page - 1) * limit;
  const items = offset < total ? db.prepare(`
    SELECT ${taskFields} FROM xinwenlianbo_tasks t
    ORDER BY t.taskDate DESC LIMIT ? OFFSET ?
  `).all(limit, offset) : [];
  return { items, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export function deleteTask(id, { deleteArticle, activeDate }) {
  return withWriteTransaction(db => {
    const record = findTaskById(id, db);
    if (!record) return { status: 'missing' };
    if (record.taskDate === activeDate) return { status: 'active' };

    const articleDeleted = Boolean(deleteArticle && record.articleId &&
      db.prepare('DELETE FROM articles WHERE id = ?').run(record.articleId).changes);

    db.prepare('DELETE FROM xinwenlianbo_tasks WHERE id = ?').run(id);
    return { status: 'deleted', articleDeleted };
  });
}
