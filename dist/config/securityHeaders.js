"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.securityHeaders = void 0;
// Backend only returns JSON, but keep a minimal CSP.
// (Frontend CSP is controlled by Static Web App config.)
exports.securityHeaders = {
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", 'https://api.DateAstrum.com'],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            fontSrc: ["'self'", 'https:', 'data:'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginEmbedderPolicy: false,
};
