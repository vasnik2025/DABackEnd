"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWebhook = void 0;
const db_1 = require("../config/db");
const emailService_1 = require("../utils/emailService");
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
// ===== PayPal config =====
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
const WEBHOOK_ID = resolveEnv('PAYPAL_WEBHOOK_ID', [
    'PAYPAL_WEBHOOKID',
    'PAYPAL_LIVE_WEBHOOK_ID',
    'PAYPAL_SANDBOX_WEBHOOK_ID',
]);
if (!CLIENT_ID || !SECRET) {
    console.warn('[PayPal] Client ID or secret is not configured. Webhook verification will fail.');
}
const API_BASE = MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
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
// OAuth2 client-credentials
async function getAccessToken() {
    const basic = Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64');
    const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`PayPal OAuth failed: ${res.status} ${txt}`);
    }
    const data = (await res.json());
    return data.access_token;
}
const recordWebhookFailure = (failureType, options = {}) => {
    const { error, message, context, isConnectivityOverride } = options;
    const statusCode = error ? (0, paypalTelemetry_1.extractStatusCode)(error) : null;
    const paypalErrorCode = error ? (0, paypalTelemetry_1.extractPaypalErrorCode)(error) : null;
    const paypalStatus = error ? (0, paypalTelemetry_1.extractPaypalStatus)(error) : null;
    const fallbackMessage = message ?? 'PayPal webhook failure';
    const errorMessage = error ? (0, paypalTelemetry_1.extractErrorMessage)(error, fallbackMessage) : fallbackMessage;
    const isConnectivity = typeof isConnectivityOverride === 'boolean'
        ? isConnectivityOverride
        : error
            ? (0, paypalTelemetry_1.isConnectivityError)(error)
            : false;
    void (0, paypalTelemetry_1.safeRecordPaypalFailure)({
        failureType,
        statusCode,
        paypalErrorCode,
        paypalStatus,
        isConnectivity,
        errorMessage,
        context,
    });
};
// ===== Controller =====
// IMPORTANT: This route must receive a RAW body (Buffer). See app.ts change below.
const handleWebhook = async (req, res) => {
    try {
        if (!CLIENT_ID || !SECRET || !WEBHOOK_ID) {
            console.error('[PayPal] Missing env (clientId/secret/webhookId).');
            recordWebhookFailure('webhook_configuration_error', {
                message: 'PayPal webhook is missing credentials or webhook id.',
                context: {
                    hasClientId: Boolean(CLIENT_ID),
                    hasSecret: Boolean(SECRET),
                    hasWebhookId: Boolean(WEBHOOK_ID),
                },
            });
            return res.sendStatus(500);
        }
        // Keep the original raw bytes for signature verification
        const raw = Buffer.isBuffer(req.body)
            ? req.body
            : Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
        const webhookEvent = JSON.parse(raw.toString('utf8'));
        const eventType = typeof webhookEvent?.event_type === 'string'
            ? webhookEvent.event_type
            : 'unknown';
        // Build verify payload from headers + event + webhook_id
        const headers = req.headers;
        const verifyPayload = {
            auth_algo: headers['paypal-auth-algo'],
            cert_url: headers['paypal-cert-url'],
            transmission_id: headers['paypal-transmission-id'],
            transmission_sig: headers['paypal-transmission-sig'],
            transmission_time: headers['paypal-transmission-time'],
            webhook_id: WEBHOOK_ID,
            webhook_event: webhookEvent,
        };
        let accessToken;
        try {
            accessToken = await getAccessToken();
        }
        catch (error) {
            console.error('[PayPal] OAuth token request failed', error);
            recordWebhookFailure('webhook_access_token_failure', {
                error,
                message: 'Failed to retrieve PayPal OAuth token for webhook verification.',
                context: {
                    eventType: webhookEvent?.event_type,
                    transmissionId: headers['paypal-transmission-id'],
                },
            });
            return res.sendStatus(500);
        }
        const verifyRes = await fetch(`${API_BASE}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(verifyPayload),
        });
        const verify = (await verifyRes.json());
        if (verify.verification_status !== 'SUCCESS') {
            console.warn('[PayPal] Webhook verification failed:', verify);
            recordWebhookFailure('webhook_verification_failure', {
                message: 'PayPal webhook signature verification failed.',
                context: {
                    verificationStatus: verify.verification_status ?? null,
                    eventType,
                    transmissionId: headers['paypal-transmission-id'],
                },
            });
            return res.sendStatus(400);
        }
        // Verified - handle event types you need
        console.log(`[PayPal] Event received: ${eventType}`);
        if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
            const pool = await (0, db_1.getPool)();
            const transaction = new db_1.sql.Transaction(pool);
            const capture = webhookEvent.resource;
            if (capture?.status !== 'COMPLETED') {
                console.log(`[PayPal] Skipping capture with status '${capture?.status}'.`);
                return res.sendStatus(200);
            }
            const customMetadata = parseCustomMetadata(capture?.custom_id);
            const userId = customMetadata.userId;
            const planType = customMetadata.planType;
            const usernameFromMetadata = customMetadata.username;
            const orderId = capture?.supplementary_data?.related_ids?.order_id;
            const captureId = capture?.id;
            const captureStatus = capture?.status;
            const payerEmail = capture?.payer?.email_address;
            const transactionTime = capture?.create_time ? new Date(capture.create_time) : new Date();
            const orderStatus = 'COMPLETED';
            const orderAmount = capture?.amount?.value;
            const orderCurrency = capture?.amount?.currency_code;
            try {
                if (!userId || !orderId || !captureId) {
                    console.error('[PayPal] Missing critical data in webhook (UserID, OrderID, or CaptureID).', {
                        orderId,
                        userId,
                        captureId,
                        planType,
                        customId: customMetadata.original,
                    });
                    recordWebhookFailure('webhook_missing_metadata', {
                        message: 'Webhook capture event missing required identifiers.',
                        context: {
                            orderId,
                            userId,
                            captureId,
                            planType,
                            eventType,
                        },
                    });
                    return res.sendStatus(200); // Ack anyway
                }
                await transaction.begin();
                // 1. Insert into PaypalOrders
                const orderRequest = new db_1.sql.Request(transaction);
                await orderRequest
                    .input('OrderID', db_1.sql.VarChar, orderId)
                    .input('UserID', db_1.sql.VarChar, userId)
                    .input('Status', db_1.sql.VarChar, orderStatus)
                    .input('Amount', db_1.sql.Decimal(10, 2), orderAmount)
                    .input('Currency', db_1.sql.VarChar, orderCurrency)
                    .query(`
            INSERT INTO PaypalOrders (OrderID, UserID, Status, Amount, Currency, CreatedAt, UpdatedAt)
            VALUES (@OrderID, @UserID, @Status, @Amount, @Currency, GETUTCDATE(), GETUTCDATE())
          `);
                console.log(`[PayPal] Logged order ${orderId} for plan ${planType}${usernameFromMetadata ? ` (username: ${usernameFromMetadata})` : ''}`);
                // 2. Insert into PaypalTransactions
                const transactionRequest = new db_1.sql.Request(transaction);
                await transactionRequest
                    .input('TransactionID', db_1.sql.VarChar, captureId)
                    .input('UserID', db_1.sql.VarChar, userId)
                    .input('PaypalOrderID', db_1.sql.VarChar, orderId)
                    .input('PaypalCaptureID', db_1.sql.VarChar, captureId)
                    .input('Amount', db_1.sql.Decimal(10, 2), capture?.amount?.value)
                    .input('Currency', db_1.sql.VarChar, capture?.amount?.currency_code)
                    .input('Status', db_1.sql.VarChar, captureStatus)
                    .input('PayerEmail', db_1.sql.NVarChar, payerEmail)
                    .input('TransactionTime', db_1.sql.DateTime2, transactionTime)
                    .input('WebhookEvent', db_1.sql.NVarChar(db_1.sql.MAX), JSON.stringify(webhookEvent))
                    .query(`
            INSERT INTO PaypalTransactions (TransactionID, UserID, PaypalOrderID, PaypalCaptureID, Amount, Currency, Status, PayerEmail, TransactionTime, WebhookEvent, CreatedAt, UpdatedAt)
            VALUES (@TransactionID, @UserID, @PaypalOrderID, @PaypalCaptureID, @Amount, @Currency, @Status, @PayerEmail, @TransactionTime, @WebhookEvent, GETUTCDATE(), GETUTCDATE())
          `);
                console.log(`[PayPal] Logged transaction ${captureId} for plan ${planType}${usernameFromMetadata ? ` (username: ${usernameFromMetadata})` : ''}`);
                // 3. Update Users table
                const updateRequest = new db_1.sql.Request(transaction);
                const updateResult = await updateRequest
                    .input('UserID', db_1.sql.VarChar, userId)
                    .query(`
            DECLARE @UpdatedUsernames TABLE (Username NVARCHAR(255));
            UPDATE Users 
            SET 
              MembershipType = 'platinum', 
              SubscribedAt = GETUTCDATE(), 
              MembershipExpiryDate = DATEADD(month, 1, GETUTCDATE()),
              NextPaymentDueAt = DATEADD(month, 1, GETUTCDATE())
            OUTPUT inserted.Username INTO @UpdatedUsernames
            WHERE UserID = @UserID;
            SELECT Username FROM @UpdatedUsernames;
          `);
                if (updateResult.recordset.length === 0) {
                    throw new Error(`Could not find user with ID ${userId} to upgrade.`);
                }
                const username = updateResult.recordset[0].Username;
                console.log(`[PayPal] Upgraded user ${username} (ID: ${userId}) after ${planType} capture.`);
                await transaction.commit();
                // 4. Send email after successful commit
                if (payerEmail) {
                    await (0, emailService_1.sendSubscriptionConfirmationEmail)(payerEmail, username);
                }
            }
            catch (transactionError) {
                console.error('[PayPal] Transaction error in webhook:', transactionError?.message || transactionError);
                recordWebhookFailure('webhook_transaction_failure', {
                    error: transactionError,
                    context: {
                        eventType,
                        orderId,
                        captureId,
                        userId,
                    },
                });
                await transaction.rollback();
            }
        }
        return res.sendStatus(200);
    }
    catch (err) {
        console.error('[PayPal] Error processing webhook:', err?.message || err);
        recordWebhookFailure('webhook_unhandled_exception', {
            error: err,
            context: {
                requestId: req.headers['paypal-transmission-id'],
            },
        });
        return res.sendStatus(500);
    }
};
exports.handleWebhook = handleWebhook;
exports.default = exports.handleWebhook;
