"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeInterest = normalizeInterest;
exports.recordSplashSurveySubmission = recordSplashSurveySubmission;
exports.fetchSplashSurveyStats = fetchSplashSurveyStats;
exports.recordSplashPageView = recordSplashPageView;
exports.recordSplashVisitorEmail = recordSplashVisitorEmail;
exports.fetchSplashVisitorEmailCount = fetchSplashVisitorEmailCount;
exports.fetchSplashVisitorEmails = fetchSplashVisitorEmails;
const db_1 = require("../config/db");
const IDEA_MAX_LENGTH = 2000;
const ALLOWED_INTERESTS = new Set(['yes', 'no', 'curious']);
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
function normalizeInterest(value) {
    const normalized = value?.toLowerCase().trim();
    if (ALLOWED_INTERESTS.has(normalized)) {
        return normalized;
    }
    throw new Error(`Unsupported splash survey interest value: ${value}`);
}
function sanitizeIdea(idea) {
    if (!idea)
        return null;
    const trimmed = idea.trim();
    if (!trimmed) {
        return null;
    }
    return trimmed.slice(0, IDEA_MAX_LENGTH);
}
function sanitizeUserAgent(userAgent) {
    if (!userAgent)
        return null;
    return userAgent.slice(0, 400);
}
function sanitizeIpAddress(ipAddress) {
    if (!ipAddress)
        return null;
    return ipAddress.slice(0, 45);
}
function sanitizeCountry(country) {
    if (!country)
        return null;
    const trimmed = country.trim();
    if (!trimmed) {
        return null;
    }
    return trimmed.slice(0, 120);
}
function sanitizeEmail(email) {
    const trimmed = email.trim();
    if (!trimmed || trimmed.length > 320) {
        throw new Error('Email must be 1-320 characters long.');
    }
    return trimmed;
}
function mapStatsRow(row) {
    const fallbackDate = row?.LastSubmissionAtUtc instanceof Date ? row.LastSubmissionAtUtc.toISOString() : null;
    return {
        yesCount: Number(row?.YesCount ?? 0),
        noCount: Number(row?.NoCount ?? 0),
        curiousCount: Number(row?.CuriousCount ?? 0),
        ideaCount: Number(row?.IdeaCount ?? 0),
        totalSubmissions: Number(row?.TotalSubmissions ?? 0),
        viewCount: Number(row?.ViewCount ?? 0),
        lastSubmissionAtUtc: fallbackDate,
        waitlistCount: 0,
    };
}
async function recordSplashSurveySubmission(submission) {
    const sanitizedIdea = sanitizeIdea(submission.idea);
    const sanitizedUserAgent = sanitizeUserAgent(submission.userAgent);
    const sanitizedIp = sanitizeIpAddress(submission.ipAddress);
    const sanitizedCountry = sanitizeCountry(submission.country);
    await (0, db_1.withSqlRetry)(async (pool) => {
        await pool
            .request()
            .input('InterestChoice', db_1.sql.VarChar(10), submission.interest)
            .input('IdeaNote', db_1.sql.NVarChar(IDEA_MAX_LENGTH), sanitizedIdea)
            .input('UserAgent', db_1.sql.NVarChar(400), sanitizedUserAgent)
            .input('IpAddress', db_1.sql.VarChar(45), sanitizedIp)
            .input('Country', db_1.sql.NVarChar(120), sanitizedCountry)
            .query(`INSERT INTO dbo.SplashSurveySubmissions (InterestChoice, IdeaNote, UserAgent, IpAddress, Country)
         VALUES (@InterestChoice, @IdeaNote, @UserAgent, @IpAddress, @Country);`);
    });
    return fetchSplashSurveyStats();
}
async function fetchSplashSurveyStats() {
    const row = await (0, db_1.withSqlRetry)(async (pool) => {
        const result = await pool.request().query(SELECT_STATS_SQL);
        return result.recordset?.[0];
    });
    const stats = mapStatsRow(row);
    stats.waitlistCount = await fetchSplashVisitorEmailCount();
    return stats;
}
async function recordSplashPageView(payload) {
    const sanitizedUA = sanitizeUserAgent(payload.userAgent);
    const sanitizedIp = sanitizeIpAddress(payload.ipAddress);
    const sanitizedCountry = sanitizeCountry(payload.country);
    await (0, db_1.withSqlRetry)(async (pool) => {
        await pool
            .request()
            .input('UserAgent', db_1.sql.NVarChar(400), sanitizedUA)
            .input('IpAddress', db_1.sql.VarChar(45), sanitizedIp)
            .input('Country', db_1.sql.NVarChar(120), sanitizedCountry)
            .query(`INSERT INTO dbo.SplashPageViews (UserAgent, IpAddress, Country)
         VALUES (@UserAgent, @IpAddress, @Country);`);
    });
}
async function recordSplashVisitorEmail(payload) {
    const email = sanitizeEmail(payload.email);
    const lowerEmail = email.toLowerCase();
    const sanitizedUA = sanitizeUserAgent(payload.userAgent);
    const sanitizedIp = sanitizeIpAddress(payload.ipAddress);
    await (0, db_1.withSqlRetry)(async (pool) => {
        await pool
            .request()
            .input('Email', db_1.sql.NVarChar(320), email)
            .input('EmailNormalized', db_1.sql.NVarChar(320), lowerEmail)
            .input('UserAgent', db_1.sql.NVarChar(400), sanitizedUA)
            .input('IpAddress', db_1.sql.VarChar(45), sanitizedIp)
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
async function fetchSplashVisitorEmailCount() {
    const count = await (0, db_1.withSqlRetry)(async (pool) => {
        const result = await pool.request().query(`SELECT COUNT_BIG(*) AS WaitlistCount FROM dbo.SplashVisitorEmails WITH (NOLOCK);`);
        return Number(result.recordset?.[0]?.WaitlistCount ?? 0);
    });
    return count;
}
async function fetchSplashVisitorEmails() {
    const records = await (0, db_1.withSqlRetry)(async (pool) => {
        const result = await pool
            .request()
            .query(`
        SELECT VisitorEmailID, Email, CreatedAt, CreatedIpAddress, CreatedUserAgent
        FROM dbo.SplashVisitorEmails WITH (NOLOCK)
        ORDER BY CreatedAt DESC;
      `);
        return result.recordset ?? [];
    });
    return records.map((row) => ({
        visitorEmailId: String(row.VisitorEmailID),
        email: String(row.Email),
        createdAt: row.CreatedAt instanceof Date ? row.CreatedAt.toISOString() : String(row.CreatedAt ?? ''),
        createdIpAddress: typeof row.CreatedIpAddress === 'string' ? row.CreatedIpAddress : null,
        createdUserAgent: typeof row.CreatedUserAgent === 'string' ? row.CreatedUserAgent : null,
    }));
}
