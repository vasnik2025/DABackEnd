import type { ConnectionPool } from "mssql";
import { getPool, sql } from "../config/db";

let cachedUsersTableSupportsZodiacSign: boolean | null = null;
let cachedSingleUsersTableExists: boolean | null = null;

export async function usersTableSupportsZodiacSign(pool?: ConnectionPool): Promise<boolean> {
    if (cachedUsersTableSupportsZodiacSign !== null) {
        return cachedUsersTableSupportsZodiacSign;
    }
    const activePool = pool ?? (await getPool());
    const result = await activePool
        .request()
        .query(`
      SELECT 1 AS HasColumn
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo'
        AND TABLE_NAME = 'Users'
        AND COLUMN_NAME = 'ZodiacSign'
    `);
    cachedUsersTableSupportsZodiacSign = Boolean(result.recordset?.length);
    return cachedUsersTableSupportsZodiacSign;
}

async function singleUsersTableExists(pool?: ConnectionPool): Promise<boolean> {
    if (cachedSingleUsersTableExists !== null) {
        return cachedSingleUsersTableExists;
    }
    const activePool = pool ?? (await getPool());
    try {
        const result = await activePool
            .request()
            .query(`
        SELECT 1 AS HasTable
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME = 'SingleUsers'
      `);
        cachedSingleUsersTableExists = Boolean(result.recordset?.length);
    }
    catch (error) {
        console.warn('[db] Failed to detect SingleUsers table; assuming absent', error);
        cachedSingleUsersTableExists = false;
    }
    return cachedSingleUsersTableExists;
}
const nullZodiacSelect = 'CAST(NULL AS NVARCHAR(64)) AS zodiacSign,';
export async function findUserByEmail(email) {
    const pool = await getPool();
    const supportsZodiac = await usersTableSupportsZodiacSign(pool);
    const hasLegacySinglesTable = await singleUsersTableExists(pool);
    const zodiacSelect = supportsZodiac ? 'ZodiacSign AS zodiacSign,' : nullZodiacSelect;
    const normalized = email.toLowerCase();
    const couple = await pool
        .request()
        .input('email', normalized)
        .query(`
      SELECT TOP 1
        CAST(UserID AS NVARCHAR(100)) AS id,
        LOWER(Email) AS email,
        Username AS username,
        LOWER(PartnerEmail) AS partnerEmail,
        Partner1Nickname AS partner1Nickname,
        Partner2Nickname AS partner2Nickname,
        CoupleType AS coupleType,
        AccountKind AS accountKind,
        ${zodiacSelect}
        PasswordHash AS passwordHash,
        ISNULL(IsEmailVerified, 0) AS isEmailVerified,
        ISNULL(IsPartnerEmailVerified, 0) AS isPartnerEmailVerified
      FROM Users
      WHERE LOWER(Email) = @email
    `);
    if (couple.recordset?.length) {
        const row = couple.recordset[0];
        const accountKind = typeof row.accountKind === 'string' ? row.accountKind.trim().toLowerCase() : '';
        const coupleTypeValue = typeof row.coupleType === 'string' ? row.coupleType.trim().toLowerCase() : '';
        const isSingleAccount = accountKind === 'single' ||
            coupleTypeValue === 'single' ||
            (!row.partnerEmail && coupleTypeValue.length === 0);
        return {
            id: String(row.id),
            email: String(row.email),
            username: row.username ?? null,
            partnerEmail: row.partnerEmail ?? null,
            partner1Nickname: row.partner1Nickname ?? null,
            partner2Nickname: row.partner2Nickname ?? null,
            coupleType: row.coupleType ?? (isSingleAccount ? 'SINGLE' : null),
            accountKind: isSingleAccount ? 'single' : (row.accountKind ?? 'couple'),
            zodiacSign: row.zodiacSign ?? null,
            passwordHash: row.passwordHash ?? null,
            isEmailVerified: Boolean(row.isEmailVerified),
            isPartnerEmailVerified: isSingleAccount ? true : Boolean(row.isPartnerEmailVerified),
            kind: isSingleAccount ? 'single' : 'couple',
        };
    }
    if (hasLegacySinglesTable) {
        const single = await pool
            .request()
            .input('email', normalized)
            .query(`
      SELECT TOP 1
        CAST(UserID AS NVARCHAR(100)) AS id,
        LOWER(Email) AS email,
        Username AS username,
        PasswordHash AS passwordHash,
        ISNULL(IsEmailVerified, 0) AS isEmailVerified
      FROM SingleUsers
      WHERE LOWER(Email) = @email
    `);
        if (single.recordset?.length) {
            const row = single.recordset[0];
            return {
                id: String(row.id),
                email: String(row.email ?? ''),
                username: row.username ?? null,
                partnerEmail: null,
                partner1Nickname: null,
                partner2Nickname: null,
                coupleType: 'SINGLE',
                zodiacSign: null,
                passwordHash: row.passwordHash ?? null,
                isEmailVerified: Boolean(row.isEmailVerified),
                isPartnerEmailVerified: true,
                kind: 'single',
            };
        }
    }
    return null;
}
export async function findUserByUsernameOrEmail(usernameOrEmail) {
    const pool = await getPool();
    const supportsZodiac = await usersTableSupportsZodiacSign(pool);
    const hasLegacySinglesTable = await singleUsersTableExists(pool);
    const zodiacSelect = supportsZodiac ? 'ZodiacSign AS zodiacSign,' : nullZodiacSelect;
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
        CoupleType AS coupleType,
        AccountKind AS accountKind,
        ${zodiacSelect}
        PasswordHash AS passwordHash,
        ISNULL(IsEmailVerified, 0) as isEmailVerified,
        ISNULL(IsPartnerEmailVerified, 0) as isPartnerEmailVerified
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
        const accountKind = typeof record.accountKind === 'string' ? record.accountKind.trim().toLowerCase() : '';
        const coupleTypeValue = typeof record.coupleType === 'string' ? record.coupleType.trim().toLowerCase() : '';
        const isSingleAccount = accountKind === 'single' ||
            coupleTypeValue === 'single' ||
            (!record.partnerEmail && coupleTypeValue.length === 0);
        return {
            id: String(record.id),
            email: String(record.email ?? ''),
            username: record.username ?? null,
            partnerEmail: record.partnerEmail ?? null,
            partner1Nickname: record.partner1Nickname ?? null,
            partner2Nickname: record.partner2Nickname ?? null,
            coupleType: record.coupleType ?? (isSingleAccount ? 'SINGLE' : null),
            accountKind: isSingleAccount ? 'single' : (record.accountKind ?? 'couple'),
            zodiacSign: record.zodiacSign ?? null,
            passwordHash: record.passwordHash ?? null,
            isEmailVerified: Boolean(record.isEmailVerified),
            isPartnerEmailVerified: isSingleAccount ? true : Boolean(record.isPartnerEmailVerified),
            activeLoginEmail,
            kind: isSingleAccount ? 'single' : 'couple',
        };
    }
    if (!hasLegacySinglesTable) {
        return null;
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
        id: String(single.id),
        email: String(single.email ?? ''),
        username: single.username ?? null,
        partnerEmail: null,
        partner1Nickname: null,
        partner2Nickname: null,
        coupleType: 'SINGLE',
        accountKind: 'single',
        zodiacSign: null,
        passwordHash: single.passwordHash ?? null,
        isEmailVerified: Boolean(single.isEmailVerified),
        isPartnerEmailVerified: true,
        activeLoginEmail: single.email ?? undefined,
        kind: 'single',
    };
}
export async function findCoupleByEmails(primaryEmail, partnerEmail) {
    const normalizedPrimary = primaryEmail.trim().toLowerCase();
    const normalizedPartner = partnerEmail.trim().toLowerCase();
    if (!normalizedPrimary.length || !normalizedPartner.length) {
        return null;
    }
    const pool = await getPool();
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
export async function refreshCoupleMembershipStatus(userId) {
    const pool = await getPool();
    const current = await pool
        .request()
        .input('userId', sql.VarChar(255), userId)
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
            .input('userId', sql.VarChar(255), userId)
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
export async function createUser(data) {
  const pool = await getPool();
  const supportsZodiac = await usersTableSupportsZodiacSign(pool);
  const request = pool.request()
    .input('email', data.email.toLowerCase())
    .input('passwordHash', data.passwordHash)
    .input('username', data.username)
    .input('partnerEmail', data.partnerEmail ? data.partnerEmail.toLowerCase() : null)
    .input('coupleType', typeof data.coupleType === 'string' ? data.coupleType.toUpperCase() : null)
    .input('country', data.country)
    .input('city', data.city)
    .input('latitude', sql.Decimal(9, 6), data.latitude ?? null)
    .input('longitude', sql.Decimal(9, 6), data.longitude ?? null)
    .input('partner1Nickname', data.partner1Nickname)
    .input('partner2Nickname', data.partner2Nickname);
  if (supportsZodiac) {
    request.input('zodiacSign', sql.NVarChar(64), data.zodiacSign);
  }
    const zodiacInsertColumn = supportsZodiac ? ', ZodiacSign' : '';
    const zodiacInsertValue = supportsZodiac ? ', @zodiacSign' : '';
    const zodiacSelect = supportsZodiac ? ', @zodiacSign AS zodiacSign' : ', CAST(NULL AS NVARCHAR(64)) AS zodiacSign';
    const res = await request
        .query(`
      DECLARE @id UNIQUEIDENTIFIER = NEWID();
      INSERT INTO Users (
        UserID, Email, PasswordHash, Username, CreatedAt,
        PartnerEmail, CoupleType, Country, City, Latitude, Longitude, Partner1Nickname, Partner2Nickname${zodiacInsertColumn},
        IsEmailVerified, IsPartnerEmailVerified
      )
      VALUES (
        @id, @email, @passwordHash, @username, SYSUTCDATETIME(),
        @partnerEmail, @coupleType, @country, @city, @latitude, @longitude, @partner1Nickname, @partner2Nickname${zodiacInsertValue},
        0, 0
      );
      SELECT CAST(@id AS NVARCHAR(100)) AS id, LOWER(@email) AS email${zodiacSelect};
  `);
    return res.recordset[0];
}
export async function createSingleUser(data) {
    const pool = await getPool();
    const supportsZodiac = await usersTableSupportsZodiacSign(pool);
    const normalizedEmail = data.email.toLowerCase();
    const zodiac = data.zodiacSign?.trim?.() ?? 'SINGLE';
    const partner1Nickname = typeof data.partner1Nickname === 'string' && data.partner1Nickname.trim().length
        ? data.partner1Nickname.trim()
        : data.username;
    const partner2Nickname = typeof data.partner2Nickname === 'string' && data.partner2Nickname.trim().length
        ? data.partner2Nickname.trim()
        : partner1Nickname;
  const request = pool
    .request()
    .input('email', sql.NVarChar(320), normalizedEmail)
    .input('passwordHash', sql.NVarChar(255), data.passwordHash)
    .input('username', sql.NVarChar(255), data.username)
    .input('partner1Nickname', sql.NVarChar(255), partner1Nickname)
    .input('partner2Nickname', sql.NVarChar(255), partner2Nickname)
    .input('country', sql.NVarChar(255), data.country ?? null)
    .input('city', sql.NVarChar(255), data.city ?? null)
    .input('latitude', sql.Decimal(9, 6), data.latitude ?? null)
    .input('longitude', sql.Decimal(9, 6), data.longitude ?? null)
    .input('coupleType', sql.NVarChar(50), null);
    if (supportsZodiac) {
        request.input('zodiacSign', sql.NVarChar(64), zodiac);
    }
    const zodiacInsertColumn = supportsZodiac ? ', ZodiacSign' : '';
    const zodiacInsertValue = supportsZodiac ? ', @zodiacSign' : '';
    const zodiacSelect = supportsZodiac ? ', @zodiacSign AS zodiacSign' : ', CAST(NULL AS NVARCHAR(64)) AS zodiacSign';
    const res = await request.query(`
      DECLARE @id UNIQUEIDENTIFIER = NEWID();
      INSERT INTO Users (
        UserID,
        Email,
        PasswordHash,
        Username,
        CreatedAt,
        AccountKind,
        PartnerEmail,
        CoupleType,
        Country,
        City,
        Latitude,
        Longitude,
        Partner1Nickname,
        Partner2Nickname,
        ${supportsZodiac ? 'ZodiacSign,' : ''}
        IsEmailVerified,
        IsPartnerEmailVerified
      )
      VALUES (
        @id,
        @email,
        @passwordHash,
        @username,
        SYSUTCDATETIME(),
        'single',
        NULL,
        @coupleType,
        @country,
        @city,
        @latitude,
        @longitude,
        @partner1Nickname,
        @partner2Nickname${zodiacInsertValue},
        0,
        1
      );
      SELECT CAST(@id AS NVARCHAR(100)) AS id, LOWER(@email) AS email${zodiacSelect};
  `);
    return res.recordset[0];
}
export async function listCoupleEmailsByCountry(country, options) {
    const normalizedCountry = typeof country === 'string' ? country.trim().toLowerCase() : '';
    if (!normalizedCountry.length) {
        return [];
    }
    const pool = await getPool();
    const request = pool
        .request()
        .input('country', normalizedCountry);
    if (options?.excludeUserId) {
        request.input('excludeUserId', sql.VarChar(255), options.excludeUserId);
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
export async function setUserEmailVerified(userId) {
    const pool = await getPool();
    const result = await pool
        .request()
        .input('UserID', sql.VarChar(255), userId)
        .query('UPDATE Users SET IsEmailVerified = 1 WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID)');
    const updated = result.rowsAffected?.[0] ?? 0;
    const hasLegacySinglesTable = await singleUsersTableExists(pool);
    if (!updated && hasLegacySinglesTable) {
        await pool
            .request()
            .input('UserID', sql.VarChar(255), userId)
            .query('UPDATE SingleUsers SET IsEmailVerified = 1 WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID)');
    }
}
export async function setPartnerEmailVerified(userId) {
    const pool = await getPool();
    await pool.request()
        .input('UserID', sql.VarChar(255), userId)
        .query('UPDATE Users SET IsPartnerEmailVerified = 1 WHERE UserID = @UserID');
}
export async function getUserVerificationStatus(userId) {
    const pool = await getPool();
    const result = await pool
        .request()
        .input('UserID', sql.VarChar(255), userId)
        .query(`
      SELECT
        ISNULL(IsEmailVerified, 0) AS isEmailVerified,
        ISNULL(IsPartnerEmailVerified, 0) AS isPartnerEmailVerified
      FROM Users
      WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID)
    `);
    const record = result.recordset?.[0];
    if (record) {
        return {
            isEmailVerified: Boolean(record.isEmailVerified),
            isPartnerEmailVerified: Boolean(record.isPartnerEmailVerified),
        };
    }
    const hasLegacySinglesTable = await singleUsersTableExists(pool);
    if (!hasLegacySinglesTable) {
        return {
            isEmailVerified: false,
            isPartnerEmailVerified: true,
        };
    }
    const singleResult = await pool
        .request()
        .input('UserID', sql.VarChar(255), userId)
        .query(`
      SELECT ISNULL(IsEmailVerified, 0) AS isEmailVerified
      FROM SingleUsers
      WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID)
    `);
    const singleRecord = singleResult.recordset?.[0] ?? {};
    return {
        isEmailVerified: Boolean(singleRecord.isEmailVerified),
        isPartnerEmailVerified: true,
    };
}





