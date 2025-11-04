// FIX: Removed reference to "node" types and declared process to resolve build error.
declare var process: any;

// FIX: Use default import for express and named imports for types.
// FIX: Use `import type` for type-only imports to resolve conflicts.
import express from 'express';
import dns from 'dns';
import path from 'path';
// FIX: Changed to a type-only import to resolve type conflicts.
import type { Request, Response, NextFunction, Application } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { corsOptions } from './config/cors';
import routes from './routes';
import { handleWebhook as handlePaypalWebhook } from './controllers/paypalWebhookController';

const app: Application = express();

if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// Logging
app.use(pinoHttp({ level: process.env.LOG_LEVEL || 'info' }));

// Disable automatic ETag generation (prevents stale 304 responses for dynamic resources like photos)
app.set('etag', false);

// Force clients and proxies to refetch API responses (helps with photo replacement visibility)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
});

// Trust proxy when behind Azure
if (process.env.TRUST_PROXY === 'true' || process.env.WEBSITE_SITE_NAME) {
  app.set('trust proxy', 1);
}

// Security headers - keep CSP minimal on API (no script/style sources needed)
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      // API doesn't serve pages, but keep it sane
      'default-src': ["'self'"],
      'frame-ancestors': ["'none'"],
      'form-action': [
        "'self'",
        'https://www.paypal.com',
        'https://www.paypalobjects.com',
        'https://www.sandbox.paypal.com',
      ],
    },
  },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
}));

// CORS (only Azure allowlist)
app.use(cors(corsOptions));

const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '20mb';
const PAYPAL_WEBHOOK_PATH = '/api/paypal/webhook';
const jsonParser = express.json({ limit: JSON_BODY_LIMIT });
const urlencodedParser = express.urlencoded({ limit: JSON_BODY_LIMIT, extended: true });
const shouldBypassBodyParsing = (req: Request) =>
  req.originalUrl.startsWith(PAYPAL_WEBHOOK_PATH);

// PayPal webhook must process the raw body for signature verification
app.post(
  PAYPAL_WEBHOOK_PATH,
  express.raw({ type: 'application/json' }),
  handlePaypalWebhook,
);
app.options(PAYPAL_WEBHOOK_PATH, (_req, res) => {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return res.sendStatus(204);
});

// Body & cookies
app.use((req, res, next) => {
  if (shouldBypassBodyParsing(req)) {
    return next();
  }
  return jsonParser(req, res, next);
});
app.use((req, res, next) => {
  if (shouldBypassBodyParsing(req)) {
    return next();
  }
  return urlencodedParser(req, res, next);
});
app.use(cookieParser());

// Static uploads for fake chat media
const uploadsDir = path.resolve(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// Health
app.get(['/healthz', '/api/health', '/health'], (_req: Request, res: Response) => res.status(200).json({ ok: true }));

// API
app.use('/api', routes);

// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = Number(err?.statusCode || err?.status || 500);
  if ((req as any).log) {
    (req as any).log.error({ err, url: req.originalUrl, method: req.method }, 'Unhandled error');
  }
  res.status(status).json({ message: status === 500 ? 'Internal Server Error' : err?.message || 'Error' });
});

export default app;
