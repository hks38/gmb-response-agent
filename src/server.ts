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
import geographicRouter from './routes/geographic';
import authRouter from './routes/auth';
import settingsRouter from './routes/settings';
import competitiveRouter from './routes/competitive';
import replyTemplatesRouter from './routes/replyTemplates';
import replyVoicesRouter from './routes/replyVoices';
import { parseCookies, verifySessionToken } from './services/session';
import { startScheduler } from './jobs/scheduler';
import meRouter from './routes/me';
import businessRouter from './routes/business';
import { tenantGuard } from './middleware/tenant';

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

const publicDir = path.join(process.cwd(), 'public');

// --------
// App Login / Portal routing
// --------
app.get('/login', (_req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['app_session'];
  const user = token ? verifySessionToken(token) : null;
  if (!user?.userId) {
    return res.redirect('/login');
  }
  (req as any).user = user;
  next();
};

// Redirect root based on auth
app.get('/', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['app_session'];
  const user = token ? verifySessionToken(token) : null;
  return res.redirect(user ? '/portal' : '/login');
});

// Portal (dashboard)
app.get('/portal', requireAuth, (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// --------
// API routes
// --------
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Public API endpoint for Google Maps API key (frontend needs this)
app.get('/api/config/maps-key', (_req, res) => {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  if (!key) {
    return res.status(503).json({ error: 'Google Maps API key not configured' });
  }
  res.json({ apiKey: key });
});

app.use('/api/auth', authRouter);

// Protect all other /api/* routes
app.use('/api', (req, res, next) => {
  // Public endpoints that don't require authentication
  if (req.path.startsWith('/auth') || req.path.startsWith('/health') || req.path.startsWith('/config')) return next();
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies['app_session'];
  const user = token ? verifySessionToken(token) : null;
  if (!user?.userId) return res.status(401).json({ error: 'Not authenticated' });
  (req as any).user = user;
  next();
});

// Tenant guard for all tenant-scoped APIs
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path.startsWith('/health')) return next();
  if (req.path.startsWith('/me') || req.path.startsWith('/business')) return next();
  return tenantGuard(req as any, res as any, next);
});

app.use('/api/me', meRouter);
app.use('/api/business', businessRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/posts', postsRouter);
app.use('/api/keywords', keywordsRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/geographic', geographicRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/competitive', competitiveRouter);
app.use('/api/reply-templates', replyTemplatesRouter);
app.use('/api/reply-voices', replyVoicesRouter);

app.use(express.static(publicDir));

app.get('*', (_req, res) => {
  // any unknown route -> send to login (since portal is gated at /portal)
  res.redirect('/login');
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  try {
    startScheduler();
  } catch (e: any) {
    console.error('Failed to start scheduler:', e.message);
  }
});

