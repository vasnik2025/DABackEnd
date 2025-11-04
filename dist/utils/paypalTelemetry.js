"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeRecordPaypalFailure = exports.extractErrorMessage = exports.extractPaypalStatus = exports.extractPaypalErrorCode = exports.extractStatusCode = exports.isConnectivityError = void 0;
const paypalMonitoringService_1 = require("../services/paypalMonitoringService");
const CONNECTIVITY_ERROR_CODES = new Set(['ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'EAI_AGAIN']);
const CONNECTIVITY_MESSAGE_FRAGMENTS = ['network', 'fetch failed', 'socket hang up', 'econnreset', 'getaddrinfo', 'timeout'];
const isConnectivityError = (error) => {
    if (!error)
        return false;
    const candidate = error;
    const code = (candidate.code ?? candidate.errno ?? '').toString().toUpperCase();
    if (code && CONNECTIVITY_ERROR_CODES.has(code)) {
        return true;
    }
    const message = (candidate.message ?? '').toLowerCase();
    return CONNECTIVITY_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment));
};
exports.isConnectivityError = isConnectivityError;
const extractStatusCode = (error) => {
    const candidate = error;
    const statusCandidate = candidate?.statusCode ?? candidate?.status ?? candidate?.httpStatusCode ?? null;
    return typeof statusCandidate === 'number' && Number.isFinite(statusCandidate)
        ? Math.trunc(statusCandidate)
        : null;
};
exports.extractStatusCode = extractStatusCode;
const extractPaypalErrorCode = (error) => {
    const candidate = error;
    const direct = candidate?.name ?? candidate?.error ?? candidate?.code ?? candidate?.result?.name ?? null;
    if (typeof direct === 'string' && direct.trim().length) {
        return direct.trim();
    }
    const resultIssue = candidate?.result?.details?.[0]?.issue;
    if (typeof resultIssue === 'string' && resultIssue.trim().length) {
        return resultIssue.trim();
    }
    return null;
};
exports.extractPaypalErrorCode = extractPaypalErrorCode;
const extractPaypalStatus = (error) => {
    const candidate = error;
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
exports.extractPaypalStatus = extractPaypalStatus;
const extractErrorMessage = (error, fallback) => {
    if (typeof error?.message === 'string') {
        const trimmed = error.message.trim();
        if (trimmed.length) {
            return trimmed;
        }
    }
    return fallback;
};
exports.extractErrorMessage = extractErrorMessage;
const safeRecordPaypalFailure = async (payload) => {
    try {
        await (0, paypalMonitoringService_1.recordPaypalFailureEvent)(payload);
    }
    catch (loggingError) {
        console.error('[PayPal] Failed to persist failure telemetry', loggingError);
    }
};
exports.safeRecordPaypalFailure = safeRecordPaypalFailure;
