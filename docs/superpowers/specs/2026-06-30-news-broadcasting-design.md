# News Headline Broadcasting System — Design Specification

## 1. Overview

A personal-use web application that periodically fetches news headlines from multiple Chinese news sources (e.g., People's Daily, Sina News) via official RSS feeds, stores them locally, and presents them through a web interface with single-summary voice playback and full-playlist auto-broadcast capabilities.

The system is designed for single-user personal use initially, with a true front/back separation architecture to enable future multi-client support (mini-programs, mobile apps).

## 2. Requirements

### Functional Requirements
1. **RSS Ingestion:** Fetch news from configurable RSS sources on a scheduled interval (default: every 30 minutes).
2. **News Storage:** Persist articles with title, summary, content, source, publish time, and original URL.
3. **News List:** Display paginated news cards with title, summary, source badge, and publish time.
4. **Source Filtering:** Filter news list by source.
5. **Single Playback:** Click a button to voice-read a single article summary via browser TTS.
6. **Auto Playlist Playback:** Click "全部播报" to sequentially auto-play all visible summaries with play controls (pause, stop, next, progress).
7. **Detail View:** View full article content on a dedicated detail page.
8. **Manual Trigger:** Provide an API endpoint to manually trigger a crawl.

### Non-Functional Requirements
1. **Lightweight:** Single-user, no authentication required for MVP.
2. **Extensible:** Architecture must support future multi-user accounts and mini-program clients without rewriting the backend.
3. **Stable Ingestion:** RSS-first approach; one failed source must not affect others.
4. **RESTful API:** All endpoints follow REST conventions with unified response wrapping and standard HTTP status codes.

## 3. Architecture

### 3.1 Separation

True front/back separation with independent deployable units:

- **Backend (`/backend`):** Node.js + Express + SQLite
  - REST API server
  - Scheduled crawler (node-cron)
  - Database access layer
- **Frontend (`/frontend`):** React + Vite + Tailwind CSS
  - Calls backend API via HTTP
  - Voice playback via Web Speech API (browser-side only)

### 3.2 Module Division

| Module | Responsibility | Dependencies |
|--------|---------------|--------------|
| Scheduler | Triggers crawl jobs at fixed intervals | Crawler |
| Crawler | Fetches RSS feeds, parses XML, normalizes data | Storage (SQLite) |
| Storage | Persists sources and articles | SQLite |
| API Layer | Exposes REST endpoints, request/response handling | Storage |
| Frontend | Renders UI, handles user interaction, voice playback | API Layer (HTTP) |

Each module only communicates with its immediate neighbors. The Frontend knows nothing about RSS or SQLite. The Crawler knows nothing about React.

## 4. Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend Runtime | Node.js 20+ |
| Backend Framework | Express.js 4 |
| Database | SQLite 3 (file-based) |
| DB Driver | `better-sqlite3` |
| RSS Parser | `rss-parser` |
| Scheduler | `node-cron` |
| Frontend Framework | React 18 |
| Frontend Build | Vite 5 |
| Styling | Tailwind CSS 3 |
| Voice TTS | Web Speech API (`speechSynthesis`) |
| HTML Sanitization | `dompurify` |

## 5. Data Model

### 5.1 `sources` — News Source Configuration

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | |
| name | TEXT | NOT NULL | Display name, e.g., "人民日报-时政" |
| rssUrl | TEXT | NOT NULL, UNIQUE | RSS feed URL |
| category | TEXT | | Topic category, e.g., "politics", "society" |
| isActive | BOOLEAN | NOT NULL, DEFAULT 1 | Whether to crawl this source |
| fetchIntervalMinutes | INTEGER | NOT NULL, DEFAULT 30 | Custom crawl interval |
| createdAt | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | |

### 5.2 `articles` — News Articles

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PRIMARY KEY, AUTOINCREMENT | |
| title | TEXT | NOT NULL | Article headline |
| summary | TEXT | | Short description from RSS |
| content | TEXT | | Full text if RSS provides it |
| originalUrl | TEXT | NOT NULL, UNIQUE | Link to original article |
| sourceId | INTEGER | NOT NULL, FOREIGN KEY (sources.id) | |
| publishedAt | DATETIME | | Article publish time from source |
| fetchedAt | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | When we ingested it |
| isRead | BOOLEAN | NOT NULL, DEFAULT 0 | Mark-as-read for single-user UX |

### 5.3 Design Decisions

- Deduplication is enforced via `originalUrl` UNIQUE constraint. Duplicate insertions are silently ignored.
- `content` may be null if the RSS feed only provides summaries. The detail view falls back to opening the original link in a new tab.
- No `userId` columns yet; the API layer will be designed so adding authentication later does not break existing queries.

## 6. API Design

### 6.1 Conventions

- **RESTful URLs:** Resource-based paths using plural nouns (`/api/articles`, `/api/sources`).
- **HTTP Methods:** `GET` for reads, `POST` for creates/actions.
- **Unified Response Wrapper:** Every response body follows this structure:
  ```json
  {
    "code": 0,
    "message": "success",
    "data": { ... }
  }
  ```
  - `code`: Business code. `0` means success. Non-zero for business errors.
  - `message`: Human-readable description.
  - `data`: Payload for successful responses; may be `null`.
- **HTTP Status Codes:** Standard codes are used:
  - `200 OK` — Success
  - `400 Bad Request` — Invalid query parameters or body
  - `404 Not Found` — Resource does not exist
  - `500 Internal Server Error` — Unexpected server error
- **Error Response Format:** On 4xx/5xx, the body still uses the unified wrapper:
  ```json
  {
    "code": 1001,
    "message": "Article not found",
    "data": null
  }
  ```

### 6.2 Endpoints

#### GET /api/articles
List articles with pagination and filtering.

**Query Parameters:**
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| page | integer | No | Default: 1 |
| limit | integer | No | Default: 20, Max: 100 |
| sourceId | integer | No | Filter by source |
| category | string | No | Filter by category |

**Success Response (200):**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": 1,
        "title": "...",
        "summary": "...",
        "originalUrl": "...",
        "sourceName": "人民日报-时政",
        "category": "politics",
        "publishedAt": "2026-06-30T08:00:00Z",
        "isRead": false
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  }
}
```

#### GET /api/articles/:id
Get a single article detail.

**Success Response (200):**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": 1,
    "title": "...",
    "summary": "...",
    "content": "...",
    "originalUrl": "...",
    "sourceName": "人民日报-时政",
    "publishedAt": "2026-06-30T08:00:00Z",
    "isRead": false
  }
}
```

**Error Response (404):**
```json
{
  "code": 1001,
  "message": "Article not found",
  "data": null
}
```

#### GET /api/sources
List all configured sources.

**Success Response (200):**
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": 1,
      "name": "人民日报-时政",
      "rssUrl": "http://www.people.com.cn/rss/politics.xml",
      "category": "politics",
      "isActive": true
    }
  ]
}
```

#### POST /api/crawl/trigger
Manually trigger a crawl cycle. Returns immediately; crawling happens asynchronously.

**Success Response (200):**
```json
{
  "code": 0,
  "message": "Crawl triggered",
  "data": null
}
```

## 7. Data Flow & Crawler Scheduling

### 7.1 Scheduled Crawl (every 30 minutes)

```
node-cron trigger
    → Crawler Service
        → SELECT * FROM sources WHERE isActive = 1
        → For each source:
            → rss-parser.fetch(source.rssUrl)
            → Parse items: title, description, content:encoded, link, pubDate
            → INSERT OR IGNORE INTO articles (...)
        → Log per-source success/failure
```

### 7.2 Isolation & Retry

- Each source is processed independently. A failure in one does not abort the batch.
- Network requests retry up to 3 times with exponential backoff: 1s, 2s, 4s.
- Parse errors log the problematic item and continue to the next item.

### 7.3 Manual Trigger

`POST /api/crawl/trigger` queues an immediate crawl cycle outside the normal schedule, useful for development and testing.

## 8. Frontend Design

### 8.1 Homepage (`/`)

- **Header:** App title + prominent **"全部播报"** button
- **Filter Bar:** Dropdown to select a news source; default shows all
- **News List:** Card-based layout
  - Each card: Title, summary (~100 chars), source badge, relative publish time
  - Per-card actions: **"播报"** button, **"查看详情"** link
- **Empty State:** If no articles exist yet, show "新闻抓取中，请稍候…"

### 8.2 Auto-Playback Mode

When **"全部播报"** is clicked:
1. All visible summaries are queued into a playlist.
2. `speechSynthesis.speak()` reads the first summary.
3. On `utterance.onend`, automatically advance to the next summary.
4. A floating control bar appears with:
   - **Pause / Resume**
   - **Stop**
   - **Next**
   - **Progress indicator** (e.g., "3 / 15")
5. The currently playing card is visually highlighted.
6. On page unload, `speechSynthesis.cancel()` terminates playback to prevent ghost audio.

### 8.3 Detail Page (`/article/:id`)

- Full title and sanitized content rendered as HTML
- Inline images from RSS `content:encoded` displayed natively
- Embedded videos supported:
  - `<video>` tags → render directly with native controls
  - `<iframe>` embeds → validate `src` against an allowed-domain whitelist, then render
  - Plain video URLs → auto-detect common platform patterns where possible
- "返回列表" button
- "播报全文" button (reads the full text content, skipping image alt-text and video descriptions)
- If `content` is empty, show "查看原文" link that opens `originalUrl` in a new tab

### 8.4 Content Security (HTML Sanitization)

- RSS `content` often contains raw HTML including `<script>` tags (XSS risk)
- All article `content` is sanitized via **DOMPurify** before rendering
- Allowed tags: `<p>`, `<br>`, `<img>`, `<a>`, `<h1>`–`<h6>`, `<strong>`, `<em>`, `<ul>`, `<ol>`, `<li>`, `<video>`, `<source>`, `<iframe>`, `<div>`, `<span>`
- For `<iframe>`, `src` is validated against an allowed list (e.g., known video platform domains)

### 8.5 Voice Playback Implementation

- Uses browser-native `speechSynthesis` API — no backend involvement, no API cost.
- Language set to `zh-CN` for Chinese news.
- If `speechSynthesis` is unsupported (rare), voice buttons are hidden gracefully.

## 9. Error Handling

| Scenario | Behavior |
|----------|----------|
| RSS source down/broken | Log error, skip source, continue batch |
| Network timeout | Retry 3× with exponential backoff, then mark failed |
| Database error on read | Return HTTP 500 with unified error wrapper |
| Invalid query param | Return HTTP 400 with field-level message |
| Article not found | Return HTTP 404 with `code: 1001` |
| TTS unsupported | Hide voice buttons silently |
| First-run empty DB | Frontend shows friendly waiting message |

## 10. Extensibility Design

### 10.1 Multi-User Path

- All API endpoints are stateless. Adding JWT auth later only requires middleware to populate `req.userId`.
- Database tables can be extended:
  - Add `users` table
  - Add `userId` to `articles` read-history or `user_sources` mapping table
  - SQLite can be migrated to PostgreSQL with minimal SQL changes

### 10.2 Multi-Client Path

- The React web app is one consumer of the REST API. A mini-program or mobile app can consume the exact same endpoints.
- Because the frontend is decoupled, it can be replaced or supplemented without backend changes.

### 10.3 Source Configurability

- Sources are stored in the database, not hardcoded. This allows future features where users add custom RSS subscriptions via UI or API.

## 11. Testing Strategy

Following test-driven development (TDD):

1. **Unit Tests:** RSS parsing logic, deduplication logic, response wrapper utility
2. **API Integration Tests:** Each endpoint tested with mocked database; verify status codes and response shape
3. **Frontend Component Tests:** Voice playlist controls (play, pause, next), filter interactions

Tests are written before implementation code.

## 12. Initial RSS Sources

| Source Name | RSS URL | Category |
|-------------|---------|----------|
| 人民日报-时政 | http://www.people.com.cn/rss/politics.xml | politics |
| 人民日报-社会 | http://www.people.com.cn/rss/society.xml | society |
| 人民日报-国际 | http://www.people.com.cn/rss/world.xml | world |
| 新浪新闻-要闻 | http://rss.sina.com.cn/news/index.shtml | general |
