// FIX: Removed reference to "node" types and declared Buffer/process to resolve build error.
declare var Buffer: {
  from(string: string, encoding?: string): { toString(encoding?: string): string };
  isBuffer(obj: any): boolean;
};
declare var process: any;

// FIX: Changed type-only import to standard import to fix type resolution.
import type { Request, Response } from 'express';
import { getPool, sql } from '../config/db';
import { sendSubscriptionConfirmationEmail } from '../utils/emailService';
import {
  extractErrorMessage,
  extractPaypalErrorCode,
  extractPaypalStatus,
  extractStatusCode,
  isConnectivityError,
  safeRecordPaypalFailure,
} from '../utils/paypalTelemetry';

const resolveEnv = (primary: string, fallbacks: string[] = []): string => {
  const keys = [primary, ...fallbacks];
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const normalizeMode = (raw: string): 'sandbox' | 'live' => {
  const lowered = raw.trim().toLowerCase();
  if (['live', 'production', 'prod'].includes(lowered)) {
    return 'live';
  }
  return 'sandbox';
};

// ===== PayPal config =====
const MODE = normalizeMode(
  resolveEnv('PAYPAL_MODE', ['PAYPAL_ENVIRONMENT', 'PAYPAL_ENV', 'PAYPAL_STAGE']),
);
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

const API_BASE =
  MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const parseCustomMetadata = (
  raw: unknown,
): {
  userId: string | null;
  planType: 'single' | 'couple';
  username: string | null;
  original: string | null;
} => {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { userId: null, planType: 'couple', username: null, original: null };
  }

  const trimmed = raw.trim();
  const [idPart, planPart, usernamePart] = trimmed.split('|');
  const plan =
    typeof planPart === 'string' && planPart.toLowerCase() === 'single'
      ? 'single'
      : 'couple';
  const userId = typeof idPart === 'string' && idPart.trim().length ? idPart.trim() : null;
  const username =
    typeof usernamePart === 'string' && usernamePart.trim().length ? usernamePart.trim() : null;

  return { userId, planType: plan, username, original: trimmed };
};

// OAuth2 client-credentials
async function getAccessToken(): Promise<string> {
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
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

const recordWebhookFailure = (
  failureType: string,
  options: {
    error?: unknown;
    message?: string;
    context?: Record<string, unknown>;
    isConnectivityOverride?: boolean;
  } = {},
) => {
  const { error, message, context, isConnectivityOverride } = options;
  const statusCode = error ? extractStatusCode(error) : null;
  const paypalErrorCode = error ? extractPaypalErrorCode(error) : null;
  const paypalStatus = error ? extractPaypalStatus(error) : null;
  const fallbackMessage = message ?? 'PayPal webhook failure';
  const errorMessage = error ? extractErrorMessage(error, fallbackMessage) : fallbackMessage;
  const isConnectivity = typeof isConnectivityOverride === 'boolean'
    ? isConnectivityOverride
    : error
      ? isConnectivityError(error)
      : false;

  void safeRecordPaypalFailure({
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
export const handleWebhook = async (req: Request, res: Response) => {
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
      ? (webhookEvent.event_type as string)
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

    let accessToken: string;
    try {
      accessToken = await getAccessToken();
    } catch (error) {
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

    const verify = (await verifyRes.json()) as { verification_status?: string };

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
      const pool = await getPool();
      const transaction = new sql.Transaction(pool);
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
        const orderRequest = new sql.Request(transaction);
        await orderRequest
          .input('OrderID', sql.VarChar, orderId)
          .input('UserID', sql.VarChar, userId)
          .input('Status', sql.VarChar, orderStatus)
          .input('Amount', sql.Decimal(10, 2), orderAmount)
          .input('Currency', sql.VarChar, orderCurrency)
          .query(`
            INSERT INTO PaypalOrders (OrderID, UserID, Status, Amount, Currency, CreatedAt, UpdatedAt)
            VALUES (@OrderID, @UserID, @Status, @Amount, @Currency, GETUTCDATE(), GETUTCDATE())
          `);

        console.log(
          `[PayPal] Logged order ${orderId} for plan ${planType}${usernameFromMetadata ? ` (username: ${usernameFromMetadata})` : ''}`,
        );

        // 2. Insert into PaypalTransactions
        const transactionRequest = new sql.Request(transaction);
        await transactionRequest
          .input('TransactionID', sql.VarChar, captureId)
          .input('UserID', sql.VarChar, userId)
          .input('PaypalOrderID', sql.VarChar, orderId)
          .input('PaypalCaptureID', sql.VarChar, captureId)
          .input('Amount', sql.Decimal(10, 2), capture?.amount?.value)
          .input('Currency', sql.VarChar, capture?.amount?.currency_code)
          .input('Status', sql.VarChar, captureStatus)
          .input('PayerEmail', sql.NVarChar, payerEmail)
          .input('TransactionTime', sql.DateTime2, transactionTime)
          .input('WebhookEvent', sql.NVarChar(sql.MAX), JSON.stringify(webhookEvent))
          .query(`
            INSERT INTO PaypalTransactions (TransactionID, UserID, PaypalOrderID, PaypalCaptureID, Amount, Currency, Status, PayerEmail, TransactionTime, WebhookEvent, CreatedAt, UpdatedAt)
            VALUES (@TransactionID, @UserID, @PaypalOrderID, @PaypalCaptureID, @Amount, @Currency, @Status, @PayerEmail, @TransactionTime, @WebhookEvent, GETUTCDATE(), GETUTCDATE())
          `);

        console.log(
          `[PayPal] Logged transaction ${captureId} for plan ${planType}${usernameFromMetadata ? ` (username: ${usernameFromMetadata})` : ''}`,
        );

        // 3. Update Users table
        const updateRequest = new sql.Request(transaction);
        const updateResult = await updateRequest
          .input('UserID', sql.VarChar, userId)
          .query<{ Username: string }>(`
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
        console.log(
          `[PayPal] Upgraded user ${username} (ID: ${userId}) after ${planType} capture.`,
        );

        await transaction.commit();

        // 4. Send email after successful commit
        if (payerEmail) {
          await sendSubscriptionConfirmationEmail(payerEmail, username);
        }
      } catch (transactionError: any) {
        console.error(
          '[PayPal] Transaction error in webhook:',
          transactionError?.message || transactionError,
        );
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
  } catch (err: any) {
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

export default handleWebhook;
