import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { responseWrapper } from './middleware/responseWrapper.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import articlesRouter from './routes/articles.js';
import trendsRouter from './routes/trends.js';
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

app.use(['/api', '/news/api'], requestLogger);
app.use(cors({ exposedHeaders: ['X-Request-ID'] }));
app.use(express.json());
app.use(responseWrapper);

const apiRoutes = [
  ['/articles', articlesRouter],
  ['/trends', trendsRouter],
  ['/sources', sourcesRouter],
  ['/crawl', crawlRouter],
  ['/auth', authRouter],
  ['/categories', categoriesRouter],
  ['/settings', settingsRouter],
  ['/users/categories', userCategoriesRouter],
  ['/wechat', wechatRouter],
  ['/xinwenlianbo', xinwenlianboRouter],
  ['/users', usersRouter],
  ['/articles/:id/likes', likesRouter],
  ['', commentsRouter]
];

for (const [route, router] of apiRoutes) {
  app.use(['/api' + route, '/news/api' + route], router);
}

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
