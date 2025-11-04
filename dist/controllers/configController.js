"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaypalClientId = void 0;
const errorHandler_1 = require("../utils/errorHandler");
const resolveEnv = (primary, fallbacks = []) => {
    const keys = [primary, ...fallbacks];
    for (const key of keys) {
        const value = process.env[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return '';
};
const getPaypalClientId = (req, res, next) => {
    const clientId = resolveEnv('PAYPAL_CLIENT_ID', [
        'PAYPAL_CLIENTID',
        'PAYPAL_REST_CLIENT_ID',
        'PAYPAL_LIVE_CLIENT_ID',
        'PAYPAL_SANDBOX_CLIENT_ID',
    ]);
    if (!clientId) {
        console.error('[PayPal] Client ID is not configured in environment variables.');
        return next(new errorHandler_1.OperationalError('Payment service is not configured correctly. Please contact support.', 503));
    }
    res.status(200).json({ clientId });
};
exports.getPaypalClientId = getPaypalClientId;
