import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getDefaultDbPath() {
  const projectDbPath = path.join(__dirname, '../../data/news.db');
  // WSL + Windows-mounted drive (/mnt/...) + WAL mode = unreliable SQLite I/O.
  // Always use native WSL filesystem to avoid disk I/O errors and corruption.
  if (projectDbPath.startsWith('/mnt/')) {
    return path.join(os.homedir(), '.local/share/ai-news/news.db');
  }
  return projectDbPath;
}

export function createConnection() {
  const DB_PATH = process.env.DB_PATH || getDefaultDbPath();
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  return db;
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rssUrl TEXT NOT NULL UNIQUE,
      category TEXT,
      type TEXT NOT NULL DEFAULT 'rss',
      isActive BOOLEAN NOT NULL DEFAULT 1,
      fetchIntervalMinutes INTEGER NOT NULL DEFAULT 30,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT,
      content TEXT,
      originalUrl TEXT NOT NULL UNIQUE,
      sourceId INTEGER NOT NULL,
      publishedAt DATETIME,
      fetchedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      transcript TEXT,
      headlines TEXT,
      isRead BOOLEAN NOT NULL DEFAULT 0,
      FOREIGN KEY (sourceId) REFERENCES sources(id)
    );

    CREATE INDEX IF NOT EXISTS idx_articles_sourceId ON articles(sourceId);
    CREATE INDEX IF NOT EXISTS idx_articles_publishedAt ON articles(publishedAt DESC);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wechat_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      appId TEXT,
      appSecret TEXT,
      accessToken TEXT,
      tokenExpiresAt DATETIME,
      previewOpenId TEXT,
      summaryPushEnabled BOOLEAN NOT NULL DEFAULT 0,
      summaryPushCron TEXT NOT NULL DEFAULT '0 8 * * *',
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS wechat_push_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      articleId INTEGER,
      pushType TEXT NOT NULL,
      status TEXT NOT NULL,
      wxMessageId TEXT,
      errorMessage TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS article_flags (
      articleId INTEGER PRIMARY KEY,
      flaggedBy TEXT NOT NULL DEFAULT 'system',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (articleId) REFERENCES articles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      emailVerified BOOLEAN NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_categories (
      userId INTEGER NOT NULL,
      categoryName TEXT NOT NULL,
      PRIMARY KEY (userId, categoryName),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS source_health (
      sourceId INTEGER PRIMARY KEY,
      consecutiveFailures INTEGER NOT NULL DEFAULT 0,
      lastError TEXT,
      lastErrorAt DATETIME,
      retryAfterAt INTEGER,
      FOREIGN KEY (sourceId) REFERENCES sources(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wechat_users (
      appId TEXT NOT NULL,
      openId TEXT NOT NULL,
      userId INTEGER NOT NULL UNIQUE REFERENCES users(id),
      PRIMARY KEY (appId, openId)
    );
    CREATE TABLE IF NOT EXISTS wechat_oauth_flows (
      state TEXT PRIMARY KEY,
      browserHash TEXT NOT NULL,
      returnTo TEXT NOT NULL,
      expiresAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS wechat_login_tickets (
      ticketHash TEXT PRIMARY KEY,
      browserHash TEXT NOT NULL,
      userId INTEGER NOT NULL,
      returnTo TEXT NOT NULL,
      expiresAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS news_pushes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      articles TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS xinwenlianbo_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      taskDate TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      audioFilePath TEXT,
      transcript TEXT,
      summary TEXT,
      headlines TEXT,
      startedAt DATETIME,
      completedAt DATETIME,
      errorMessage TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: add columns to existing tables
  const hasTypeColumn = db.prepare(`SELECT COUNT(*) as count FROM pragma_table_info('sources') WHERE name = 'type'`).get().count > 0;
  if (!hasTypeColumn) {
    db.exec(`ALTER TABLE sources ADD COLUMN type TEXT NOT NULL DEFAULT 'rss'`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sources_type ON sources(type)`);


  const hasRetryAfterAt = db.prepare("SELECT 1 FROM pragma_table_info('source_health') WHERE name = 'retryAfterAt'").get();
  if (!hasRetryAfterAt) {
    db.exec('ALTER TABLE source_health ADD COLUMN retryAfterAt INTEGER');
  }

  const hasTranscriptColumn = db.prepare(`SELECT COUNT(*) as count FROM pragma_table_info('articles') WHERE name = 'transcript'`).get().count > 0;
  if (!hasTranscriptColumn) {
    db.exec(`ALTER TABLE articles ADD COLUMN transcript TEXT`);
  }

  const hasHeadlinesColumn = db.prepare(`SELECT COUNT(*) as count FROM pragma_table_info('articles') WHERE name = 'headlines'`).get().count > 0;
  if (!hasHeadlinesColumn) {
    db.exec(`ALTER TABLE articles ADD COLUMN headlines TEXT`);
  }
}

let dbInstance = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = createConnection();
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
