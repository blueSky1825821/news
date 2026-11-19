import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { responseWrapper } from './middleware/responseWrapper.js';
import { errorHandler } from './middleware/errorHandler.js';
import articlesRouter from './routes/articles.js';
import sourcesRouter from './routes/sources.js';
import crawlRouter from './routes/crawl.js';
import authRouter from './routes/auth.js';
import categoriesRouter from './routes/categories.js';
import settingsRouter from './routes/settings.js';
import userCategoriesRouter from './routes/userCategories.js';
import wechatRouter from './routes/wechat.js';
import xinwenlianboRouter from './routes/xinwenlianbo.js';
import likesRouter from './routes/likes.js';
import commentsRouter from './routes/comments.js';
import usersRouter from './routes/users.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const app = express();

app.use(cors());
app.use(express.json());
app.use(responseWrapper);

app.use('/api/articles', articlesRouter);
app.use('/api/sources', sourcesRouter);
app.use('/api/crawl', crawlRouter);
app.use('/api/auth', authRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/users/categories', userCategoriesRouter);
app.use('/api/wechat', wechatRouter);

// Mirror API routes under /news for unified prefix access
app.use('/news/api/articles', articlesRouter);
app.use('/news/api/sources', sourcesRouter);
app.use('/news/api/crawl', crawlRouter);
app.use('/news/api/auth', authRouter);
app.use('/news/api/categories', categoriesRouter);
app.use('/news/api/settings', settingsRouter);
app.use('/news/api/users/categories', userCategoriesRouter);
app.use('/news/api/wechat', wechatRouter);
app.use('/api/xinwenlianbo', xinwenlianboRouter);
app.use('/news/api/xinwenlianbo', xinwenlianboRouter);

app.use('/api/users', usersRouter);
app.use('/news/api/users', usersRouter);

app.use('/api/articles/:id/likes', likesRouter);
app.use('/news/api/articles/:id/likes', likesRouter);
app.use('/api', commentsRouter);
app.use('/news/api', commentsRouter);

// Serve uploaded files
const uploadsPath = path.join(__dirname, '../public/uploads');
app.use('/uploads', express.static(uploadsPath));
app.use('/news/uploads', express.static(uploadsPath));

// Serve frontend static files in production under /news
const distPath = path.join(__dirname, '../../frontend/dist');
app.use('/news', express.static(distPath));
app.get('/news/*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Redirect root to /news for convenience
app.get('/', (req, res) => {
  res.redirect('/news/');
});

app.use(errorHandler);
