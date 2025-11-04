import { sql, withSqlRetry } from '../config/db';

const IDEA_MAX_LENGTH = 2000;
const ALLOWED_INTERESTS = new Set(['yes', 'no', 'curious']);

export type SplashSurveySubmission = {
  interest: 'yes' | 'no' | 'curious';
  idea?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  country?: string | null;
};

export type SplashSurveyStats = {
  yesCount: number;
  noCount: number;
  curiousCount: number;
  ideaCount: number;
  totalSubmissions: number;
  viewCount: number;
  lastSubmissionAtUtc: string | null;
  waitlistCount: number;
};

const SELECT_STATS_SQL = `
  SELECT
    YesCount,
    NoCount,
    CuriousCount,
    IdeaCount,
    TotalSubmissions,
    ViewCount,
    LastSubmissionAtUtc
  FROM dbo.vwSplashSurveyStats WITH (NOLOCK);
`;

export function normalizeInterest(value: string): SplashSurveySubmission['interest'] {
  const normalized = value?.toLowerCase().trim();
  if (ALLOWED_INTERESTS.has(normalized)) {
    return normalized as SplashSurveySubmission['interest'];
  }
  throw new Error(`Unsupported splash survey interest value: ${value}`);
}

function sanitizeIdea(idea: string | null | undefined): string | null {
  if (!idea) return null;
  const trimmed = idea.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, IDEA_MAX_LENGTH);
}

function sanitizeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  return userAgent.slice(0, 400);
}

function sanitizeIpAddress(ipAddress: string | null | undefined): string | null {
  if (!ipAddress) return null;
  return ipAddress.slice(0, 45);
}

function sanitizeCountry(country: string | null | undefined): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 120);
}

function sanitizeEmail(email: string): string {
  const trimmed = email.trim();
  if (!trimmed || trimmed.length > 320) {
    throw new Error('Email must be 1-320 characters long.');
  }
  return trimmed;
}

function mapStatsRow(row: Record<string, unknown> | undefined): SplashSurveyStats {
  const fallbackDate = row?.LastSubmissionAtUtc instanceof Date ? row.LastSubmissionAtUtc.toISOString() : null;
  return {
    yesCount: Number((row?.YesCount as number | undefined) ?? 0),
    noCount: Number((row?.NoCount as number | undefined) ?? 0),
    curiousCount: Number((row?.CuriousCount as number | undefined) ?? 0),
    ideaCount: Number((row?.IdeaCount as number | undefined) ?? 0),
    totalSubmissions: Number((row?.TotalSubmissions as number | undefined) ?? 0),
    viewCount: Number((row?.ViewCount as number | undefined) ?? 0),
    lastSubmissionAtUtc: fallbackDate,
    waitlistCount: 0,
  };
}

export async function recordSplashSurveySubmission(
  submission: SplashSurveySubmission,
): Promise<SplashSurveyStats> {
  const sanitizedIdea = sanitizeIdea(submission.idea);
  const sanitizedUserAgent = sanitizeUserAgent(submission.userAgent);
  const sanitizedIp = sanitizeIpAddress(submission.ipAddress);
  const sanitizedCountry = sanitizeCountry(submission.country);

  await withSqlRetry(async (pool) => {
    await pool
      .request()
      .input('InterestChoice', sql.VarChar(10), submission.interest)
      .input('IdeaNote', sql.NVarChar(IDEA_MAX_LENGTH), sanitizedIdea)
      .input('UserAgent', sql.NVarChar(400), sanitizedUserAgent)
      .input('IpAddress', sql.VarChar(45), sanitizedIp)
      .input('Country', sql.NVarChar(120), sanitizedCountry)
      .query(
        `INSERT INTO dbo.SplashSurveySubmissions (InterestChoice, IdeaNote, UserAgent, IpAddress, Country)
         VALUES (@InterestChoice, @IdeaNote, @UserAgent, @IpAddress, @Country);`,
      );
  });

  return fetchSplashSurveyStats();
}

export async function fetchSplashSurveyStats(): Promise<SplashSurveyStats> {
  const row = await withSqlRetry(async (pool) => {
    const result = await pool.request().query(SELECT_STATS_SQL);
    return result.recordset?.[0];
  });

  const stats = mapStatsRow(row);
  stats.waitlistCount = await fetchSplashVisitorEmailCount();
  return stats;
}

export async function recordSplashPageView(payload: {
  userAgent?: string | null;
  ipAddress?: string | null;
  country?: string | null;
}) {
  const sanitizedUA = sanitizeUserAgent(payload.userAgent);
  const sanitizedIp = sanitizeIpAddress(payload.ipAddress);
  const sanitizedCountry = sanitizeCountry(payload.country);

  await withSqlRetry(async (pool) => {
    await pool
      .request()
      .input('UserAgent', sql.NVarChar(400), sanitizedUA)
      .input('IpAddress', sql.VarChar(45), sanitizedIp)
      .input('Country', sql.NVarChar(120), sanitizedCountry)
      .query(
        `INSERT INTO dbo.SplashPageViews (UserAgent, IpAddress, Country)
         VALUES (@UserAgent, @IpAddress, @Country);`,
      );
  });
}

export async function recordSplashVisitorEmail(payload: {
  email: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const email = sanitizeEmail(payload.email);
  const lowerEmail = email.toLowerCase();
  const sanitizedUA = sanitizeUserAgent(payload.userAgent);
  const sanitizedIp = sanitizeIpAddress(payload.ipAddress);

  await withSqlRetry(async (pool) => {
    await pool
      .request()
      .input('Email', sql.NVarChar(320), email)
      .input('EmailNormalized', sql.NVarChar(320), lowerEmail)
      .input('UserAgent', sql.NVarChar(400), sanitizedUA)
      .input('IpAddress', sql.VarChar(45), sanitizedIp)
      .query(`
        MERGE dbo.SplashVisitorEmails AS target
        USING (SELECT @EmailNormalized AS EmailNormalized) AS source
          ON target.EmailNormalized = source.EmailNormalized
        WHEN NOT MATCHED THEN
          INSERT (Email, CreatedIpAddress, CreatedUserAgent)
          VALUES (@Email, @IpAddress, @UserAgent);
      `);
  });
}

export async function fetchSplashVisitorEmailCount(): Promise<number> {
  const count = await withSqlRetry(async (pool) => {
    const result = await pool.request().query(`SELECT COUNT_BIG(*) AS WaitlistCount FROM dbo.SplashVisitorEmails WITH (NOLOCK);`);
    return Number(result.recordset?.[0]?.WaitlistCount ?? 0);
  });
  return count;
}

export type SplashVisitorEmailRecord = {
  visitorEmailId: string;
  email: string;
  createdAt: string;
  createdIpAddress: string | null;
  createdUserAgent: string | null;
};

export async function fetchSplashVisitorEmails(): Promise<SplashVisitorEmailRecord[]> {
  const records = await withSqlRetry(async (pool) => {
    const result = await pool
      .request()
      .query(`
        SELECT VisitorEmailID, Email, CreatedAt, CreatedIpAddress, CreatedUserAgent
        FROM dbo.SplashVisitorEmails WITH (NOLOCK)
        ORDER BY CreatedAt DESC;
      `);
    return result.recordset ?? [];
  });

  return records.map((row: any) => ({
    visitorEmailId: String(row.VisitorEmailID),
    email: String(row.Email),
    createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : String(row.CreatedAt ?? ''),
    createdIpAddress: typeof row.CreatedIpAddress === 'string' ? row.CreatedIpAddress : null,
    createdUserAgent: typeof row.CreatedUserAgent === 'string' ? row.CreatedUserAgent : null,
  }));
}
