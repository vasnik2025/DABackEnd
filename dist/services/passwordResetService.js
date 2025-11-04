"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markRequestUsed = exports.getRequestByResetToken = exports.verifyRequestAndIssueResetToken = exports.getRequestById = exports.createPasswordResetRequest = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../config/db");
const errorHandler_1 = require("../utils/errorHandler");
const TABLE_NAME = 'dbo.PasswordResetRequests';
const hashCode = (code) => (0, crypto_1.createHash)('sha256').update(code.trim()).digest('hex');
const mapRowToRecord = (row) => ({
    requestId: String(row.RequestID),
    userId: String(row.UserID),
    initiatingEmail: String(row.InitiatingEmail ?? '').toLowerCase(),
    partnerEmail: String(row.PartnerEmail ?? '').toLowerCase(),
    initiatingPartnerKey: String(row.InitiatingPartnerKey ?? '').toLowerCase() === 'partner'
        ? 'partner'
        : 'primary',
    initiatingPartnerName: row.InitiatingPartnerName === null || row.InitiatingPartnerName === undefined
        ? null
        : String(row.InitiatingPartnerName),
    partnerDisplayName: row.PartnerDisplayName === null || row.PartnerDisplayName === undefined
        ? null
        : String(row.PartnerDisplayName),
    mfaCodeHash: String(row.MfaCodeHash ?? ''),
    mfaCodeExpiresAt: row.MfaCodeExpiresAt ? new Date(row.MfaCodeExpiresAt) : new Date(0),
    mfaVerifiedAt: row.MfaVerifiedAt ? new Date(row.MfaVerifiedAt) : null,
    resetToken: row.ResetToken ? String(row.ResetToken) : null,
    resetTokenExpiresAt: row.ResetTokenExpiresAt ? new Date(row.ResetTokenExpiresAt) : null,
    usedAt: row.UsedAt ? new Date(row.UsedAt) : null,
});
const ensureTableExistsError = (error) => {
    const message = String(error?.message ?? '').toLowerCase();
    if (message.includes('invalid object name') &&
        message.includes('passwordresetrequests')) {
        throw new errorHandler_1.OperationalError('Password reset table is missing. Run migration 2025-10-19_create_password_reset_requests.sql.', 500);
    }
};
const createPasswordResetRequest = async (pool, params) => {
    const requestId = (0, crypto_1.randomUUID)();
    const codeHash = hashCode(params.plainCode);
    try {
        // Invalidate prior pending requests without exposing timing information.
        await pool
            .request()
            .input('UserID', db_1.sql.VarChar(255), params.userId)
            .query(`
        UPDATE ${TABLE_NAME}
        SET UsedAt = SYSUTCDATETIME(),
            UpdatedAt = SYSUTCDATETIME()
        WHERE UserID = @UserID
          AND UsedAt IS NULL;
      `);
    }
    catch (error) {
        ensureTableExistsError(error);
        throw error;
    }
    try {
        await pool
            .request()
            .input('RequestID', db_1.sql.UniqueIdentifier, requestId)
            .input('UserID', db_1.sql.VarChar(255), params.userId)
            .input('InitiatingEmail', db_1.sql.NVarChar(255), params.initiatingEmail.toLowerCase())
            .input('PartnerEmail', db_1.sql.NVarChar(255), params.partnerEmail.toLowerCase())
            .input('InitiatingPartnerKey', db_1.sql.NVarChar(20), params.initiatingPartnerKey)
            .input('InitiatingPartnerName', db_1.sql.NVarChar(255), params.initiatingPartnerName)
            .input('PartnerDisplayName', db_1.sql.NVarChar(255), params.partnerDisplayName)
            .input('MfaCodeHash', db_1.sql.NVarChar(255), codeHash)
            .input('MfaCodeExpiresAt', db_1.sql.DateTime2, params.codeExpiresAt)
            .query(`
        INSERT INTO ${TABLE_NAME} (
          RequestID,
          UserID,
          InitiatingEmail,
          PartnerEmail,
          InitiatingPartnerKey,
          InitiatingPartnerName,
          PartnerDisplayName,
          MfaCodeHash,
          MfaCodeExpiresAt,
          CreatedAt,
          UpdatedAt
        )
        VALUES (
          @RequestID,
          @UserID,
          @InitiatingEmail,
          @PartnerEmail,
          @InitiatingPartnerKey,
          @InitiatingPartnerName,
          @PartnerDisplayName,
          @MfaCodeHash,
          @MfaCodeExpiresAt,
          SYSUTCDATETIME(),
          SYSUTCDATETIME()
        );
      `);
    }
    catch (error) {
        ensureTableExistsError(error);
        throw error;
    }
    return { requestId, mfaExpiresAt: params.codeExpiresAt };
};
exports.createPasswordResetRequest = createPasswordResetRequest;
const fetchRequestById = async (pool, requestId) => {
    try {
        const result = await pool
            .request()
            .input('RequestID', db_1.sql.UniqueIdentifier, requestId)
            .query(`
        SELECT TOP 1 *
        FROM ${TABLE_NAME}
        WHERE RequestID = @RequestID;
      `);
        if (!result.recordset?.length) {
            return null;
        }
        return mapRowToRecord(result.recordset[0]);
    }
    catch (error) {
        ensureTableExistsError(error);
        throw error;
    }
};
exports.getRequestById = fetchRequestById;
const verifyRequestAndIssueResetToken = async (pool, params) => {
    const record = await fetchRequestById(pool, params.requestId);
    if (!record) {
        return { ok: false, reason: 'not_found' };
    }
    if (record.usedAt) {
        return { ok: false, reason: 'already_used', record };
    }
    const now = Date.now();
    if (record.mfaCodeExpiresAt.getTime() < now) {
        return { ok: false, reason: 'code_expired', record };
    }
    const inputHash = hashCode(params.plainCode);
    if (record.mfaCodeHash !== inputHash) {
        return { ok: false, reason: 'code_invalid', record };
    }
    const shouldIssueNewToken = !record.resetToken ||
        !record.resetTokenExpiresAt ||
        record.resetTokenExpiresAt.getTime() <= now;
    const tokenToUse = shouldIssueNewToken ? (0, crypto_1.randomUUID)() : record.resetToken;
    const expiresAt = shouldIssueNewToken && params.resetTokenTtlMs > 0
        ? new Date(now + params.resetTokenTtlMs)
        : record.resetTokenExpiresAt ?? new Date(now + params.resetTokenTtlMs);
    try {
        const updateResult = await pool
            .request()
            .input('RequestID', db_1.sql.UniqueIdentifier, params.requestId)
            .input('ResetToken', db_1.sql.UniqueIdentifier, tokenToUse)
            .input('ResetTokenExpiresAt', db_1.sql.DateTime2, expiresAt)
            .query(`
        UPDATE ${TABLE_NAME}
        SET
          MfaVerifiedAt = COALESCE(MfaVerifiedAt, SYSUTCDATETIME()),
          ResetToken = @ResetToken,
          ResetTokenExpiresAt = @ResetTokenExpiresAt,
          UpdatedAt = SYSUTCDATETIME()
        OUTPUT inserted.*
        WHERE RequestID = @RequestID;
      `);
        const updatedRow = updateResult.recordset?.[0];
        if (!updatedRow) {
            return { ok: false, reason: 'not_found' };
        }
        const updatedRecord = mapRowToRecord(updatedRow);
        return { ok: true, record: updatedRecord, issuedNewToken: shouldIssueNewToken };
    }
    catch (error) {
        ensureTableExistsError(error);
        throw error;
    }
};
exports.verifyRequestAndIssueResetToken = verifyRequestAndIssueResetToken;
const getRequestByResetToken = async (pool, token) => {
    try {
        const result = await pool
            .request()
            .input('ResetToken', db_1.sql.UniqueIdentifier, token)
            .query(`
        SELECT TOP 1 *
        FROM ${TABLE_NAME}
        WHERE ResetToken = @ResetToken;
      `);
        if (!result.recordset?.length) {
            return null;
        }
        return mapRowToRecord(result.recordset[0]);
    }
    catch (error) {
        ensureTableExistsError(error);
        throw error;
    }
};
exports.getRequestByResetToken = getRequestByResetToken;
const markRequestUsed = async (pool, requestId) => {
    try {
        await pool
            .request()
            .input('RequestID', db_1.sql.UniqueIdentifier, requestId)
            .query(`
        UPDATE ${TABLE_NAME}
        SET UsedAt = SYSUTCDATETIME(),
            UpdatedAt = SYSUTCDATETIME()
        WHERE RequestID = @RequestID;
      `);
    }
    catch (error) {
        ensureTableExistsError(error);
        throw error;
    }
};
exports.markRequestUsed = markRequestUsed;
