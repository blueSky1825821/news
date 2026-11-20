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
    CREATE INDEX IF NOT EXISTS idx_articles_published_datetime ON articles(datetime(publishedAt));
    CREATE INDEX IF NOT EXISTS idx_articles_fetched_datetime ON articles(datetime(fetchedAt));

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

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expiresAt DATETIME NOT NULL,
      usedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
    CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_userId ON email_verification_tokens(userId);

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expiresAt DATETIME NOT NULL,
      usedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);

    CREATE TABLE IF NOT EXISTS article_likes (
      userId INTEGER NOT NULL,
      articleId INTEGER NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (userId, articleId),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (articleId) REFERENCES articles(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_article_likes_articleId ON article_likes(articleId);

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      articleId INTEGER NOT NULL,
      userId INTEGER NOT NULL,
      content TEXT NOT NULL,
      parentId INTEGER,
      isDeleted BOOLEAN NOT NULL DEFAULT 0,
      reportCount INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (articleId) REFERENCES articles(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (parentId) REFERENCES comments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_comments_articleId ON comments(articleId);
    CREATE INDEX IF NOT EXISTS idx_comments_userId ON comments(userId);
    CREATE INDEX IF NOT EXISTS idx_comments_parentId ON comments(parentId);

    CREATE TABLE IF NOT EXISTS comment_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      commentId INTEGER NOT NULL,
      reporterId INTEGER NOT NULL,
      reason TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (commentId) REFERENCES comments(id) ON DELETE CASCADE,
      FOREIGN KEY (reporterId) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(commentId, reporterId)
    );
    CREATE INDEX IF NOT EXISTS idx_comment_reports_commentId ON comment_reports(commentId);
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

  const hasEmailVerified = db.prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'emailVerified'").get();
  if (!hasEmailVerified) {
    db.exec('ALTER TABLE users ADD COLUMN emailVerified BOOLEAN NOT NULL DEFAULT 0');
  }

  const hasDisplayName = db.prepare(`SELECT COUNT(*) as count FROM pragma_table_info('users') WHERE name = 'displayName'`).get().count > 0;
  if (!hasDisplayName) {
    db.exec(`ALTER TABLE users ADD COLUMN displayName TEXT`);
  }

  const hasBio = db.prepare(`SELECT COUNT(*) as count FROM pragma_table_info('users') WHERE name = 'bio'`).get().count > 0;
  if (!hasBio) {
    db.exec(`ALTER TABLE users ADD COLUMN bio TEXT`);
  }

  const hasAvatarUrl = db.prepare(`SELECT COUNT(*) as count FROM pragma_table_info('users') WHERE name = 'avatarUrl'`).get().count > 0;
  if (!hasAvatarUrl) {
    db.exec(`ALTER TABLE users ADD COLUMN avatarUrl TEXT`);
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

// The callback must finish synchronously so no request can share an open transaction.
export function withWriteTransaction(run) {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run(db);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
