import type { NextFunction, Request, Response } from 'express';
import { getPool, sql } from '../config/db';
import { OperationalError } from '../utils/errorHandler';
import { deleteUserAndAssociations } from '../services/accountDeletionService';

type RawRecord = Record<string, unknown>;

const isGuid = (value: string | null | undefined): boolean =>
  typeof value === 'string' &&
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string' || value instanceof String
        ? new Date(value as string)
        : null;
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
};

const buildPhotoCountExpression = (hasPhotosTable: boolean): string =>
  hasPhotosTable
    ? '(SELECT COUNT(*) FROM dbo.Photos p WHERE p.UserID = f.UserID)'
    : '0';

const mapFakeUserRow = (row: RawRecord) => {
  const getString = (key: string): string | null => {
    const value = row[key];
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length ? text : null;
  };

  const getBoolean = (key: string): boolean =>
    Boolean(
      row[key] === true ||
        row[key] === 1 ||
        row[key] === '1' ||
        String(row[key] ?? '').toLowerCase() === 'true',
    );

  const getNumber = (key: string): number => {
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

const fetchPhotoTableFlag = async (): Promise<boolean> => {
  const pool = await getPool();
  const result = await pool
    .request()
    .query(
      `SELECT CASE WHEN OBJECT_ID(N'dbo.Photos', N'U') IS NULL THEN 0 ELSE 1 END AS ExistsFlag;`,
    );
  return Boolean(result.recordset?.[0]?.ExistsFlag);
};

const fetchFakeUserById = async (
  fakeUserId: string,
  hasPhotosTable: boolean,
): Promise<Record<string, unknown> | null> => {
  const pool = await getPool();
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
    .input('FakeUserID', sql.UniqueIdentifier, fakeUserId)
    .query(query);
  const record = result.recordset?.[0];
  return record ? mapFakeUserRow(record) : null;
};

export async function listFakeUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const hasPhotosTable = await fetchPhotoTableFlag();
    const pool = await getPool();
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
  } catch (error) {
    next(error as Error);
  }
}

const coerceDateTime = (value: unknown, fieldName: string): Date | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new OperationalError(`${fieldName} must be a valid date/time value.`, 400);
  }
  return date;
};

const normalizeString = (
  value: unknown,
  { lowerCase = false, allowNull = false }: { lowerCase?: boolean; allowNull?: boolean } = {},
): string | null => {
  if (value === null || value === undefined) {
    return allowNull ? null : '';
  }
  const text = String(value).trim();
  if (!text.length) {
    return allowNull ? null : '';
  }
  return lowerCase ? text.toLowerCase() : text;
};

const normalizeCoupleType = (value: string | null): string => {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized === 'ff' || normalized === 'mm' ? normalized : 'mf';
};

const normalizeInterestsCsv = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const sanitizeTokens = (tokens: string[]): string[] => {
    const seen = new Set<string>();
    const cleaned: string[] = [];
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
      .filter((item): item is string => Boolean(item));
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

export async function updateFakeUser(req: Request, res: Response, next: NextFunction) {
  const { fakeUserId } = req.params;
  if (!isGuid(fakeUserId)) {
    return next(new OperationalError('Invalid fake user identifier.', 400));
  }

  try {
    const pool = await getPool();
    const lookup = await pool
      .request()
      .input('FakeUserID', sql.UniqueIdentifier, fakeUserId)
      .query(`
        SELECT
          CAST(FakeUserID AS NVARCHAR(100)) AS FakeUserID,
          CAST(UserID AS NVARCHAR(100)) AS UserID
        FROM dbo.FakeUsers
        WHERE FakeUserID = @FakeUserID;
      `);

    const baseRecord = lookup.recordset?.[0];
    if (!baseRecord) {
      return next(new OperationalError('Fake couple not found.', 404));
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
    const interestsCsv = normalizeInterestsCsv(
      body.interests ?? body.interestsCsv ?? body.InterestsCsv ?? null,
    );
    const fakeLabel =
      normalizeString(body.fakeLabel, { allowNull: true }) ??
      [partner1Nickname, partner2Nickname].filter(Boolean).join(' & ');
    const fakeSegment = normalizeString(body.fakeSegment, { allowNull: true }) ?? 'europe';
    const fakeNotes = normalizeString(body.fakeNotes, { allowNull: true });
    const isActiveRaw = body.fakeIsActive ?? body.isActive;
    const isActive = Boolean(
      isActiveRaw === true ||
        isActiveRaw === 1 ||
        String(isActiveRaw ?? '').toLowerCase() === 'true',
    );
    const isEmailVerified = Boolean(body.isEmailVerified ?? true);
    const isPartnerEmailVerified = Boolean(body.isPartnerEmailVerified ?? true);

    if (!email || !username || !partner1Nickname || !partner2Nickname || !country) {
      return next(
        new OperationalError(
          'Missing required fields: email, username, partner nicknames, or country.',
          400,
        ),
      );
    }

    await pool
      .request()
      .input('UserID', sql.UniqueIdentifier, userId)
      .input('FakeUserID', sql.UniqueIdentifier, fakeUserId)
      .input('Email', sql.NVarChar(320), email.toLowerCase())
      .input('Username', sql.NVarChar(100), username)
      .input('PartnerEmail', sql.NVarChar(320), partnerEmail)
      .input('Partner1Nickname', sql.NVarChar(100), partner1Nickname)
      .input('Partner2Nickname', sql.NVarChar(100), partner2Nickname)
      .input('CoupleType', sql.NVarChar(10), coupleType)
      .input('Country', sql.NVarChar(100), country)
      .input('City', sql.NVarChar(100), city)
      .input('MembershipType', sql.NVarChar(30), membershipType)
      .input('MembershipExpiryDate', sql.DateTime2, membershipExpiryDate)
      .input('SubscribedAt', sql.DateTime2, subscribedAt)
      .input('WelcomeMessage', sql.NVarChar(250), welcomeMessage)
      .input('Bio', sql.NVarChar(sql.MAX), bio)
      .input('InterestsCsv', sql.NVarChar(500), interestsCsv)
      .input('IsEmailVerified', sql.Bit, isEmailVerified ? 1 : 0)
      .input('IsPartnerEmailVerified', sql.Bit, isPartnerEmailVerified ? 1 : 0)
      .input('CoupleLabel', sql.NVarChar(150), fakeLabel)
      .input('IsActive', sql.Bit, isActive ? 1 : 0)
      .input('OriginCountry', sql.NVarChar(100), country)
      .input('OriginCity', sql.NVarChar(100), city)
      .input('Segment', sql.NVarChar(50), fakeSegment)
      .input('Notes', sql.NVarChar(500), fakeNotes)
      .input('UpdatedBy', sql.NVarChar(100), 'admin-dashboard')
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
      return next(new OperationalError('Updated fake couple could not be loaded.', 500));
    }

    res.status(200).json({ fakeUser: refreshed });
  } catch (error) {
    next(error as Error);
  }
}

export async function deleteFakeUser(req: Request, res: Response, next: NextFunction) {
  const { fakeUserId } = req.params;
  if (!isGuid(fakeUserId)) {
    return next(new OperationalError('Invalid fake user identifier.', 400));
  }

  try {
    const pool = await getPool();
    const lookup = await pool
      .request()
      .input('FakeUserID', sql.UniqueIdentifier, fakeUserId)
      .query(`
        SELECT
          CAST(UserID AS NVARCHAR(100)) AS UserID
        FROM dbo.FakeUsers
        WHERE FakeUserID = @FakeUserID;
      `);

    const record = lookup.recordset?.[0];
    if (!record?.UserID) {
      return next(new OperationalError('Fake couple not found.', 404));
    }

    await deleteUserAndAssociations(String(record.UserID));
    res.status(200).json({ status: 'deleted' });
  } catch (error) {
    next(error as Error);
  }
}
