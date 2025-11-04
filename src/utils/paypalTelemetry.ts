import { recordPaypalFailureEvent, type PaypalFailureEventInput } from '../services/paypalMonitoringService';

const CONNECTIVITY_ERROR_CODES = new Set(['ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN']);
const CONNECTIVITY_MESSAGE_FRAGMENTS = ['network', 'fetch failed', 'socket hang up', 'econnreset', 'getaddrinfo', 'timeout'];

export const isConnectivityError = (error: unknown): boolean => {
  if (!error) return false;
  const candidate = error as { code?: string; errno?: string; message?: string | null };
  const code = (candidate.code ?? candidate.errno ?? '').toString().toUpperCase();
  if (code && CONNECTIVITY_ERROR_CODES.has(code)) {
    return true;
  }
  const message = (candidate.message ?? '').toLowerCase();
  return CONNECTIVITY_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment));
};

export const extractStatusCode = (error: unknown): number | null => {
  const candidate = error as { statusCode?: number; status?: number; httpStatusCode?: number };
  const statusCandidate =
    candidate?.statusCode ?? candidate?.status ?? candidate?.httpStatusCode ?? null;
  return typeof statusCandidate === 'number' && Number.isFinite(statusCandidate)
    ? Math.trunc(statusCandidate)
    : null;
};

export const extractPaypalErrorCode = (error: unknown): string | null => {
  const candidate = error as { name?: string; error?: string; code?: string; result?: any };
  const direct =
    candidate?.name ?? candidate?.error ?? candidate?.code ?? candidate?.result?.name ?? null;
  if (typeof direct === 'string' && direct.trim().length) {
    return direct.trim();
  }
  const resultIssue = candidate?.result?.details?.[0]?.issue;
  if (typeof resultIssue === 'string' && resultIssue.trim().length) {
    return resultIssue.trim();
  }
  return null;
};

export const extractPaypalStatus = (error: unknown): string | null => {
  const candidate = error as { result?: { status?: string; details?: Array<{ status?: string }> } };
  const status = candidate?.result?.status;
  if (typeof status === 'string' && status.trim().length) {
    return status.trim();
  }
  const detailStatus = candidate?.result?.details?.[0]?.status;
  if (typeof detailStatus === 'string' && detailStatus.trim().length) {
    return detailStatus.trim();
  }
  return null;
};

export const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof (error as { message?: string })?.message === 'string') {
    const trimmed = (error as { message: string }).message.trim();
    if (trimmed.length) {
      return trimmed;
    }
  }
  return fallback;
};

export const safeRecordPaypalFailure = async (payload: PaypalFailureEventInput): Promise<void> => {
  try {
    await recordPaypalFailureEvent(payload);
  } catch (loggingError) {
    console.error('[PayPal] Failed to persist failure telemetry', loggingError);
  }
};
