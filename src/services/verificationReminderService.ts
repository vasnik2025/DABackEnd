import jwt, { type SignOptions } from 'jsonwebtoken';
import { getPool, sql, withSqlRetry } from '../config/db';
import { OperationalError } from '../utils/errorHandler';

type NameSource = {
  username?: string | null;
  partner1Nickname?: string | null;
  partner2Nickname?: string | null;
};

type RecipientRow = NameSource & {
  userId: string;
  primaryEmail: string | null;
  partnerEmail: string | null;
  isPrimaryVerified: boolean;
  isPartnerVerified: boolean;
  optedOut: boolean;
};

export type VerificationReminderRecipient = {
  userId: string;
  emails: string[];
  displayName: string;
  primaryVerified: boolean;
  partnerVerified: boolean;
};

export type VerificationReminderSummary = {
  totalCouples: number;
  pendingVerification: number;
  excludedCouples: number;
};

export type VerificationPreferencesContext = {
  userId: string;
  displayName: string;
  optedOut: boolean;
  optOutAt: string | null;
};

const TOKEN_AUDIENCE = 'verification-preferences';
const TOKEN_SCOPE = 'verification-preferences';
const TOKEN_TTL = process.env.VERIFICATION_PREFERENCES_TOKEN_TTL ?? '90d';

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
};

const formatDisplayName = (row: NameSource): string => {
  const names = [
    typeof row.partner1Nickname === 'string' ? row.partner1Nickname.trim() : '',
    typeof row.partner2Nickname === 'string' ? row.partner2Nickname.trim() : '',
  ].filter((value) => value.length);

  if (names.length === 2) {
    return `${names[0]} & ${names[1]}`;
  }
  if (names.length === 1) {
    return names[0];
  }

  const username = typeof row.username === 'string' ? row.username.trim() : '';
  return username && username.length ? username : 'there';
};

export async function listVerificationReminderRecipients(): Promise<VerificationReminderRecipient[]> {
  const result = await withSqlRetry((pool) =>
    pool
      .request()
      .query<RecipientRow>(`
        SELECT
          CAST(u.UserID AS NVARCHAR(100)) AS userId,
          LOWER(u.Email) AS primaryEmail,
          LOWER(u.PartnerEmail) AS partnerEmail,
          ISNULL(u.IsEmailVerified, 0) AS isPrimaryVerified,
          ISNULL(u.IsPartnerEmailVerified, 0) AS isPartnerVerified,
          u.Username,
          u.Partner1Nickname,
          u.Partner2Nickname,
          ISNULL(u.DisableVerificationReminders, 0) AS optedOut
        FROM dbo.Users AS u
        WHERE (u.Email IS NOT NULL OR u.PartnerEmail IS NOT NULL)
          AND (ISNULL(u.IsEmailVerified, 0) = 0 OR ISNULL(u.IsPartnerEmailVerified, 0) = 0)
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.FakeUsers AS f
            WHERE f.UserID = u.UserID
          );
      `),
  );

  const rows: RecipientRow[] = (result.recordset ?? []).map((row: any) => ({
    userId: String(row.userId),
    primaryEmail: normalizeEmail(row.primaryEmail),
    partnerEmail: normalizeEmail(row.partnerEmail),
    isPrimaryVerified: Boolean(row.isPrimaryVerified),
    isPartnerVerified: Boolean(row.isPartnerVerified),
    username: typeof row.username === 'string' ? row.username : null,
    partner1Nickname: typeof row.partner1Nickname === 'string' ? row.partner1Nickname : null,
    partner2Nickname: typeof row.partner2Nickname === 'string' ? row.partner2Nickname : null,
    optedOut: Boolean(row.optedOut),
  }));

  return rows
    .filter((row) => !row.optedOut)
    .map((row) => {
      const emails = new Set<string>();
      if (row.primaryEmail) {
        emails.add(row.primaryEmail);
      }
      if (row.partnerEmail) {
        emails.add(row.partnerEmail);
      }
      return {
        userId: row.userId,
        emails: Array.from(emails),
        displayName: formatDisplayName(row),
        primaryVerified: row.isPrimaryVerified,
        partnerVerified: row.isPartnerVerified,
      };
    })
    .filter((recipient) => recipient.emails.length > 0);
}

export async function getVerificationReminderSummary(): Promise<VerificationReminderSummary> {
  const [recipients, aggregateResult] = await Promise.all([
    listVerificationReminderRecipients(),
    withSqlRetry((pool) =>
      pool
        .request()
        .query<{ totalCouples: number; pendingVerification: number; excludedCouples: number }>(`
          SELECT
            COUNT(*) AS totalCouples,
            SUM(CASE WHEN ISNULL(u.IsEmailVerified, 0) = 0 OR ISNULL(u.IsPartnerEmailVerified, 0) = 0 THEN 1 ELSE 0 END) AS pendingVerification,
            SUM(CASE WHEN ISNULL(u.DisableVerificationReminders, 0) = 1 THEN 1 ELSE 0 END) AS excludedCouples
          FROM dbo.Users AS u
          WHERE (u.Email IS NOT NULL OR u.PartnerEmail IS NOT NULL)
            AND NOT EXISTS (
              SELECT 1
              FROM dbo.FakeUsers AS f
              WHERE f.UserID = u.UserID
            );
        `),
    ),
  ]);

  const aggregateRow = (aggregateResult.recordset?.[0] ?? {}) as {
    totalCouples?: number;
    pendingVerification?: number;
    excludedCouples?: number;
  };
  return {
    totalCouples: Number(aggregateRow.totalCouples ?? 0),
    pendingVerification: Number(aggregateRow.pendingVerification ?? 0),
    excludedCouples: Number(aggregateRow.excludedCouples ?? 0),
  };
}

export function createVerificationPreferencesToken(userId: string): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  const payload = { sub: userId, userId, scope: TOKEN_SCOPE };
  const options: SignOptions = {
    expiresIn: TOKEN_TTL as SignOptions['expiresIn'],
    audience: TOKEN_AUDIENCE,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, options);
}

type VerifiedToken = { userId: string };

export function verifyVerificationPreferencesToken(token: string): VerifiedToken {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      audience: TOKEN_AUDIENCE,
    }) as { userId?: string; sub?: string; scope?: string };
    const userId = String(payload.userId ?? payload.sub ?? '');
    const scope = String(payload.scope ?? '');
    if (!userId) {
      throw new OperationalError('Token missing user reference.', 400);
    }
    if (scope !== TOKEN_SCOPE) {
      throw new OperationalError('Token scope mismatch.', 400);
    }
    return { userId };
  } catch (error) {
    if (error instanceof OperationalError) {
      throw error;
    }
    throw new OperationalError('Invalid or expired preferences link.', 400);
  }
}

export async function getVerificationPreferencesContext(
  userId: string,
): Promise<VerificationPreferencesContext | null> {
  const result = await withSqlRetry((pool) =>
    pool
      .request()
      .input('UserID', sql.VarChar(255), userId)
      .query(`
        SELECT
          CAST(UserID AS NVARCHAR(100)) AS userId,
          Username,
          Partner1Nickname,
          Partner2Nickname,
          ISNULL(DisableVerificationReminders, 0) AS optedOut,
          VerificationReminderOptOutAt
        FROM dbo.Users
        WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID);
      `),
  );

  const row = result.recordset?.[0];
  if (!row) {
    return null;
  }

  return {
    userId: String(row.userId),
    displayName: formatDisplayName({
      username: row.username,
      partner1Nickname: row.partner1Nickname,
      partner2Nickname: row.partner2Nickname,
    }),
    optedOut: Boolean(row.optedOut),
    optOutAt: row.VerificationReminderOptOutAt
      ? new Date(row.VerificationReminderOptOutAt).toISOString()
      : null,
  };
}

export async function markVerificationOptOut(userId: string): Promise<void> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('UserID', sql.VarChar(255), userId)
    .query(`
      UPDATE dbo.Users
      SET
        DisableVerificationReminders = 1,
        VerificationReminderOptOutAt = COALESCE(VerificationReminderOptOutAt, SYSUTCDATETIME())
      WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID);
    `);

  if ((result.rowsAffected?.[0] ?? 0) === 0) {
    throw new OperationalError('Account not found for preferences update.', 404);
  }
}
