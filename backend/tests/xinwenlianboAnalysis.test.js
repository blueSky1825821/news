import { jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../src/app.js';
import { getDb, closeDb } from '../src/db.js';
import { insertArticle } from '../src/models/article.js';
import { generateAnalysis, listAnalyses, runAutomaticAnalysis } from '../src/services/xinwenlianbo/analysis.js';

let articleId;
let fetchModel;

beforeEach(() => {
  process.env.DB_PATH = ':memory:';
  process.env.ADMIN_EMAILS = 'research@example.com';
  process.env.DEEPSEEK_API_KEY = 'test-secret';
  process.env.DEEPSEEK_MODELS = 'deepseek-flash';
  process.env.XINWENLIANBO_LLM_MODELS = JSON.stringify([
    { id: 'local', label: 'Local', model: 'local-model', baseUrl: 'http://127.0.0.1:11434/v1' }
  ]);
  const db = getDb();
  const { lastInsertRowid: sourceId } = db.prepare(
    "INSERT INTO sources (name, rssUrl, category, type) VALUES ('CCTV', 'https://example.test/rss', 'xinwenlianbo', 'xinwenlianbo')"
  ).run();
  articleId = insertArticle({ title: '新闻联播', originalUrl: 'https://example.test/cctv', sourceId, transcript: '节目原文与政策要点' });
  fetchModel = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({
    choices: [{ message: { content: '投研简报', reasoning_content: 'internal' }, finish_reason: 'stop' }]
  }));
});

afterEach(() => {
  fetchModel.mockRestore();
  closeDb();
  for (const key of ['DB_PATH', 'ADMIN_EMAILS', 'DEEPSEEK_API_KEY', 'DEEPSEEK_MODELS', 'XINWENLIANBO_LLM_MODELS', 'XINWENLIANBO_AUTO_ANALYSIS_MODEL']) delete process.env[key];
});

async function login(email) {
  const result = await request(app).post('/api/auth/register').send({ email, password: 'password123' });
  return `Bearer ${result.body.data.token}`;
}

it('limits model calls to admins and saves independent reports from multiple providers', async () => {
  const route = `/news/api/articles/${articleId}/investment-analyses`;
  const modelsRoute = '/news/api/articles/investment-analysis-models';
  const modelId = 'deepseek:deepseek-flash';
  expect((await request(app).post(route).send({ modelId })).status).toBe(401);
  const reader = await login('reader@example.com');
  expect((await request(app).post(route).set('Authorization', reader).send({ modelId })).status).toBe(403);
  expect(fetchModel).not.toHaveBeenCalled();

  const admin = await login('research@example.com');
  const models = await request(app).get(modelsRoute).set('Authorization', admin);
  expect(models.body.data).toEqual([
    { id: modelId, label: 'DeepSeek · deepseek-flash' }, { id: 'local', label: 'Local' }
  ]);
  const generate = id => request(app).post(route).set('Authorization', admin).send({ modelId: id });
  expect((await generate(modelId)).body.data).toMatchObject({ modelId, content: '投研简报' });
  expect((await generate('local')).status).toBe(200);
  const [[endpoint, options], [localEndpoint, localOptions]] = fetchModel.mock.calls;
  expect(endpoint).toBe('https://api.deepseek.com/chat/completions');
  expect(options.headers.Authorization).toBe('Bearer test-secret');
  expect(JSON.parse(JSON.parse(options.body).messages[1].content).body).toBe('节目原文与政策要点');
  expect(localEndpoint).toBe('http://127.0.0.1:11434/v1/chat/completions');
  expect(localOptions.headers.Authorization).toBeUndefined();

  fetchModel.mockResolvedValueOnce(Response.json({ choices: [{ message: { content: '截断的报告' }, finish_reason: 'length' }] }));
  expect((await generate(modelId)).status).toBe(502);
  const reports = (await request(app).get(route)).body.data;
  expect(reports).toHaveLength(2);
  expect(reports.every(report => report.content === '投研简报')).toBe(true);

  getDb().prepare('UPDATE articles SET transcript = ? WHERE id = ?').run('更新后的正文', articleId);
  expect((await request(app).get(route)).body.data).toEqual([]);
  getDb().prepare('DELETE FROM articles WHERE id = ?').run(articleId);
  expect(getDb().prepare('SELECT COUNT(*) AS count FROM xinwenlianbo_analyses').get().count).toBe(0);
});


it('shares an in-progress automatic analysis and reuses the saved report until the source changes', async () => {
  const modelId = 'deepseek:deepseek-flash';
  process.env.XINWENLIANBO_AUTO_ANALYSIS_MODEL = modelId;
  await Promise.all([runAutomaticAnalysis(articleId), generateAnalysis(articleId, modelId)]);
  await runAutomaticAnalysis(articleId);
  expect(fetchModel).toHaveBeenCalledTimes(1);

  const oldSourceJob = generateAnalysis(articleId, modelId);
  getDb().prepare('UPDATE articles SET transcript = ? WHERE id = ?').run('政策内容已更新', articleId);
  await expect(oldSourceJob).rejects.toMatchObject({ statusCode: 409 });
  expect(listAnalyses(articleId)).toEqual([]);

  await runAutomaticAnalysis(articleId);
  expect(fetchModel).toHaveBeenCalledTimes(3);
  expect(listAnalyses(articleId)).toEqual([expect.objectContaining({ modelId })]);
});
