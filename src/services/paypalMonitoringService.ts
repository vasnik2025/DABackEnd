import { withSqlRetry, sql } from '../config/db';

export type PaypalFailureEventInput = {
  failureType: string;
  severity?: number;
  userId?: string | null;
  orderId?: string | null;
  captureId?: string | null;
  statusCode?: number | null;
  paypalErrorCode?: string | null;
  paypalStatus?: string | null;
  isConnectivity?: boolean;
  errorMessage?: string | null;
  context?: unknown;
};

export type PaypalFailureEventSummary = {
  failureId: string;
  occurredAt: string;
  failureType: string;
  severity: number;
  userId: string | null;
  orderId: string | null;
  captureId: string | null;
  statusCode: number | null;
  paypalErrorCode: string | null;
  paypalStatus: string | null;
  isConnectivity: boolean;
  errorMessage: string | null;
};

export type PaypalMonitoringSummary = {
  totalFailures24h: number;
  connectivityFailures24h: number;
  lastFailureAtUtc: string | null;
  recentFailures: PaypalFailureEventSummary[];
};

const DEFAULT_SEVERITY = 3;
const MAX_ERROR_MESSAGE_LENGTH = 2000;
const MAX_CONTEXT_LENGTH = 6000;

function normalizeString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength);
}

function serializeContext(context: unknown): string | null {
  if (context == null) return null;
  try {
    const json = JSON.stringify(context, (_key, value) => {
      if (typeof value === 'string' && value.length > 500) {
        return `${value.slice(0, 497)}...`;
      }
      return value;
    });
    if (typeof json !== 'string') return null;
    return json.length <= MAX_CONTEXT_LENGTH ? json : `${json.slice(0, MAX_CONTEXT_LENGTH - 3)}...`;
  } catch {
    return null;
  }
}

function isTableMissingError(error: unknown): boolean {
  const err = error as { number?: number; message?: string };
  if (typeof err?.number === 'number' && err.number === 208) {
    return true;
  }
  if (typeof err?.message === 'string' && err.message.includes('Invalid object name')) {
    return true;
  }
  return false;
}

export async function recordPaypalFailureEvent(input: PaypalFailureEventInput): Promise<void> {
  const {
    failureType,
    severity = DEFAULT_SEVERITY,
    userId,
    orderId,
    captureId,
    statusCode,
    paypalErrorCode,
    paypalStatus,
    isConnectivity = false,
    errorMessage,
    context,
  } = input;

  if (!failureType?.trim()) {
    throw new Error('failureType is required to record a PayPal failure event.');
  }

  const normalizedErrorMessage = normalizeString(errorMessage, MAX_ERROR_MESSAGE_LENGTH);
  const serializedContext = serializeContext(context);

  await withSqlRetry(async (pool) => {
    const request = pool.request();
    request.input('FailureType', sql.VarChar(60), failureType);
    request.input('Severity', sql.TinyInt, Math.max(0, Math.min(5, Number.isFinite(severity) ? severity : DEFAULT_SEVERITY)));
    request.input('UserID', sql.VarChar(255), normalizeString(userId, 255));
    request.input('OrderID', sql.VarChar(255), normalizeString(orderId, 255));
    request.input('CaptureID', sql.VarChar(255), normalizeString(captureId, 255));
    request.input('StatusCode', sql.Int, typeof statusCode === 'number' && Number.isFinite(statusCode) ? Math.round(statusCode) : null);
    request.input('PaypalErrorCode', sql.NVarChar(255), normalizeString(paypalErrorCode, 255));
    request.input('PaypalStatus', sql.NVarChar(60), normalizeString(paypalStatus, 60));
    request.input('IsConnectivity', sql.Bit, isConnectivity ? 1 : 0);
    request.input('ErrorMessage', sql.NVarChar(sql.MAX), normalizedErrorMessage);
    request.input('Context', sql.NVarChar(sql.MAX), serializedContext);
    await request.query(`
      INSERT INTO dbo.PaypalFailureEvents (
        FailureType,
        Severity,
        UserID,
        OrderID,
        CaptureID,
        StatusCode,
        PaypalErrorCode,
        PaypalStatus,
        IsConnectivity,
        ErrorMessage,
        Context
      )
      VALUES (
        @FailureType,
        @Severity,
        @UserID,
        @OrderID,
        @CaptureID,
        @StatusCode,
        @PaypalErrorCode,
        @PaypalStatus,
        @IsConnectivity,
        @ErrorMessage,
        @Context
      );
    `);
  }).catch((error) => {
    if (isTableMissingError(error)) {
      console.warn('[PayPalMonitoring] PaypalFailureEvents table missing. Run latest migrations.', error);
      return;
    }
    throw error;
  });
}

export async function fetchPaypalMonitoringSummary(limit = 10): Promise<PaypalMonitoringSummary> {
  try {
    return await withSqlRetry(async (pool) => {
      const summaryRequest = pool.request();
      const summaryResult = await summaryRequest.query(`
        SELECT TotalFailures24h, ConnectivityFailures24h, LastFailureAtUtc
        FROM dbo.vwPaypalFailureSummary;
      `);

      const summaryRow = summaryResult.recordset?.[0] ?? null;
      const totalFailures24h = Number(summaryRow?.TotalFailures24h ?? 0);
      const connectivityFailures24h = Number(summaryRow?.ConnectivityFailures24h ?? 0);
      const lastFailureAtUtc = summaryRow?.LastFailureAtUtc
        ? new Date(summaryRow.LastFailureAtUtc).toISOString()
        : null;

      const recentRequest = pool.request();
      recentRequest.input('Limit', sql.Int, Math.max(1, Math.min(limit, 50)));
      const recentResult = await recentRequest.query(`
        SELECT TOP (@Limit)
          FailureID,
          OccurredAt,
          FailureType,
          Severity,
          UserID,
          OrderID,
          CaptureID,
          StatusCode,
          PaypalErrorCode,
          PaypalStatus,
          IsConnectivity,
          ErrorMessage
        FROM dbo.PaypalFailureEvents
        ORDER BY OccurredAt DESC;
      `);

      const recentFailures: PaypalFailureEventSummary[] = (recentResult.recordset ?? []).map((row: any) => ({
        failureId: String(row.FailureID),
        occurredAt: new Date(row.OccurredAt).toISOString(),
        failureType: String(row.FailureType ?? 'unknown'),
        severity: Number(row.Severity ?? DEFAULT_SEVERITY),
        userId: row.UserID ?? null,
        orderId: row.OrderID ?? null,
        captureId: row.CaptureID ?? null,
        statusCode: typeof row.StatusCode === 'number' ? row.StatusCode : null,
        paypalErrorCode: row.PaypalErrorCode ?? null,
        paypalStatus: row.PaypalStatus ?? null,
        isConnectivity: Boolean(row.IsConnectivity),
        errorMessage: row.ErrorMessage ?? null,
      }));

      return {
        totalFailures24h,
        connectivityFailures24h,
        lastFailureAtUtc,
        recentFailures,
      };
    });
  } catch (error) {
    if (isTableMissingError(error)) {
      console.warn('[PayPalMonitoring] PaypalFailureEvents table missing. Skipping summary.', error);
      return {
        totalFailures24h: 0,
        connectivityFailures24h: 0,
        lastFailureAtUtc: null,
        recentFailures: [],
      };
    }
    throw error;
  }
}
