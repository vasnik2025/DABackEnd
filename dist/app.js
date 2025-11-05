"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// FIX: Use default import for express and named imports for types.
// FIX: Use `import type` for type-only imports to resolve conflicts.
const express_1 = __importDefault(require("express"));
const dns_1 = __importDefault(require("dns"));
const path_1 = __importDefault(require("path"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const pino_http_1 = __importDefault(require("pino-http"));
const cors_2 = require("./config/cors");
const routes_1 = __importDefault(require("./routes"));
const paypalWebhookController_1 = require("./controllers/paypalWebhookController");
const app = (0, express_1.default)();
if (typeof dns_1.default.setDefaultResultOrder === 'function') {
    dns_1.default.setDefaultResultOrder('ipv4first');
}
// Logging
app.use((0, pino_http_1.default)({ level: process.env.LOG_LEVEL || 'info' }));
// Disable automatic ETag generation (prevents stale 304 responses for dynamic resources like photos)
app.set('etag', false);
// Force clients and proxies to refetch API responses (helps with photo replacement visibility)
app.use((_req, res, next) => {
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
app.use((0, helmet_1.default)({
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
app.use((0, cors_1.default)(cors_2.corsOptions));
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (0, cors_2.isCorsOriginAllowed)(origin)) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    next();
});
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '20mb';
const PAYPAL_WEBHOOK_PATH = '/api/paypal/webhook';
const jsonParser = express_1.default.json({ limit: JSON_BODY_LIMIT });
const urlencodedParser = express_1.default.urlencoded({ limit: JSON_BODY_LIMIT, extended: true });
const shouldBypassBodyParsing = (req) => req.originalUrl.startsWith(PAYPAL_WEBHOOK_PATH);
// PayPal webhook must process the raw body for signature verification
app.post(PAYPAL_WEBHOOK_PATH, express_1.default.raw({ type: 'application/json' }), paypalWebhookController_1.handleWebhook);
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
app.use((0, cookie_parser_1.default)());
// Static uploads for fake chat media
const uploadsDir = path_1.default.resolve(__dirname, '../uploads');
app.use('/uploads', express_1.default.static(uploadsDir));
// Health
app.get(['/healthz', '/api/health', '/health'], (_req, res) => res.status(200).json({ ok: true }));
// API
app.use('/api', routes_1.default);
// Error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err, req, res, _next) => {
    const status = Number(err?.statusCode || err?.status || 500);
    if (req.log) {
        req.log.error({ err, url: req.originalUrl, method: req.method }, 'Unhandled error');
    }
    res.status(status).json({ message: status === 500 ? 'Internal Server Error' : err?.message || 'Error' });
});
exports.default = app;
