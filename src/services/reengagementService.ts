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
  partnerEmailVerified: boolean;
  primaryEmailVerified: boolean;
  optedOut: boolean;
};

export type ReengagementRecipient = {
  userId: string;
  emails: string[];
  displayName: string;
};

export type ReengagementSummary = {
  totalCouples: number;
  eligibleCouples: number;
  excludedCouples: number;
  deliverableEmails: number;
};

export type PreferencesContext = {
  userId: string;
  displayName: string;
  optedOut: boolean;
  optOutAt: string | null;
};

const TOKEN_AUDIENCE = 'reengagement-preferences';
const TOKEN_SCOPE = 'reengagement-preferences';
const TOKEN_TTL = process.env.REENGAGEMENT_PREFERENCES_TOKEN_TTL ?? '90d';

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length ? trimmed : null;
};

const formatDisplayName = (row: NameSource): string => {
  const names = [
    typeof row.partner1Nickname === 'string' ? row.partner1Nickname.trim() : '',
    typeof row.partner2Nickname === 'string' ? row.partner2Nickname.trim() : '',
  ]
    .filter((value) => value.length);

  if (names.length === 2) {
    return `${names[0]} & ${names[1]}`;
  }
  if (names.length === 1) {
    return names[0];
  }

  const username = typeof row.username === 'string' ? row.username.trim() : '';
  return username && username.length ? username : 'there';
};

export async function listEligibleReengagementRecipients(): Promise<ReengagementRecipient[]> {
  const result = await withSqlRetry((pool) =>
    pool
      .request()
      .query<RecipientRow>(`
        SELECT
          CAST(u.UserID AS NVARCHAR(100)) AS userId,
          LOWER(u.Email) AS primaryEmail,
          LOWER(u.PartnerEmail) AS partnerEmail,
          ISNULL(u.IsEmailVerified, 0) AS primaryEmailVerified,
          ISNULL(u.IsPartnerEmailVerified, 0) AS partnerEmailVerified,
          u.Username,
          u.Partner1Nickname,
          u.Partner2Nickname,
          ISNULL(u.DisableReengagementReminders, 0) AS optedOut
        FROM dbo.Users AS u
        WHERE (u.Email IS NOT NULL OR u.PartnerEmail IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1
            FROM dbo.FakeUsers AS f
            WHERE f.UserID = u.UserID
          )
      `),
  );

  const rows: RecipientRow[] = (result.recordset ?? []).map((row: any) => ({
    userId: String(row.userId),
    primaryEmail: normalizeEmail(row.primaryEmail),
    partnerEmail: normalizeEmail(row.partnerEmail),
    primaryEmailVerified: Boolean(row.primaryEmailVerified),
    partnerEmailVerified: Boolean(row.partnerEmailVerified),
    username: typeof row.username === 'string' ? row.username : null,
    partner1Nickname: typeof row.partner1Nickname === 'string' ? row.partner1Nickname : null,
    partner2Nickname: typeof row.partner2Nickname === 'string' ? row.partner2Nickname : null,
    optedOut: Boolean(row.optedOut),
  }));

  return rows
    .filter((row) => !row.optedOut)
    .map((row) => {
      const emailSet = new Set<string>();
      if (row.primaryEmail && row.primaryEmailVerified) {
        emailSet.add(row.primaryEmail);
      }
      if (row.partnerEmail && row.partnerEmailVerified) {
        emailSet.add(row.partnerEmail);
      }

      return {
        userId: row.userId,
        emails: Array.from(emailSet),
        displayName: formatDisplayName(row),
      };
    })
    .filter((recipient) => recipient.emails.length > 0);
}

export async function getReengagementSummary(): Promise<ReengagementSummary> {
  const [eligibleRecipients, aggregateResult] = await Promise.all([
    listEligibleReengagementRecipients(),
    withSqlRetry((pool) =>
      pool
        .request()
        .query<{ totalCouples: number; excludedCouples: number }>(`
          SELECT
            COUNT(*) AS totalCouples,
            SUM(CASE WHEN ISNULL(u.DisableReengagementReminders, 0) = 1 THEN 1 ELSE 0 END) AS excludedCouples
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
    excludedCouples?: number;
  };
  const totalCouples = Number(aggregateRow.totalCouples ?? 0);
  const excludedCouples = Number(aggregateRow.excludedCouples ?? 0);
  const eligibleCouples = eligibleRecipients.length;
  const deliverableEmails = eligibleRecipients.reduce(
    (acc, recipient) => acc + recipient.emails.length,
    0,
  );

  return {
    totalCouples,
    eligibleCouples,
    excludedCouples,
    deliverableEmails,
  };
}

export function createReengagementToken(userId: string): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  const secret = process.env.JWT_SECRET as string;
  const payload = { sub: userId, userId, scope: TOKEN_SCOPE };
  const options: SignOptions = {
    expiresIn: TOKEN_TTL as SignOptions['expiresIn'],
    audience: TOKEN_AUDIENCE,
  };
  return jwt.sign(payload, secret, options);
}

type VerifiedToken = { userId: string };

export function verifyReengagementToken(token: string): VerifiedToken {
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

export async function getPreferencesContext(userId: string): Promise<PreferencesContext | null> {
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
          ISNULL(DisableReengagementReminders, 0) AS optedOut,
          ReengagementOptOutAt
        FROM dbo.Users
        WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID);
      `),
  );

  const row = result.recordset?.[0];
  if (!row) {
    return null;
  }

  const context: PreferencesContext = {
    userId: String(row.userId),
    displayName: formatDisplayName({
      username: row.username,
      partner1Nickname: row.partner1Nickname,
      partner2Nickname: row.partner2Nickname,
    }),
    optedOut: Boolean(row.optedOut),
    optOutAt: row.ReengagementOptOutAt ? new Date(row.ReengagementOptOutAt).toISOString() : null,
  };

  return context;
}

export async function markReengagementOptOut(userId: string): Promise<void> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input('UserID', sql.VarChar(255), userId)
    .query(`
      UPDATE dbo.Users
      SET
        DisableReengagementReminders = 1,
        ReengagementOptOutAt = COALESCE(ReengagementOptOutAt, SYSUTCDATETIME())
      WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID);
    `);

  if ((result.rowsAffected?.[0] ?? 0) === 0) {
    throw new OperationalError('Account not found for preferences update.', 404);
  }
}
