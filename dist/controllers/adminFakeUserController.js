"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listFakeUsers = listFakeUsers;
exports.updateFakeUser = updateFakeUser;
exports.deleteFakeUser = deleteFakeUser;
const db_1 = require("../config/db");
const errorHandler_1 = require("../utils/errorHandler");
const accountDeletionService_1 = require("../services/accountDeletionService");
const isGuid = (value) => typeof value === 'string' &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
const toIsoString = (value) => {
    if (!value)
        return null;
    const date = value instanceof Date
        ? value
        : typeof value === 'string' || value instanceof String
            ? new Date(value)
            : null;
    if (!date || Number.isNaN(date.getTime())) {
        return null;
    }
    return date.toISOString();
};
const buildPhotoCountExpression = (hasPhotosTable) => hasPhotosTable
    ? '(SELECT COUNT(*) FROM dbo.Photos p WHERE p.UserID = f.UserID)'
    : '0';
const mapFakeUserRow = (row) => {
    const getString = (key) => {
        const value = row[key];
        if (value === null || value === undefined)
            return null;
        const text = String(value).trim();
        return text.length ? text : null;
    };
    const getBoolean = (key) => Boolean(row[key] === true ||
        row[key] === 1 ||
        row[key] === '1' ||
        String(row[key] ?? '').toLowerCase() === 'true');
    const getNumber = (key) => {
        const value = Number(row[key]);
        return Number.isFinite(value) ? value : 0;
    };
    return {
        fakeUserId: getString('FakeUserID'),
        userId: getString('UserID'),
        username: getString('Username'),
        email: getString('Email'),
        partnerEmail: getString('PartnerEmail'),
        partner1Nickname: getString('Partner1Nickname'),
        partner2Nickname: getString('Partner2Nickname'),
        coupleType: getString('CoupleType'),
        country: getString('Country'),
        city: getString('City'),
        membershipType: getString('MembershipType'),
        membershipExpiryDate: toIsoString(row['MembershipExpiryDate']),
        subscribedAt: toIsoString(row['SubscribedAt']),
        welcomeMessage: getString('WelcomeMessage'),
        bio: getString('Bio'),
        interestsCsv: getString('InterestsCsv'),
        isEmailVerified: getBoolean('IsEmailVerified'),
        isPartnerEmailVerified: getBoolean('IsPartnerEmailVerified'),
        photoCount: getNumber('PhotoCount'),
        fakeLabel: getString('CoupleLabel'),
        fakeSegment: getString('Segment'),
        fakeNotes: getString('Notes'),
        fakeIsActive: getBoolean('IsActive'),
        membershipPlan: getString('MembershipPlan'),
        originCountry: getString('OriginCountry') ?? getString('Country'),
        originCity: getString('OriginCity') ?? getString('City'),
        fakeCreatedAt: toIsoString(row['FakeCreatedAt']),
        fakeUpdatedAt: toIsoString(row['FakeUpdatedAt']),
        createdAt: toIsoString(row['CreatedAt']),
        updatedAt: toIsoString(row['UpdatedAt']),
    };
};
const fetchPhotoTableFlag = async () => {
    const pool = await (0, db_1.getPool)();
    const result = await pool
        .request()
        .query(`SELECT CASE WHEN OBJECT_ID(N'dbo.Photos', N'U') IS NULL THEN 0 ELSE 1 END AS ExistsFlag;`);
    return Boolean(result.recordset?.[0]?.ExistsFlag);
};
const fetchFakeUserById = async (fakeUserId, hasPhotosTable) => {
    const pool = await (0, db_1.getPool)();
    const query = `
    SELECT
      CAST(f.FakeUserID AS NVARCHAR(100)) AS FakeUserID,
      CAST(f.UserID AS NVARCHAR(100)) AS UserID,
      u.Username,
      u.Email,
      u.PartnerEmail,
      u.Partner1Nickname,
      u.Partner2Nickname,
      u.CoupleType,
      u.Country,
      u.City,
      u.MembershipType,
      u.MembershipExpiryDate,
      u.SubscribedAt,
      u.WelcomeMessage,
      u.Bio,
      u.InterestsCsv,
      ISNULL(u.IsEmailVerified, 0) AS IsEmailVerified,
      ISNULL(u.IsPartnerEmailVerified, 0) AS IsPartnerEmailVerified,
      ${buildPhotoCountExpression(hasPhotosTable)} AS PhotoCount,
      f.CoupleLabel,
      f.MembershipPlan,
      f.IsActive,
      f.OriginCountry,
      f.OriginCity,
      f.Segment,
      f.Notes,
      f.CreatedAt AS FakeCreatedAt,
      f.UpdatedAt AS FakeUpdatedAt,
      u.CreatedAt,
      u.UpdatedAt
    FROM dbo.FakeUsers f
    JOIN dbo.Users u ON u.UserID = f.UserID
    WHERE f.FakeUserID = @FakeUserID;
  `;
    const result = await pool
        .request()
        .input('FakeUserID', db_1.sql.UniqueIdentifier, fakeUserId)
        .query(query);
    const record = result.recordset?.[0];
    return record ? mapFakeUserRow(record) : null;
};
async function listFakeUsers(req, res, next) {
    try {
        const hasPhotosTable = await fetchPhotoTableFlag();
        const pool = await (0, db_1.getPool)();
        const query = `
      SELECT
        CAST(f.FakeUserID AS NVARCHAR(100)) AS FakeUserID,
        CAST(f.UserID AS NVARCHAR(100)) AS UserID,
        u.Username,
        u.Email,
        u.PartnerEmail,
        u.Partner1Nickname,
        u.Partner2Nickname,
        u.CoupleType,
        u.Country,
        u.City,
        u.MembershipType,
        u.MembershipExpiryDate,
        u.SubscribedAt,
        u.WelcomeMessage,
        u.Bio,
        u.InterestsCsv,
        ISNULL(u.IsEmailVerified, 0) AS IsEmailVerified,
        ISNULL(u.IsPartnerEmailVerified, 0) AS IsPartnerEmailVerified,
        ${buildPhotoCountExpression(hasPhotosTable)} AS PhotoCount,
        f.CoupleLabel,
        f.MembershipPlan,
        f.IsActive,
        f.OriginCountry,
        f.OriginCity,
        f.Segment,
        f.Notes,
        f.CreatedAt AS FakeCreatedAt,
        f.UpdatedAt AS FakeUpdatedAt,
        u.CreatedAt,
        u.UpdatedAt
      FROM dbo.FakeUsers f
      JOIN dbo.Users u ON u.UserID = f.UserID
      ORDER BY f.CreatedAt ASC;
    `;
        const result = await pool.request().query(query);
        const fakeUsers = (result.recordset ?? []).map((row) => mapFakeUserRow(row));
        res.status(200).json({ fakeUsers });
    }
    catch (error) {
        next(error);
    }
}
const coerceDateTime = (value, fieldName) => {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) {
        throw new errorHandler_1.OperationalError(`${fieldName} must be a valid date/time value.`, 400);
    }
    return date;
};
const normalizeString = (value, { lowerCase = false, allowNull = false } = {}) => {
    if (value === null || value === undefined) {
        return allowNull ? null : '';
    }
    const text = String(value).trim();
    if (!text.length) {
        return allowNull ? null : '';
    }
    return lowerCase ? text.toLowerCase() : text;
};
const normalizeCoupleType = (value) => {
    const normalized = (value ?? '').trim().toLowerCase();
    return normalized === 'ff' || normalized === 'mm' ? normalized : 'mf';
};
const normalizeInterestsCsv = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const sanitizeTokens = (tokens) => {
        const seen = new Set();
        const cleaned = [];
        tokens.forEach((token) => {
            const text = token.replace(/\s+/g, ' ').trim();
            if (text.length && !seen.has(text.toLowerCase())) {
                seen.add(text.toLowerCase());
                cleaned.push(text);
            }
        });
        return cleaned;
    };
    if (Array.isArray(value)) {
        const filtered = value
            .map((item) => (typeof item === 'string' ? item : null))
            .filter((item) => Boolean(item));
        const normalized = sanitizeTokens(filtered);
        return normalized.length ? normalized.join(', ') : null;
    }
    if (typeof value === 'string') {
        const tokens = value
            .split(',')
            .map((token) => token.trim())
            .filter(Boolean);
        const normalized = sanitizeTokens(tokens);
        return normalized.length ? normalized.join(', ') : null;
    }
    return null;
};
async function updateFakeUser(req, res, next) {
    const { fakeUserId } = req.params;
    if (!isGuid(fakeUserId)) {
        return next(new errorHandler_1.OperationalError('Invalid fake user identifier.', 400));
    }
    try {
        const pool = await (0, db_1.getPool)();
        const lookup = await pool
            .request()
            .input('FakeUserID', db_1.sql.UniqueIdentifier, fakeUserId)
            .query(`
        SELECT
          CAST(FakeUserID AS NVARCHAR(100)) AS FakeUserID,
          CAST(UserID AS NVARCHAR(100)) AS UserID
        FROM dbo.FakeUsers
        WHERE FakeUserID = @FakeUserID;
      `);
        const baseRecord = lookup.recordset?.[0];
        if (!baseRecord) {
            return next(new errorHandler_1.OperationalError('Fake couple not found.', 404));
        }
        const userId = String(baseRecord.UserID);
        const body = req.body ?? {};
        const email = normalizeString(body.email);
        const username = normalizeString(body.username);
        const partnerEmail = normalizeString(body.partnerEmail, { allowNull: true });
        const partner1Nickname = normalizeString(body.partner1Nickname);
        const partner2Nickname = normalizeString(body.partner2Nickname);
        const coupleType = normalizeCoupleType(normalizeString(body.coupleType, { lowerCase: true }) ?? 'mf');
        const country = normalizeString(body.country);
        const city = normalizeString(body.city, { allowNull: true });
        const membershipType = normalizeString(body.membershipType, { lowerCase: true }) ?? 'trial';
        const membershipExpiryDate = coerceDateTime(body.membershipExpiryDate, 'Membership expiry');
        const subscribedAt = coerceDateTime(body.subscribedAt, 'Subscribed at');
        const welcomeMessage = normalizeString(body.welcomeMessage, { allowNull: true });
        const bio = normalizeString(body.bio, { allowNull: true });
        const interestsCsv = normalizeInterestsCsv(body.interests ?? body.interestsCsv ?? body.InterestsCsv ?? null);
        const fakeLabel = normalizeString(body.fakeLabel, { allowNull: true }) ??
            [partner1Nickname, partner2Nickname].filter(Boolean).join(' & ');
        const fakeSegment = normalizeString(body.fakeSegment, { allowNull: true }) ?? 'europe';
        const fakeNotes = normalizeString(body.fakeNotes, { allowNull: true });
        const isActiveRaw = body.fakeIsActive ?? body.isActive;
        const isActive = Boolean(isActiveRaw === true ||
            isActiveRaw === 1 ||
            String(isActiveRaw ?? '').toLowerCase() === 'true');
        const isEmailVerified = Boolean(body.isEmailVerified ?? true);
        const isPartnerEmailVerified = Boolean(body.isPartnerEmailVerified ?? true);
        if (!email || !username || !partner1Nickname || !partner2Nickname || !country) {
            return next(new errorHandler_1.OperationalError('Missing required fields: email, username, partner nicknames, or country.', 400));
        }
        await pool
            .request()
            .input('UserID', db_1.sql.UniqueIdentifier, userId)
            .input('FakeUserID', db_1.sql.UniqueIdentifier, fakeUserId)
            .input('Email', db_1.sql.NVarChar(320), email.toLowerCase())
            .input('Username', db_1.sql.NVarChar(100), username)
            .input('PartnerEmail', db_1.sql.NVarChar(320), partnerEmail)
            .input('Partner1Nickname', db_1.sql.NVarChar(100), partner1Nickname)
            .input('Partner2Nickname', db_1.sql.NVarChar(100), partner2Nickname)
            .input('CoupleType', db_1.sql.NVarChar(10), coupleType)
            .input('Country', db_1.sql.NVarChar(100), country)
            .input('City', db_1.sql.NVarChar(100), city)
            .input('MembershipType', db_1.sql.NVarChar(30), membershipType)
            .input('MembershipExpiryDate', db_1.sql.DateTime2, membershipExpiryDate)
            .input('SubscribedAt', db_1.sql.DateTime2, subscribedAt)
            .input('WelcomeMessage', db_1.sql.NVarChar(250), welcomeMessage)
            .input('Bio', db_1.sql.NVarChar(db_1.sql.MAX), bio)
            .input('InterestsCsv', db_1.sql.NVarChar(500), interestsCsv)
            .input('IsEmailVerified', db_1.sql.Bit, isEmailVerified ? 1 : 0)
            .input('IsPartnerEmailVerified', db_1.sql.Bit, isPartnerEmailVerified ? 1 : 0)
            .input('CoupleLabel', db_1.sql.NVarChar(150), fakeLabel)
            .input('IsActive', db_1.sql.Bit, isActive ? 1 : 0)
            .input('OriginCountry', db_1.sql.NVarChar(100), country)
            .input('OriginCity', db_1.sql.NVarChar(100), city)
            .input('Segment', db_1.sql.NVarChar(50), fakeSegment)
            .input('Notes', db_1.sql.NVarChar(500), fakeNotes)
            .input('UpdatedBy', db_1.sql.NVarChar(100), 'admin-dashboard')
            .query(`
        BEGIN TRY
          BEGIN TRANSACTION;

          UPDATE dbo.Users
            SET Email = @Email,
                Username = @Username,
                PartnerEmail = @PartnerEmail,
                Partner1Nickname = @Partner1Nickname,
                Partner2Nickname = @Partner2Nickname,
                CoupleType = @CoupleType,
                Country = @Country,
                City = @City,
                MembershipType = @MembershipType,
                MembershipExpiryDate = @MembershipExpiryDate,
                SubscribedAt = @SubscribedAt,
                WelcomeMessage = @WelcomeMessage,
                Bio = @Bio,
                InterestsCsv = @InterestsCsv,
                IsOnline = CASE WHEN @IsActive = 1 THEN IsOnline ELSE 0 END,
                IsEmailVerified = @IsEmailVerified,
                IsPartnerEmailVerified = @IsPartnerEmailVerified,
                UpdatedAt = SYSUTCDATETIME()
          WHERE UserID = @UserID;

          UPDATE dbo.FakeUsers
            SET CoupleLabel = @CoupleLabel,
                MembershipPlan = @MembershipType,
                IsActive = @IsActive,
                OriginCountry = @OriginCountry,
                OriginCity = @OriginCity,
                Segment = @Segment,
                Notes = @Notes,
                UpdatedAt = SYSUTCDATETIME(),
                UpdatedBy = @UpdatedBy
          WHERE FakeUserID = @FakeUserID;

          COMMIT TRANSACTION;
        END TRY
        BEGIN CATCH
          IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
          THROW;
        END CATCH;
      `);
        const hasPhotosTable = await fetchPhotoTableFlag();
        const refreshed = await fetchFakeUserById(fakeUserId, hasPhotosTable);
        if (!refreshed) {
            return next(new errorHandler_1.OperationalError('Updated fake couple could not be loaded.', 500));
        }
        res.status(200).json({ fakeUser: refreshed });
    }
    catch (error) {
        next(error);
    }
}
async function deleteFakeUser(req, res, next) {
    const { fakeUserId } = req.params;
    if (!isGuid(fakeUserId)) {
        return next(new errorHandler_1.OperationalError('Invalid fake user identifier.', 400));
    }
    try {
        const pool = await (0, db_1.getPool)();
        const lookup = await pool
            .request()
            .input('FakeUserID', db_1.sql.UniqueIdentifier, fakeUserId)
            .query(`
        SELECT
          CAST(UserID AS NVARCHAR(100)) AS UserID
        FROM dbo.FakeUsers
        WHERE FakeUserID = @FakeUserID;
      `);
        const record = lookup.recordset?.[0];
        if (!record?.UserID) {
            return next(new errorHandler_1.OperationalError('Fake couple not found.', 404));
        }
        await (0, accountDeletionService_1.deleteUserAndAssociations)(String(record.UserID));
        res.status(200).json({ status: 'deleted' });
    }
    catch (error) {
        next(error);
    }
}
