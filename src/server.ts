import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import dotenv from 'dotenv';
import reviewsRouter from './routes/reviews';
import postsRouter from './routes/posts';
import keywordsRouter from './routes/keywords';
import analysisRouter from './routes/analysis';

dotenv.config();

const app = express();

const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.RATE_LIMIT_MAX || 60),
});

app.use(limiter);
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/reviews', reviewsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/keywords', keywordsRouter);
app.use('/api/analysis', analysisRouter);

const publicDir = path.join(process.cwd(), 'public');
app.use(express.static(publicDir));

app.get('*', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

