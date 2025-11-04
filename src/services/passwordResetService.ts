import { createHash, randomUUID } from 'crypto';
import type mssql from 'mssql';
import { sql } from '../config/db';
import { OperationalError } from '../utils/errorHandler';

export type PasswordResetPartnerKey = 'primary' | 'partner';

export type PasswordResetRequestRecord = {
  requestId: string;
  userId: string;
  initiatingEmail: string;
  partnerEmail: string;
  initiatingPartnerKey: PasswordResetPartnerKey;
  initiatingPartnerName: string | null;
  partnerDisplayName: string | null;
  mfaCodeHash: string;
  mfaCodeExpiresAt: Date;
  mfaVerifiedAt: Date | null;
  resetToken: string | null;
  resetTokenExpiresAt: Date | null;
  usedAt: Date | null;
};

type CreateRequestParams = {
  userId: string;
  initiatingEmail: string;
  partnerEmail: string;
  initiatingPartnerKey: PasswordResetPartnerKey;
  initiatingPartnerName: string | null;
  partnerDisplayName: string | null;
  plainCode: string;
  codeExpiresAt: Date;
};

type VerifyRequestParams = {
  requestId: string;
  plainCode: string;
  resetTokenTtlMs: number;
};

export type VerifyRequestResult =
  | {
      ok: true;
      record: PasswordResetRequestRecord;
      issuedNewToken: boolean;
    }
  | {
      ok: false;
      reason: 'not_found' | 'already_used' | 'code_expired' | 'code_invalid';
      record?: PasswordResetRequestRecord;
    };

const TABLE_NAME = 'dbo.PasswordResetRequests';

const hashCode = (code: string): string =>
  createHash('sha256').update(code.trim()).digest('hex');

const mapRowToRecord = (row: any): PasswordResetRequestRecord => ({
  requestId: String(row.RequestID),
  userId: String(row.UserID),
  initiatingEmail: String(row.InitiatingEmail ?? '').toLowerCase(),
  partnerEmail: String(row.PartnerEmail ?? '').toLowerCase(),
  initiatingPartnerKey:
    String(row.InitiatingPartnerKey ?? '').toLowerCase() === 'partner'
      ? 'partner'
      : 'primary',
  initiatingPartnerName:
    row.InitiatingPartnerName === null || row.InitiatingPartnerName === undefined
      ? null
      : String(row.InitiatingPartnerName),
  partnerDisplayName:
    row.PartnerDisplayName === null || row.PartnerDisplayName === undefined
      ? null
      : String(row.PartnerDisplayName),
  mfaCodeHash: String(row.MfaCodeHash ?? ''),
  mfaCodeExpiresAt: row.MfaCodeExpiresAt ? new Date(row.MfaCodeExpiresAt) : new Date(0),
  mfaVerifiedAt: row.MfaVerifiedAt ? new Date(row.MfaVerifiedAt) : null,
  resetToken: row.ResetToken ? String(row.ResetToken) : null,
  resetTokenExpiresAt: row.ResetTokenExpiresAt ? new Date(row.ResetTokenExpiresAt) : null,
  usedAt: row.UsedAt ? new Date(row.UsedAt) : null,
});

const ensureTableExistsError = (error: unknown) => {
  const message = String((error as { message?: string })?.message ?? '').toLowerCase();
  if (
    message.includes('invalid object name') &&
    message.includes('passwordresetrequests')
  ) {
    throw new OperationalError(
      'Password reset table is missing. Run migration 2025-10-19_create_password_reset_requests.sql.',
      500,
    );
  }
};

export const createPasswordResetRequest = async (
  pool: mssql.ConnectionPool,
  params: CreateRequestParams,
): Promise<{ requestId: string; mfaExpiresAt: Date }> => {
  const requestId = randomUUID();
  const codeHash = hashCode(params.plainCode);

  try {
    // Invalidate prior pending requests without exposing timing information.
    await pool
      .request()
      .input('UserID', sql.VarChar(255), params.userId)
      .query(`
        UPDATE ${TABLE_NAME}
        SET UsedAt = SYSUTCDATETIME(),
            UpdatedAt = SYSUTCDATETIME()
        WHERE UserID = @UserID
          AND UsedAt IS NULL;
      `);
  } catch (error) {
    ensureTableExistsError(error);
    throw error;
  }

  try {
    await pool
      .request()
      .input('RequestID', sql.UniqueIdentifier, requestId)
      .input('UserID', sql.VarChar(255), params.userId)
      .input('InitiatingEmail', sql.NVarChar(255), params.initiatingEmail.toLowerCase())
      .input('PartnerEmail', sql.NVarChar(255), params.partnerEmail.toLowerCase())
      .input('InitiatingPartnerKey', sql.NVarChar(20), params.initiatingPartnerKey)
      .input('InitiatingPartnerName', sql.NVarChar(255), params.initiatingPartnerName)
      .input('PartnerDisplayName', sql.NVarChar(255), params.partnerDisplayName)
      .input('MfaCodeHash', sql.NVarChar(255), codeHash)
      .input('MfaCodeExpiresAt', sql.DateTime2, params.codeExpiresAt)
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
  } catch (error) {
    ensureTableExistsError(error);
    throw error;
  }

  return { requestId, mfaExpiresAt: params.codeExpiresAt };
};

const fetchRequestById = async (
  pool: mssql.ConnectionPool,
  requestId: string,
): Promise<PasswordResetRequestRecord | null> => {
  try {
    const result = await pool
      .request()
      .input('RequestID', sql.UniqueIdentifier, requestId)
      .query(`
        SELECT TOP 1 *
        FROM ${TABLE_NAME}
        WHERE RequestID = @RequestID;
      `);
    if (!result.recordset?.length) {
      return null;
    }
    return mapRowToRecord(result.recordset[0]);
  } catch (error) {
    ensureTableExistsError(error);
    throw error;
  }
};

export const getRequestById = fetchRequestById;

export const verifyRequestAndIssueResetToken = async (
  pool: mssql.ConnectionPool,
  params: VerifyRequestParams,
): Promise<VerifyRequestResult> => {
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

  const shouldIssueNewToken =
    !record.resetToken ||
    !record.resetTokenExpiresAt ||
    record.resetTokenExpiresAt.getTime() <= now;

  const tokenToUse = shouldIssueNewToken ? randomUUID() : record.resetToken!;
  const expiresAt =
    shouldIssueNewToken && params.resetTokenTtlMs > 0
      ? new Date(now + params.resetTokenTtlMs)
      : record.resetTokenExpiresAt ?? new Date(now + params.resetTokenTtlMs);

  try {
    const updateResult = await pool
      .request()
      .input('RequestID', sql.UniqueIdentifier, params.requestId)
      .input('ResetToken', sql.UniqueIdentifier, tokenToUse)
      .input('ResetTokenExpiresAt', sql.DateTime2, expiresAt)
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
  } catch (error) {
    ensureTableExistsError(error);
    throw error;
  }
};

export const getRequestByResetToken = async (
  pool: mssql.ConnectionPool,
  token: string,
): Promise<PasswordResetRequestRecord | null> => {
  try {
    const result = await pool
      .request()
      .input('ResetToken', sql.UniqueIdentifier, token)
      .query(`
        SELECT TOP 1 *
        FROM ${TABLE_NAME}
        WHERE ResetToken = @ResetToken;
      `);
    if (!result.recordset?.length) {
      return null;
    }
    return mapRowToRecord(result.recordset[0]);
  } catch (error) {
    ensureTableExistsError(error);
    throw error;
  }
};

export const markRequestUsed = async (
  pool: mssql.ConnectionPool,
  requestId: string,
): Promise<void> => {
  try {
    await pool
      .request()
      .input('RequestID', sql.UniqueIdentifier, requestId)
      .query(`
        UPDATE ${TABLE_NAME}
        SET UsedAt = SYSUTCDATETIME(),
            UpdatedAt = SYSUTCDATETIME()
        WHERE RequestID = @RequestID;
      `);
  } catch (error) {
    ensureTableExistsError(error);
    throw error;
  }
};
