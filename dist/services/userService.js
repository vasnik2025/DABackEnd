"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findUserByEmail = findUserByEmail;
exports.findUserByUsernameOrEmail = findUserByUsernameOrEmail;
exports.findCoupleByEmails = findCoupleByEmails;
exports.refreshCoupleMembershipStatus = refreshCoupleMembershipStatus;
exports.createUser = createUser;
exports.listCoupleEmailsByCountry = listCoupleEmailsByCountry;
exports.setUserEmailVerified = setUserEmailVerified;
exports.setPartnerEmailVerified = setPartnerEmailVerified;
exports.getUserVerificationStatus = getUserVerificationStatus;
const db_1 = require("../config/db");
async function findUserByEmail(email) {
    const pool = await (0, db_1.getPool)();
    const normalized = email.toLowerCase();
    const couple = await pool
        .request()
        .input('email', normalized)
        .query(`
      SELECT TOP 1
        CAST(UserID AS NVARCHAR(100)) AS id,
        LOWER(Email) AS email,
        PasswordHash AS passwordHash,
        IsEmailVerified AS isEmailVerified,
        IsPartnerEmailVerified AS isPartnerEmailVerified
      FROM Users
      WHERE LOWER(Email) = @email
    `);
    if (couple.recordset?.length) {
        const row = couple.recordset[0];
        return {
            ...row,
            kind: 'couple',
        };
    }
    const single = await pool
        .request()
        .input('email', normalized)
        .query(`
      SELECT TOP 1
        CAST(UserID AS NVARCHAR(100)) AS id,
        LOWER(Email) AS email,
        PasswordHash AS passwordHash,
        IsEmailVerified AS isEmailVerified
      FROM SingleUsers
      WHERE LOWER(Email) = @email
    `);
    if (single.recordset?.length) {
        const row = single.recordset[0];
        return {
            ...row,
            isPartnerEmailVerified: true,
            kind: 'single',
        };
    }
    return null;
}
async function findUserByUsernameOrEmail(usernameOrEmail) {
    const pool = await (0, db_1.getPool)();
    const normalized = usernameOrEmail.toLowerCase();
    const res = await pool
        .request()
        .input('usernameOrEmail', normalized)
        .query(`
      SELECT TOP 1
        CAST(UserID AS NVARCHAR(100)) AS id,
        LOWER(Email) AS email,
        Username AS username,
        LOWER(PartnerEmail) AS partnerEmail,
        Partner1Nickname AS partner1Nickname,
        Partner2Nickname AS partner2Nickname,
        PasswordHash AS passwordHash,
        IsEmailVerified as isEmailVerified,
        IsPartnerEmailVerified as isPartnerEmailVerified
      FROM Users
      WHERE (LOWER(Email) = @usernameOrEmail)
         OR (PartnerEmail IS NOT NULL AND LOWER(PartnerEmail) = @usernameOrEmail)
         OR LOWER(Username) = @usernameOrEmail
    `);
    const record = res.recordset[0] ?? null;
    if (record) {
        const emailLower = String(record.email ?? '').toLowerCase();
        const partnerLower = String(record.partnerEmail ?? '').toLowerCase();
        const activeLoginEmail = normalized === partnerLower && partnerLower
            ? partnerLower
            : normalized === emailLower
                ? emailLower
                : normalized;
        return { ...record, activeLoginEmail, kind: 'couple' };
    }
    const singleResult = await pool
        .request()
        .input('usernameOrEmail', normalized)
        .query(`
      SELECT TOP 1
        CAST(UserID AS NVARCHAR(100)) AS id,
        LOWER(Email) AS email,
        Username AS username,
        PasswordHash AS passwordHash,
        IsEmailVerified AS isEmailVerified
      FROM SingleUsers
      WHERE LOWER(Email) = @usernameOrEmail
         OR LOWER(Username) = @usernameOrEmail
    `);
    const single = singleResult.recordset[0] ?? null;
    if (!single)
        return null;
    return {
        ...single,
        partnerEmail: null,
        partner1Nickname: null,
        partner2Nickname: null,
        isPartnerEmailVerified: true,
        activeLoginEmail: single.email,
        kind: 'single',
    };
}
async function findCoupleByEmails(primaryEmail, partnerEmail) {
    const normalizedPrimary = primaryEmail.trim().toLowerCase();
    const normalizedPartner = partnerEmail.trim().toLowerCase();
    if (!normalizedPrimary.length || !normalizedPartner.length) {
        return null;
    }
    const pool = await (0, db_1.getPool)();
    const result = await pool
        .request()
        .input('primaryEmail', normalizedPrimary)
        .input('partnerEmail', normalizedPartner)
        .query(`
      SELECT TOP 1
        CAST(UserID AS NVARCHAR(100)) AS id,
        LOWER(Email) AS primaryEmail,
        LOWER(PartnerEmail) AS partnerEmail,
        Username AS username,
        Partner1Nickname AS partner1Nickname,
        Partner2Nickname AS partner2Nickname,
        ISNULL(IsEmailVerified, 0) AS isEmailVerified,
        ISNULL(IsPartnerEmailVerified, 0) AS isPartnerEmailVerified
      FROM Users
      WHERE (
        LOWER(Email) = @primaryEmail AND LOWER(PartnerEmail) = @partnerEmail
      ) OR (
        LOWER(Email) = @partnerEmail AND LOWER(PartnerEmail) = @primaryEmail
      )
    `);
    const record = result.recordset?.[0];
    if (!record) {
        return null;
    }
    return {
        id: String(record.id),
        primaryEmail: record.primaryEmail ? String(record.primaryEmail).toLowerCase() : '',
        partnerEmail: record.partnerEmail ? String(record.partnerEmail).toLowerCase() : null,
        username: record.username ?? null,
        partner1Nickname: record.partner1Nickname ?? null,
        partner2Nickname: record.partner2Nickname ?? null,
        isEmailVerified: Boolean(record.isEmailVerified),
        isPartnerEmailVerified: Boolean(record.isPartnerEmailVerified),
    };
}
async function refreshCoupleMembershipStatus(userId) {
    const pool = await (0, db_1.getPool)();
    const current = await pool
        .request()
        .input('userId', db_1.sql.VarChar(255), userId)
        .query(`
      SELECT
        MembershipType,
        MembershipExpiryDate
      FROM Users
      WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @userId)
    `);
    const row = current.recordset?.[0];
    if (!row) {
        return { membershipType: null, membershipExpiryDate: null, downgraded: false };
    }
    const rawType = typeof row.MembershipType === 'string' ? row.MembershipType.trim() : null;
    const normalizedType = rawType?.toLowerCase() ?? '';
    const expiryValue = row.MembershipExpiryDate ?? null;
    const expiryDate = expiryValue instanceof Date
        ? expiryValue
        : expiryValue
            ? new Date(expiryValue)
            : null;
    const expired = expiryDate ? expiryDate.getTime() <= Date.now() : false;
    if (normalizedType && normalizedType !== 'free' && expired) {
        await pool
            .request()
            .input('userId', db_1.sql.VarChar(255), userId)
            .query(`
        UPDATE Users
        SET MembershipType = 'free',
            MembershipExpiryDate = NULL,
            SubscribedAt = NULL
        WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @userId)
      `);
        return { membershipType: 'free', membershipExpiryDate: null, downgraded: true };
    }
    return {
        membershipType: rawType ?? null,
        membershipExpiryDate: expiryDate ?? null,
        downgraded: false,
    };
}
async function createUser(data) {
    const pool = await (0, db_1.getPool)();
    const res = await pool.request()
        .input('email', data.email.toLowerCase())
        .input('passwordHash', data.passwordHash)
        .input('username', data.username)
        .input('partnerEmail', data.partnerEmail ? data.partnerEmail.toLowerCase() : null)
        .input('coupleType', typeof data.coupleType === 'string' ? data.coupleType.toUpperCase() : null)
        .input('country', data.country)
        .input('city', data.city)
        .input('partner1Nickname', data.partner1Nickname)
        .input('partner2Nickname', data.partner2Nickname)
        .query(`
      DECLARE @id UNIQUEIDENTIFIER = NEWID();
      INSERT INTO Users (
        UserID, Email, PasswordHash, Username, CreatedAt,
        PartnerEmail, CoupleType, Country, City, Partner1Nickname, Partner2Nickname,
        IsEmailVerified, IsPartnerEmailVerified
      )
      VALUES (
        @id, @email, @passwordHash, @username, SYSUTCDATETIME(),
        @partnerEmail, @coupleType, @country, @city, @partner1Nickname, @partner2Nickname,
        0, 0
      );
      SELECT CAST(@id AS NVARCHAR(100)) AS id, LOWER(@email) AS email;
    `);
    return res.recordset[0];
}
async function listCoupleEmailsByCountry(country, options) {
    const normalizedCountry = typeof country === 'string' ? country.trim().toLowerCase() : '';
    if (!normalizedCountry.length) {
        return [];
    }
    const pool = await (0, db_1.getPool)();
    const request = pool
        .request()
        .input('country', normalizedCountry);
    if (options?.excludeUserId) {
        request.input('excludeUserId', db_1.sql.VarChar(255), options.excludeUserId);
    }
    const result = await request.query(`
    SELECT
      CAST(UserID AS NVARCHAR(100)) AS userId,
      LOWER(Email) AS primaryEmail,
      LOWER(PartnerEmail) AS partnerEmail,
      ISNULL(IsEmailVerified, 0) AS isEmailVerified,
      ISNULL(IsPartnerEmailVerified, 0) AS isPartnerEmailVerified
    FROM Users
    WHERE Country IS NOT NULL
      AND LOWER(Country) = @country
      ${options?.excludeUserId ? 'AND UserID <> TRY_CONVERT(UNIQUEIDENTIFIER, @excludeUserId)' : ''}
  `);
    return (result.recordset ?? [])
        .filter((row) => Boolean(row.primaryEmail) && Boolean(row.isEmailVerified))
        .map((row) => ({
        userId: String(row.userId),
        primaryEmail: String(row.primaryEmail),
        partnerEmail: row.partnerEmail ? String(row.partnerEmail) : null,
        isPartnerEmailVerified: Boolean(row.isPartnerEmailVerified),
    }));
}
async function setUserEmailVerified(userId) {
    const pool = await (0, db_1.getPool)();
    await pool.request()
        .input('UserID', db_1.sql.VarChar(255), userId)
        .query('UPDATE Users SET IsEmailVerified = 1 WHERE UserID = @UserID');
}
async function setPartnerEmailVerified(userId) {
    const pool = await (0, db_1.getPool)();
    await pool.request()
        .input('UserID', db_1.sql.VarChar(255), userId)
        .query('UPDATE Users SET IsPartnerEmailVerified = 1 WHERE UserID = @UserID');
}
async function getUserVerificationStatus(userId) {
    const pool = await (0, db_1.getPool)();
    const result = await pool
        .request()
        .input('UserID', db_1.sql.VarChar(255), userId)
        .query(`
      SELECT
        ISNULL(IsEmailVerified, 0) AS isEmailVerified,
        ISNULL(IsPartnerEmailVerified, 0) AS isPartnerEmailVerified
      FROM Users
      WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID)
    `);
    const record = result.recordset?.[0] ?? {};
    return {
        isEmailVerified: Boolean(record.isEmailVerified),
        isPartnerEmailVerified: Boolean(record.isPartnerEmailVerified),
    };
}
