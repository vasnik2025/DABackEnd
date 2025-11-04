"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureOrder = exports.createOrder = void 0;
const checkout_server_sdk_1 = __importDefault(require("@paypal/checkout-server-sdk"));
const errorHandler_1 = require("../utils/errorHandler");
const paypalTelemetry_1 = require("../utils/paypalTelemetry");
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
const normalizeMode = (raw) => {
    const lowered = raw.trim().toLowerCase();
    if (['live', 'production', 'prod'].includes(lowered)) {
        return 'live';
    }
    return 'sandbox';
};
const MODE = normalizeMode(resolveEnv('PAYPAL_MODE', ['PAYPAL_ENVIRONMENT', 'PAYPAL_ENV', 'PAYPAL_STAGE']));
const CLIENT_ID = resolveEnv('PAYPAL_CLIENT_ID', [
    'PAYPAL_CLIENTID',
    'PAYPAL_REST_CLIENT_ID',
    'PAYPAL_LIVE_CLIENT_ID',
    'PAYPAL_SANDBOX_CLIENT_ID',
]);
const SECRET = resolveEnv('PAYPAL_SECRET', [
    'PAYPAL_CLIENT_SECRET',
    'PAYPAL_CLIENTSECRET',
    'PAYPAL_REST_CLIENT_SECRET',
    'PAYPAL_LIVE_CLIENT_SECRET',
    'PAYPAL_SANDBOX_CLIENT_SECRET',
]);
const MEMBERSHIP_PRICE_EUR = process.env.PAYPAL_MEMBERSHIP_PRICE_EUR || '2.00';
const PURCHASE_DESCRIPTION = process.env.PAYPAL_PURCHASE_DESCRIPTION ||
    '1 Month Platinum Membership for DateAstrum.com';
const SINGLE_PRICE_EUR = process.env.PAYPAL_SINGLE_PRICE_EUR || '15.00';
const SINGLE_PURCHASE_DESCRIPTION = process.env.PAYPAL_SINGLE_PURCHASE_DESCRIPTION ||
    '1 Month Single Access Membership for DateAstrum.com';
const FRONTEND_BASE_URL = resolveEnv('PAYPAL_FRONTEND_BASE_URL', ['FRONTEND_URL', 'PUBLIC_FRONTEND_URL']) ||
    'https://dateastrum.com';
const NORMALIZED_FRONTEND_BASE = FRONTEND_BASE_URL.replace(/\/$/, '');
const DEFAULT_RETURN_URL = resolveEnv('PAYPAL_RETURN_URL', ['PAYPAL_SUCCESS_URL']) ||
    `${NORMALIZED_FRONTEND_BASE}/payments/paypal/return`;
const DEFAULT_CANCEL_URL = resolveEnv('PAYPAL_CANCEL_URL', ['PAYPAL_CANCEL_RETURN_URL']) ||
    `${NORMALIZED_FRONTEND_BASE}/payments/paypal/cancel`;
let cachedClient = null;
const sanitizeUrl = (value, fallback) => {
    if (typeof value !== 'string') {
        return fallback;
    }
    try {
        const parsed = new URL(value.trim());
        if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            return parsed.toString();
        }
    }
    catch {
        // ignore malformed URL
    }
    return fallback;
};
const parseCustomMetadata = (raw) => {
    if (typeof raw !== 'string' || !raw.trim()) {
        return { userId: null, planType: 'couple', username: null, original: null };
    }
    const trimmed = raw.trim();
    const [idPart, planPart, usernamePart] = trimmed.split('|');
    const plan = typeof planPart === 'string' && planPart.toLowerCase() === 'single'
        ? 'single'
        : 'couple';
    const userId = typeof idPart === 'string' && idPart.trim().length ? idPart.trim() : null;
    const username = typeof usernamePart === 'string' && usernamePart.trim().length ? usernamePart.trim() : null;
    return { userId, planType: plan, username, original: trimmed };
};
const resolveEnvironment = () => {
    const Environment = MODE === 'live'
        ? checkout_server_sdk_1.default.core.LiveEnvironment
        : checkout_server_sdk_1.default.core.SandboxEnvironment;
    return new Environment(CLIENT_ID, SECRET);
};
const getClient = () => {
    if (!CLIENT_ID || !SECRET) {
        throw new errorHandler_1.OperationalError('Payment service is not configured correctly. Please contact support.', 503);
    }
    if (!cachedClient) {
        cachedClient = new checkout_server_sdk_1.default.core.PayPalHttpClient(resolveEnvironment());
    }
    return cachedClient;
};
const asOperationalError = (error, fallbackMessage, fallbackStatus = 502) => {
    if (error instanceof errorHandler_1.OperationalError) {
        return error;
    }
    const statusCandidate = Number(error.statusCode ||
        error.status);
    const status = Number.isFinite(statusCandidate) && statusCandidate >= 400 && statusCandidate < 600
        ? statusCandidate
        : fallbackStatus;
    const message = typeof error.message === 'string' &&
        error.message.trim().length
        ? error.message
        : fallbackMessage;
    const opError = new errorHandler_1.OperationalError(message, status);
    opError.details = error;
    return opError;
};
const createOrder = async (req, res, next) => {
    let requestUserId = null;
    let requestUsername = null;
    let requestPlanType = null;
    try {
        const payload = req.body ?? {};
        const { userId, username, planType } = payload;
        requestUserId = typeof userId === 'string' ? userId : null;
        requestUsername = typeof username === 'string' ? username : null;
        requestPlanType = typeof planType === 'string' ? planType : null;
        const returnUrl = sanitizeUrl(payload?.returnUrl, DEFAULT_RETURN_URL);
        const cancelUrl = sanitizeUrl(payload?.cancelUrl, DEFAULT_CANCEL_URL);
        if (!userId) {
            return next(new errorHandler_1.OperationalError('userId is required to create an order.', 400));
        }
        const client = getClient();
        const isSinglePlan = String(planType ?? '').toLowerCase() === 'single';
        const planDescriptor = isSinglePlan ? 'single' : 'couple';
        const sanitizedUsername = typeof username === 'string' && username.trim().length
            ? username.trim().replace(/\|/g, '_')
            : '';
        const customMetadata = `${String(userId)}|${planDescriptor}${sanitizedUsername ? `|${sanitizedUsername}` : ''}`;
        const request = new checkout_server_sdk_1.default.orders.OrdersCreateRequest();
        request.prefer('return=representation');
        request.requestBody({
            intent: 'CAPTURE',
            purchase_units: [
                {
                    description: isSinglePlan ? SINGLE_PURCHASE_DESCRIPTION : PURCHASE_DESCRIPTION,
                    custom_id: customMetadata,
                    reference_id: planDescriptor,
                    soft_descriptor: 'DateAstrum',
                    amount: {
                        currency_code: 'EUR',
                        value: isSinglePlan ? SINGLE_PRICE_EUR : MEMBERSHIP_PRICE_EUR,
                    },
                },
            ],
            application_context: {
                brand_name: 'DateAstrum',
                shipping_preference: 'NO_SHIPPING',
                user_action: 'PAY_NOW',
                return_url: returnUrl,
                cancel_url: cancelUrl,
            },
        });
        const response = await client.execute(request);
        const orderId = response?.result?.id;
        const links = Array.isArray(response?.result?.links)
            ? response.result.links
            : [];
        const approvalUrl = links.find((link) => link?.rel === 'approve' && typeof link?.href === 'string')
            ?.href ?? null;
        if (!orderId) {
            throw new Error('PayPal order id is missing in the response.');
        }
        if (!approvalUrl) {
            throw new Error('PayPal approval URL is missing in the response.');
        }
        console.info('[PayPal] Created order', {
            orderId,
            status: response?.result?.status,
            userId,
            username,
            planType: isSinglePlan ? 'single' : 'couple',
            approvalUrl,
        });
        res.status(200).json({
            orderId,
            status: response?.result?.status,
            approvalUrl,
            planType: planDescriptor,
        });
    }
    catch (error) {
        console.error('[PayPal] Failed to create order', error);
        const statusCode = (0, paypalTelemetry_1.extractStatusCode)(error);
        const paypalErrorCode = (0, paypalTelemetry_1.extractPaypalErrorCode)(error);
        const paypalStatus = (0, paypalTelemetry_1.extractPaypalStatus)(error);
        const message = (0, paypalTelemetry_1.extractErrorMessage)(error, 'Failed to initialize PayPal payment');
        void (0, paypalTelemetry_1.safeRecordPaypalFailure)({
            failureType: 'create_order_failure',
            userId: requestUserId,
            orderId: null,
            statusCode,
            paypalErrorCode,
            paypalStatus,
            isConnectivity: (0, paypalTelemetry_1.isConnectivityError)(error),
            errorMessage: message,
            context: {
                planType: requestPlanType,
                username: requestUsername,
                stage: 'createOrder',
            },
        });
        next(asOperationalError(error, 'Failed to initialize PayPal payment. Please try again later.'));
    }
};
exports.createOrder = createOrder;
const captureOrder = async (req, res, next) => {
    let requestedOrderId = null;
    try {
        const { orderId } = req.body ?? {};
        requestedOrderId = typeof orderId === 'string' ? orderId : null;
        if (!orderId) {
            return next(new errorHandler_1.OperationalError('orderId is required to capture an order.', 400));
        }
        const client = getClient();
        const request = new checkout_server_sdk_1.default.orders.OrdersCaptureRequest(orderId);
        request.requestBody({});
        const response = await client.execute(request);
        const status = response?.result?.status ?? 'UNKNOWN';
        const captureId = response?.result?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
        const customId = response?.result?.purchase_units?.[0]?.custom_id ??
            response?.result?.purchase_units?.[0]?.reference_id;
        const { userId: parsedUserId, planType, username: parsedUsername } = parseCustomMetadata(customId);
        console.info('[PayPal] Captured order', {
            orderId,
            status,
            captureId,
            customId,
            planType,
            parsedUserId,
            parsedUsername,
        });
        res.status(200).json({
            status,
            orderId,
            captureId,
            customId,
            planType,
            userId: parsedUserId,
            username: parsedUsername,
        });
    }
    catch (error) {
        console.error('[PayPal] Failed to capture order', error);
        const statusCode = (0, paypalTelemetry_1.extractStatusCode)(error);
        const paypalErrorCode = (0, paypalTelemetry_1.extractPaypalErrorCode)(error);
        const paypalStatus = (0, paypalTelemetry_1.extractPaypalStatus)(error);
        const message = (0, paypalTelemetry_1.extractErrorMessage)(error, 'Failed to capture PayPal payment');
        void (0, paypalTelemetry_1.safeRecordPaypalFailure)({
            failureType: 'capture_order_failure',
            userId: null,
            orderId: requestedOrderId,
            statusCode,
            paypalErrorCode,
            paypalStatus,
            isConnectivity: (0, paypalTelemetry_1.isConnectivityError)(error),
            errorMessage: message,
            context: {
                stage: 'captureOrder',
                orderId: requestedOrderId,
            },
        });
        next(asOperationalError(error, 'Failed to capture PayPal payment. Please try again later.'));
    }
};
exports.captureOrder = captureOrder;
