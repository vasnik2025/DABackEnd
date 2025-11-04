import type { CorsOptions } from 'cors';

const normalizeOrigin = (value: string): string =>
  value.trim().replace(/\/$/, '').toLowerCase();

const raw = process.env.ALLOWED_ORIGINS || process.env.CSP_CONNECT_SRC || '';
// Example value in Azure: "https://DateAstrum.com,https://www.DateAstrum.com"
const envAllowList = raw
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Add defaults for when environment variables are not set
const defaultAllowList = [
  'https://DateAstrum.com',
  'https://www.DateAstrum.com',
];

const derivedAllowList = [...new Set([...envAllowList, ...defaultAllowList])]
  .map(normalizeOrigin);

const isAllowedOrigin = (origin: string): boolean => {
  const normalized = normalizeOrigin(origin);
  if (derivedAllowList.includes(normalized)) return true;

  // Allow any https subdomain of DateAstrum.com (e.g., app.DateAstrum.com)
  if (normalized.endsWith('.DateAstrum.com')) return true;

  return false;
};

export const corsOptions: CorsOptions = {
  origin: (origin, cb) => {
    // allow server-to-server and same-origin tools
    if (!origin) return cb(null, true);
    if (isAllowedOrigin(origin)) return cb(null, true);
    cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  maxAge: 600,
};

