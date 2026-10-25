import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createConnection() {
  const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/news.db');
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
      isRead BOOLEAN NOT NULL DEFAULT 0,
      FOREIGN KEY (sourceId) REFERENCES sources(id)
    );

    CREATE INDEX IF NOT EXISTS idx_articles_sourceId ON articles(sourceId);
    CREATE INDEX IF NOT EXISTS idx_articles_publishedAt ON articles(publishedAt DESC);

    CREATE TABLE IF NOT EXISTS wechat_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      appId TEXT,
      appSecret TEXT,
      accessToken TEXT,
      tokenExpiresAt DATETIME,
      previewOpenId TEXT,
      summaryPushEnabled BOOLEAN NOT NULL DEFAULT 1,
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
      FOREIGN KEY (sourceId) REFERENCES sources(id) ON DELETE CASCADE
    );
  `);
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
