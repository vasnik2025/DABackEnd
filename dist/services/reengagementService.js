"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listEligibleReengagementRecipients = listEligibleReengagementRecipients;
exports.getReengagementSummary = getReengagementSummary;
exports.createReengagementToken = createReengagementToken;
exports.verifyReengagementToken = verifyReengagementToken;
exports.getPreferencesContext = getPreferencesContext;
exports.markReengagementOptOut = markReengagementOptOut;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../config/db");
const errorHandler_1 = require("../utils/errorHandler");
const TOKEN_AUDIENCE = 'reengagement-preferences';
const TOKEN_SCOPE = 'reengagement-preferences';
const TOKEN_TTL = process.env.REENGAGEMENT_PREFERENCES_TOKEN_TTL ?? '90d';
const normalizeEmail = (value) => {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length ? trimmed : null;
};
const formatDisplayName = (row) => {
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
async function listEligibleReengagementRecipients() {
    const result = await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .query(`
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
      `));
    const rows = (result.recordset ?? []).map((row) => ({
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
        const emailSet = new Set();
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
async function getReengagementSummary() {
    const [eligibleRecipients, aggregateResult] = await Promise.all([
        listEligibleReengagementRecipients(),
        (0, db_1.withSqlRetry)((pool) => pool
            .request()
            .query(`
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
        `)),
    ]);
    const aggregateRow = (aggregateResult.recordset?.[0] ?? {});
    const totalCouples = Number(aggregateRow.totalCouples ?? 0);
    const excludedCouples = Number(aggregateRow.excludedCouples ?? 0);
    const eligibleCouples = eligibleRecipients.length;
    const deliverableEmails = eligibleRecipients.reduce((acc, recipient) => acc + recipient.emails.length, 0);
    return {
        totalCouples,
        eligibleCouples,
        excludedCouples,
        deliverableEmails,
    };
}
function createReengagementToken(userId) {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured');
    }
    const secret = process.env.JWT_SECRET;
    const payload = { sub: userId, userId, scope: TOKEN_SCOPE };
    const options = {
        expiresIn: TOKEN_TTL,
        audience: TOKEN_AUDIENCE,
    };
    return jsonwebtoken_1.default.sign(payload, secret, options);
}
function verifyReengagementToken(token) {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET is not configured');
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET, {
            audience: TOKEN_AUDIENCE,
        });
        const userId = String(payload.userId ?? payload.sub ?? '');
        const scope = String(payload.scope ?? '');
        if (!userId) {
            throw new errorHandler_1.OperationalError('Token missing user reference.', 400);
        }
        if (scope !== TOKEN_SCOPE) {
            throw new errorHandler_1.OperationalError('Token scope mismatch.', 400);
        }
        return { userId };
    }
    catch (error) {
        if (error instanceof errorHandler_1.OperationalError) {
            throw error;
        }
        throw new errorHandler_1.OperationalError('Invalid or expired preferences link.', 400);
    }
}
async function getPreferencesContext(userId) {
    const result = await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('UserID', db_1.sql.VarChar(255), userId)
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
      `));
    const row = result.recordset?.[0];
    if (!row) {
        return null;
    }
    const context = {
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
async function markReengagementOptOut(userId) {
    const pool = await (0, db_1.getPool)();
    const result = await pool
        .request()
        .input('UserID', db_1.sql.VarChar(255), userId)
        .query(`
      UPDATE dbo.Users
      SET
        DisableReengagementReminders = 1,
        ReengagementOptOutAt = COALESCE(ReengagementOptOutAt, SYSUTCDATETIME())
      WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID);
    `);
    if ((result.rowsAffected?.[0] ?? 0) === 0) {
        throw new errorHandler_1.OperationalError('Account not found for preferences update.', 404);
    }
}
