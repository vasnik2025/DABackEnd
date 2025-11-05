"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.corsOptions = exports.isCorsOriginAllowed = void 0;
const normalizeOrigin = (value) => value.trim().replace(/\/$/, '').toLowerCase();
const raw = process.env.ALLOWED_ORIGINS || process.env.CSP_CONNECT_SRC || '';
// Example value in Azure: "https://dateastrum.com,https://www.dateastrum.com"
const envAllowList = raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
// Add defaults for when environment variables are not set
const defaultAllowList = [
    'https://dateastrum.com',
    'https://www.dateastrum.com',
];
const derivedAllowList = [...new Set([...envAllowList, ...defaultAllowList])]
    .map(normalizeOrigin);
const isCorsOriginAllowed = (origin) => {
    const normalized = normalizeOrigin(origin);
    if (derivedAllowList.includes(normalized))
        return true;
    // Allow any https subdomain of dateastrum.com (e.g., app.dateastrum.com)
    if (normalized.endsWith('.dateastrum.com'))
        return true;
    return false;
};
exports.isCorsOriginAllowed = isCorsOriginAllowed;
exports.corsOptions = {
    origin: (origin, cb) => {
        // allow server-to-server and same-origin tools
        if (!origin)
            return cb(null, true);
        if ((0, exports.isCorsOriginAllowed)(origin))
            return cb(null, true);
        cb(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
};
