import type { NextFunction, Request, Response } from 'express';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';

import { getPool, sql, withSqlRetry } from '../config/db';
import { OperationalError } from '../utils/errorHandler';
import {
  sendAccountDeletionCodeEmail,
  sendAccountDeletionPartnerNoticeEmail,
  sendPasswordShareEmail,
} from '../utils/emailService';
import { insertPasswordShareRecord } from '../utils/passwordShare';
import { PASSWORD_REQUIREMENTS_MESSAGE, isPasswordStrong } from '../utils/passwordPolicy';
import { fetchAdmirersForUser, fetchFavoritesOfUser } from '../services/admirerService';
import { deleteUserAndAssociations } from '../services/accountDeletionService';

const ALLOWED_FAVORITE_COLUMNS = ['FavoriteUserID', 'FavoriteID'] as const;
type FavoriteColumn = typeof ALLOWED_FAVORITE_COLUMNS[number];

type FavoriteColumnMetadata = {
  activeColumn: FavoriteColumn;
  activeType: string;
  legacyColumn?: FavoriteColumn;
  legacyType?: string;
};

const ACCOUNT_DELETION_CODE_LENGTH = 6;
const ACCOUNT_DELETION_CODE_EXPIRY_MINUTES = 30;

const quoteIdentifier = (column: FavoriteColumn): string => `[${column}]`;

const generateDeletionCode = (): string => {
  const max = 10 ** ACCOUNT_DELETION_CODE_LENGTH;
  return randomInt(0, max).toString().padStart(ACCOUNT_DELETION_CODE_LENGTH, '0');
};

const isValidGuid = (value: string): boolean => {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
};

const normalizeColumnType = (type: string | undefined | null): string => (type ?? '').toLowerCase();

async function ensureUserFavoritesStructure(pool: sql.ConnectionPool): Promise<FavoriteColumnMetadata> {
  const tableCheck = await pool.request().query(`
    SELECT 1 AS hasTable
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'UserFavorites';
  `);

  if (tableCheck.recordset.length === 0) {
    throw new OperationalError(
      'UserFavorites table is missing. Run migration 2025-10-09_create_user_favorites.sql on the database.',
      500,
    );
  }

  const columnInfo = await pool.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'UserFavorites';
  `);

  const columnTypes = new Map<string, string>(
    (columnInfo.recordset || []).map((row: any) => [
      String(row.COLUMN_NAME),
      normalizeColumnType(row.DATA_TYPE),
    ]),
  );

  if (!columnTypes.has('UserID')) {
    throw new OperationalError(
      'UserFavorites table is missing the UserID column. Validate migration 2025-10-09_create_user_favorites.sql.',
      500,
    );
  }

  const hasFavoriteUserId = columnTypes.has('FavoriteUserID');
  const hasFavoriteId = columnTypes.has('FavoriteID');

  if (!hasFavoriteUserId && !hasFavoriteId) {
    throw new OperationalError(
      'UserFavorites table must include either FavoriteUserID or FavoriteID column. Run migration 2025-10-09_create_user_favorites.sql.',
      500,
    );
  }

  const activeColumn: FavoriteColumn = hasFavoriteUserId ? 'FavoriteUserID' : 'FavoriteID';
  const legacyColumn: FavoriteColumn | undefined =
    hasFavoriteUserId && hasFavoriteId
      ? (activeColumn === 'FavoriteUserID' ? 'FavoriteID' : 'FavoriteUserID')
      : undefined;

  return {
    activeColumn,
    activeType: columnTypes.get(activeColumn) ?? 'varchar',
    legacyColumn,
    legacyType: legacyColumn ? columnTypes.get(legacyColumn) ?? 'varchar' : undefined,
  };
}

type BasicUserInfo = {
  id: string;
  email: string;
  username: string;
  partnerEmail?: string | null;
  partner1Nickname?: string | null;
  partner2Nickname?: string | null;
  zodiacSign?: string | null;
};

const loadBasicUserInfo = async (userId: string): Promise<BasicUserInfo | null> => {
  const coupleResult = await withSqlRetry((pool) =>
    pool
      .request()
      .input('UserID', sql.VarChar(255), userId)
      .query(`
        SELECT
          UserID,
          Email,
          Username,
          PartnerEmail,
          Partner1Nickname,
          Partner2Nickname,
          ZodiacSign
        FROM dbo.Users
        WHERE UserID = @UserID;
      `),
  );

  const coupleRow = coupleResult.recordset?.[0];
  if (coupleRow) {
    return {
      id: coupleRow.UserID,
      email: coupleRow.Email,
      username: coupleRow.Username,
      partnerEmail: coupleRow.PartnerEmail ?? null,
      partner1Nickname: coupleRow.Partner1Nickname ?? null,
      partner2Nickname: coupleRow.Partner2Nickname ?? null,
      zodiacSign: coupleRow.ZodiacSign ?? null,
    };
  }

  if (!isValidGuid(userId)) {
    return null;
  }

  const singleResult = await withSqlRetry((pool) =>
    pool
      .request()
      .input('SingleUserID', sql.UniqueIdentifier, userId)
      .query(`
        SELECT
          su.UserID,
          su.Email,
          su.Username,
          sp.ContactEmail,
          sp.PreferredNickname
        FROM dbo.SingleUsers su
        LEFT JOIN dbo.SingleProfiles sp ON sp.UserID = su.UserID
        WHERE su.UserID = @SingleUserID;
      `),
  );

  const singleRow = singleResult.recordset?.[0];
  if (!singleRow) {
    return null;
  }

  const primaryEmail: string | null =
    typeof singleRow.Email === 'string' && singleRow.Email.trim().length
      ? singleRow.Email.trim()
      : typeof singleRow.ContactEmail === 'string' && singleRow.ContactEmail.trim().length
        ? singleRow.ContactEmail.trim()
        : null;

  return {
    id: String(singleRow.UserID),
    email: primaryEmail ?? '',
    username:
      typeof singleRow.Username === 'string' && singleRow.Username.trim().length
        ? singleRow.Username.trim()
        : primaryEmail ?? '',
    partnerEmail: null,
    partner1Nickname:
      typeof singleRow.PreferredNickname === 'string' && singleRow.PreferredNickname.trim().length
        ? singleRow.PreferredNickname.trim()
        : null,
    partner2Nickname: null,
    zodiacSign: null,
  };
};


export async function getAllUsers(req: Request, res: Response, next: NextFunction) {
  const { currentUserId } = req.query;
  try {
    const pool = await getPool();
    const request = pool.request();

    const conditions: string[] = [
      '(fake.FakeUserID IS NULL OR ISNULL(fake.IsActive, 0) = 1)',
    ];
    if (currentUserId) {
      conditions.push('Users.UserID != @CurrentUserID');
      request.input('CurrentUserID', sql.VarChar(255), currentUserId as string);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const query = `
      SELECT Users.UserID as id,
             Users.Username as username,
             Users.Email as email,
             Users.Bio as bio,
             Users.WelcomeMessage as welcomeMessage,
             Users.Age as age,
             Users.Gender as gender,
             Users.RelationshipStatus as relationshipStatus,
             Users.YearsTogether as yearsTogether,
             Users.Partner1Age as partner1Age,
             Users.Partner2Age as partner2Age,
             Users.ViberHandle as viber,
             Users.IsViberPublic as isViberPublic,
             Users.WhatsAppHandle as whatsApp,
             Users.IsWhatsAppPublic as isWhatsAppPublic,
             Users.InstagramHandle as instagram,
             Users.IsInstagramPublic as isInstagramPublic,
             Users.FacebookHandle as facebook,
             Users.IsFacebookPublic as isFacebookPublic,
             Users.TeamsHandle as teams,
             Users.IsTeamsPublic as isTeamsPublic,
             Users.MailHandle as mail,
             Users.IsMailPublic as isMailPublic,
             Users.InterestsCsv as interestsCsv,
             Users.LanguagesCsv as languagesCsv,
             Users.LookingForCsv as lookingForCsv,
             Users.MembershipType as membershipType,
             Users.MembershipExpiryDate as membershipExpiryDate,
             Users.SubscribedAt as subscribedAt,
             Users.ProfilePictureUrl as profilePictureUrl,
             Users.CreatedAt as createdAt,
             Users.UpdatedAt as updatedAt,
             Users.IsOnline as isOnline,
             Users.City as city,
             Users.Country as country,
             Users.ZodiacSign as zodiacSign,
             Users.IsEmailVerified as isEmailVerified,
             Users.CoupleType as coupleType,
             Users.PartnerEmail as partnerEmail,
             Users.IsPartnerEmailVerified as isPartnerEmailVerified,
             Users.Partner1Nickname as partner1Nickname,
             Users.Partner2Nickname as partner2Nickname,
             Users.DisableReengagementReminders as disableReengagementReminders,
             Users.ReengagementOptOutAt as reengagementOptOutAt,
             Users.DisableVerificationReminders as disableVerificationReminders,
             Users.VerificationReminderOptOutAt as verificationReminderOptOutAt,
             (
               SELECT COUNT(*)
               FROM dbo.Photos AS p
               WHERE p.UserID = Users.UserID
                 AND p.IsPublic = 1
             ) AS publicPhotoCount
      FROM Users
      LEFT JOIN dbo.FakeUsers AS fake
        ON fake.UserID = Users.UserID
      ${whereClause};
    `;

    const result = await request.query(query);
    res.status(200).json(result.recordset);
  } catch (error) {
    next(error as Error);
  }
}

export async function getUserById(req: Request, res: Response, next: NextFunction) {
  const { userId } = req.params;
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('UserID', sql.VarChar(255), userId)
      .query(`
        SELECT Users.UserID as id,
               Users.Username as username,
               Users.Email as email,
               Users.Bio as bio,
               Users.WelcomeMessage as welcomeMessage,
               Users.Age as age,
               Users.Gender as gender,
               Users.RelationshipStatus as relationshipStatus,
               Users.YearsTogether as yearsTogether,
               Users.Partner1Age as partner1Age,
               Users.Partner2Age as partner2Age,
               Users.ViberHandle as viber,
               Users.IsViberPublic as isViberPublic,
               Users.WhatsAppHandle as whatsApp,
               Users.IsWhatsAppPublic as isWhatsAppPublic,
               Users.InstagramHandle as instagram,
               Users.IsInstagramPublic as isInstagramPublic,
               Users.FacebookHandle as facebook,
               Users.IsFacebookPublic as isFacebookPublic,
               Users.TeamsHandle as teams,
               Users.IsTeamsPublic as isTeamsPublic,
               Users.MailHandle as mail,
               Users.IsMailPublic as isMailPublic,
               Users.InterestsCsv as interestsCsv,
               Users.LanguagesCsv as languagesCsv,
               Users.LookingForCsv as lookingForCsv,
               Users.MembershipType as membershipType,
               Users.MembershipExpiryDate as membershipExpiryDate,
               Users.SubscribedAt as subscribedAt,
               Users.ProfilePictureUrl as profilePictureUrl,
               Users.CreatedAt as createdAt,
               Users.UpdatedAt as updatedAt,
               Users.IsOnline as isOnline,
               Users.City as city,
               Users.Country as country,
               Users.ZodiacSign as zodiacSign,
               Users.IsEmailVerified as isEmailVerified,
               Users.CoupleType as coupleType,
               Users.PartnerEmail as partnerEmail,
               Users.IsPartnerEmailVerified as isPartnerEmailVerified,
               Users.Partner1Nickname as partner1Nickname,
               Users.Partner2Nickname as partner2Nickname,
               Users.DisableReengagementReminders as disableReengagementReminders,
               Users.ReengagementOptOutAt as reengagementOptOutAt,
               Users.DisableVerificationReminders as disableVerificationReminders,
               Users.VerificationReminderOptOutAt as verificationReminderOptOutAt,
               (
                 SELECT COUNT(*)
                 FROM dbo.Photos AS p
                 WHERE p.UserID = Users.UserID
                   AND p.IsPublic = 1
               ) AS publicPhotoCount
        FROM Users
        LEFT JOIN dbo.FakeUsers AS fake
          ON fake.UserID = Users.UserID
        WHERE Users.UserID = @UserID
          AND (fake.FakeUserID IS NULL OR ISNULL(fake.IsActive, 0) = 1)
      `);

    if (result.recordset.length === 0) {
      const singleResult = await pool.request()
        .input('UserID', sql.VarChar(255), userId)
        .query(`
          SELECT
            CAST(su.UserID AS NVARCHAR(100)) AS id,
            su.Username,
            su.Email,
            su.IsEmailVerified,
            su.NextPaymentDueAt,
            su.CreatedAt,
            su.UpdatedAt,
            sp.ShortBio,
            sp.Interests,
            sp.PlayPreferences,
            sp.Boundaries,
            sp.PreferredNickname,
            sp.ContactEmail
          FROM dbo.SingleUsers su
          LEFT JOIN dbo.SingleProfiles sp ON sp.UserID = su.UserID
          WHERE su.UserID = @UserID;
        `);

      if (!singleResult.recordset.length) {
        return next(new OperationalError('User not found', 404));
      }

      const row = singleResult.recordset[0];
      return res.status(200).json({
        id: row.id,
        username: row.Username ?? row.PreferredNickname ?? null,
        email: row.Email,
        bio: row.ShortBio ?? null,
        welcomeMessage: null,
        age: null,
        gender: null,
        relationshipStatus: null,
        yearsTogether: null,
        partner1Age: null,
        partner2Age: null,
        viber: null,
        isViberPublic: false,
        whatsApp: null,
        isWhatsAppPublic: false,
        instagram: null,
        isInstagramPublic: false,
        facebook: null,
        isFacebookPublic: false,
        teams: null,
        isTeamsPublic: false,
        mail: row.ContactEmail ?? null,
        isMailPublic: false,
        interestsCsv: row.Interests ?? null,
        languagesCsv: null,
        lookingForCsv: null,
        membershipType: null,
        membershipExpiryDate: null,
        subscribedAt: null,
        profilePictureUrl: null,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt,
        isOnline: false,
        city: null,
        country: null,
        isEmailVerified: row.IsEmailVerified ?? true,
        coupleType: null,
        partnerEmail: null,
        isPartnerEmailVerified: true,
        partner1Nickname: row.PreferredNickname ?? row.Username ?? null,
        partner2Nickname: null,
        accountKind: 'single',
        nextPaymentDueAt: row.NextPaymentDueAt ?? null,
      });
    }

    const payload = {
      ...result.recordset[0],
      accountKind: 'couple',
    };

    res.status(200).json(payload);
  } catch (error) {
    next(error as Error);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  const { userId } = req.params;
  const updates: Record<string, unknown> = req.body ?? {};

  try {
    const pool = await getPool();
    const request = pool.request();
    const setClauses: string[] = [];
    let newPasswordPlain: string | null = null;

    const keyMapping: Record<string, { dbKey: string; type: any; length?: number | 'max' }> = {
      username: { dbKey: 'Username', type: sql.NVarChar, length: 255 },
      email: { dbKey: 'Email', type: sql.NVarChar, length: 255 },
      bio: { dbKey: 'Bio', type: sql.NVarChar, length: 'max' },
      profilePictureUrl: { dbKey: 'ProfilePictureUrl', type: sql.NVarChar, length: 'max' },
      isOnline: { dbKey: 'IsOnline', type: sql.Bit },
      city: { dbKey: 'City', type: sql.NVarChar, length: 255 },
      country: { dbKey: 'Country', type: sql.NVarChar, length: 255 },
      partner1Nickname: { dbKey: 'Partner1Nickname', type: sql.NVarChar, length: 255 },
      partner2Nickname: { dbKey: 'Partner2Nickname', type: sql.NVarChar, length: 255 },
      welcomeMessage: { dbKey: 'WelcomeMessage', type: sql.NVarChar, length: 'max' },
      age: { dbKey: 'Age', type: sql.Int },
      gender: { dbKey: 'Gender', type: sql.NVarChar, length: 50 },
      relationshipStatus: { dbKey: 'RelationshipStatus', type: sql.NVarChar, length: 50 },
      yearsTogether: { dbKey: 'YearsTogether', type: sql.Int },
      partner1Age: { dbKey: 'Partner1Age', type: sql.Int },
      partner2Age: { dbKey: 'Partner2Age', type: sql.Int },
      interestsCsv: { dbKey: 'InterestsCsv', type: sql.NVarChar, length: 'max' },
      languagesCsv: { dbKey: 'LanguagesCsv', type: sql.NVarChar, length: 255 },
      lookingForCsv: { dbKey: 'LookingForCsv', type: sql.NVarChar, length: 255 },
      viber: { dbKey: 'ViberHandle', type: sql.NVarChar, length: 255 },
      isViberPublic: { dbKey: 'IsViberPublic', type: sql.Bit },
      whatsApp: { dbKey: 'WhatsAppHandle', type: sql.NVarChar, length: 255 },
      isWhatsAppPublic: { dbKey: 'IsWhatsAppPublic', type: sql.Bit },
      instagram: { dbKey: 'InstagramHandle', type: sql.NVarChar, length: 255 },
      isInstagramPublic: { dbKey: 'IsInstagramPublic', type: sql.Bit },
      facebook: { dbKey: 'FacebookHandle', type: sql.NVarChar, length: 255 },
      isFacebookPublic: { dbKey: 'IsFacebookPublic', type: sql.Bit },
      teams: { dbKey: 'TeamsHandle', type: sql.NVarChar, length: 255 },
      isTeamsPublic: { dbKey: 'IsTeamsPublic', type: sql.Bit },
      mail: { dbKey: 'MailHandle', type: sql.NVarChar, length: 255 },
      isMailPublic: { dbKey: 'IsMailPublic', type: sql.Bit },
      isEmailVerified: { dbKey: 'IsEmailVerified', type: sql.Bit },
      membershipType: { dbKey: 'MembershipType', type: sql.NVarChar, length: 50 },
      membershipExpiryDate: { dbKey: 'MembershipExpiryDate', type: sql.DateTime2 },
      subscribedAt: { dbKey: 'SubscribedAt', type: sql.DateTime2 },
    };

    for (const key in updates) {
      if (Object.prototype.hasOwnProperty.call(updates, key) && keyMapping[key]) {
        const mapping = keyMapping[key];
        setClauses.push(`${mapping.dbKey} = @${key}`);

        const rawValue = updates[key];
        const value = rawValue === '' ? null : rawValue;
        const length = mapping.length === 'max' ? sql.MAX : mapping.length;

        if (length !== undefined) {
          request.input(key, mapping.type(length), value);
        } else {
          request.input(key, mapping.type, value);
        }
      }
    }

    if (updates.newPassword && updates.currentPassword) {
      newPasswordPlain = String(updates.newPassword);
      if (!isPasswordStrong(newPasswordPlain)) {
        return next(new OperationalError(PASSWORD_REQUIREMENTS_MESSAGE, 400));
      }
      const userResult = await pool.request()
        .input('UserID_pwd', sql.VarChar(255), userId)
        .query('SELECT PasswordHash FROM Users WHERE UserID = @UserID_pwd');

      if (userResult.recordset.length === 0) {
        return next(new OperationalError('User not found.', 404));
      }

      const { PasswordHash } = userResult.recordset[0] as { PasswordHash: string };
      const isMatch = await bcrypt.compare(updates.currentPassword as string, PasswordHash);
      if (!isMatch) {
        return next(new OperationalError('Incorrect current password.', 401));
      }

      const newPasswordHash = await bcrypt.hash(updates.newPassword as string, 10);
      setClauses.push('PasswordHash = @newPasswordHash');
      request.input('newPasswordHash', sql.NVarChar(255), newPasswordHash);
    }

    if (setClauses.length === 0) {
      return getUserById(req, res, next);
    }

    setClauses.push('UpdatedAt = GETUTCDATE()');
    request.input('UserID', sql.VarChar(255), userId);

    const query = `UPDATE Users SET ${setClauses.join(', ')} WHERE UserID = @UserID`;
    await request.query(query);

    if (newPasswordPlain) {
      try {
        const basicInfo = await loadBasicUserInfo(userId);
        if (basicInfo?.partnerEmail) {
          const { token, expiresAt } = await insertPasswordShareRecord(pool, {
            userId,
            partnerEmail: basicInfo.partnerEmail,
            password: newPasswordPlain,
          });

          const partnerDisplayName =
            basicInfo.partner1Nickname?.trim() ||
            basicInfo.partner2Nickname?.trim() ||
            basicInfo.partnerEmail;

          await sendPasswordShareEmail(basicInfo.partnerEmail, {
            partnerName: partnerDisplayName,
            initiatorName: basicInfo.username || null,
            token,
            expiresAt,
          });
        }
      } catch (notificationError) {
        console.error('[updateUser] Failed to dispatch password share email', notificationError);
      }
    }

    return getUserById(req, res, next);
  } catch (error) {
    next(error as Error);
  }
}

export async function initiateAccountDeletion(req: Request, res: Response, next: NextFunction) {
  const { userId } = req.params;
  if (!userId) {
    return next(new OperationalError('User ID is required.', 400));
  }

  try {
    const user = await loadBasicUserInfo(userId);
    if (!user) {
      return next(new OperationalError('User not found.', 404));
    }

    const code = generateDeletionCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + ACCOUNT_DELETION_CODE_EXPIRY_MINUTES * 60 * 1000);

    const normalizeEmailValue = (value: string | null | undefined): string | null => {
      if (typeof value !== 'string') {
        return null;
      }
      const trimmed = value.trim();
      return trimmed ? trimmed.toLowerCase() : null;
    };

    type PartnerKey = 'partner1' | 'partner2';
    const getEmailForKey = (key: PartnerKey): string | null =>
      key === 'partner2' ? (user.partnerEmail?.trim() || null) : (user.email?.trim() || null);
    const getNameForKey = (key: PartnerKey): string | null => {
      const fallbackFromEmail = (email: string | null | undefined): string | null => {
        if (!email || typeof email !== 'string') return null;
        const local = email.split('@')[0];
        return local ? local.trim() : null;
      };
      if (key === 'partner2') {
        return (
          user.partner2Nickname?.trim() ||
          fallbackFromEmail(user.partnerEmail) ||
          null
        );
      }
      return (
        user.partner1Nickname?.trim() ||
        user.username?.trim() ||
        fallbackFromEmail(user.email) ||
        null
      );
    };

    const normalizedInitiatorEmail = normalizeEmailValue(
      typeof req.body?.initiatorEmail === 'string' ? req.body.initiatorEmail : null,
    );
    const normalizedPrimaryEmail = normalizeEmailValue(user.email);
    const normalizedPartnerEmail = normalizeEmailValue(user.partnerEmail);

    let initiatorKey: PartnerKey = 'partner1';
    if (normalizedInitiatorEmail && normalizedPartnerEmail && normalizedInitiatorEmail === normalizedPartnerEmail) {
      initiatorKey = 'partner2';
    } else if (normalizedInitiatorEmail && normalizedPrimaryEmail && normalizedInitiatorEmail === normalizedPrimaryEmail) {
      initiatorKey = 'partner1';
    } else if (!normalizedPrimaryEmail && normalizedPartnerEmail) {
      initiatorKey = 'partner2';
    }

    let recipientKey: PartnerKey = initiatorKey === 'partner1' ? 'partner2' : 'partner1';
    let recipientEmail = getEmailForKey(recipientKey);

    if (!recipientEmail) {
      recipientKey = initiatorKey;
      recipientEmail = getEmailForKey(recipientKey);
    }

    if (!recipientEmail) {
      return next(new OperationalError('No valid email is configured to receive the verification code.', 400));
    }

    const recipientName = getNameForKey(recipientKey);
    const initiatorName = getNameForKey(initiatorKey);
    const initiatorEmailForTemplate = getEmailForKey(initiatorKey);
    const requiresPartnerShare = recipientKey !== initiatorKey;

    await withSqlRetry(async (pool) => {
      await pool.request()
        .input('UserID', sql.VarChar(255), userId)
        .query('DELETE FROM dbo.AccountDeletionRequests WHERE UserID = @UserID;');

      const normalizedPrimaryEmail =
        typeof user.email === 'string' && user.email.trim().length ? user.email.trim() : recipientEmail;
      const normalizedPartnerEmail =
        typeof user.partnerEmail === 'string' && user.partnerEmail.trim().length ? user.partnerEmail.trim() : null;

      const runInsert = async () => {
        const insertRequest = pool.request();
        insertRequest
          .input('UserID', sql.VarChar(255), user.id)
          .input('PrimaryEmail', sql.NVarChar(255), normalizedPrimaryEmail ?? null)
          .input('PartnerEmail', sql.NVarChar(255), normalizedPartnerEmail)
          .input('PrimaryCodeHash', sql.NVarChar(255), codeHash)
          .input('ExpiresAt', sql.DateTime2, expiresAt);
        await insertRequest.query(`
          INSERT INTO dbo.AccountDeletionRequests (
            RequestID, UserID, PrimaryEmail, PartnerEmail, PrimaryCodeHash, Status, ExpiresAt
          )
          VALUES (NEWID(), @UserID, @PrimaryEmail, @PartnerEmail, @PrimaryCodeHash, 'code_sent', @ExpiresAt);
        `);
      };

      try {
        await runInsert();
      } catch (error: any) {
        const sqlError = error?.originalError ?? error;
        const errorNumber = typeof sqlError?.number === 'number' ? sqlError.number : undefined;
        if (errorNumber === 547) {
          await pool.request().query(`
            IF EXISTS (
              SELECT 1
              FROM sys.foreign_keys
              WHERE name = N'FK_AccountDeletionRequests_Users'
                AND parent_object_id = OBJECT_ID(N'dbo.AccountDeletionRequests')
            )
            BEGIN
              ALTER TABLE dbo.AccountDeletionRequests
                DROP CONSTRAINT FK_AccountDeletionRequests_Users;
            END;
          `);
          await runInsert();
        } else {
          throw error;
        }
      }
    });

    await sendAccountDeletionCodeEmail({
      to: recipientEmail,
      code,
      recipientName,
      initiatorName,
      initiatorEmail: initiatorEmailForTemplate,
      requiresSharing: requiresPartnerShare,
    });

    const responseMessage = requiresPartnerShare
      ? 'A verification code has been emailed to your partner.'
      : 'A verification code has been emailed to your account email address.';

    res.status(200).json({
      message: responseMessage,
      expiresAt: expiresAt.toISOString(),
      recipientEmail,
      requiresPartnerShare,
    });
  } catch (error) {
    next(error as Error);
  }
}

export async function verifyAccountDeletionCode(req: Request, res: Response, next: NextFunction) {
  const { userId } = req.params;
  const code = String(req.body?.code ?? '').trim();

  if (!userId) {
    return next(new OperationalError('User ID is required.', 400));
  }
  if (!code) {
    return next(new OperationalError('Verification code is required.', 400));
  }

  try {
    const user = await loadBasicUserInfo(userId);
    if (!user) {
      return next(new OperationalError('User not found.', 404));
    }

    const requestResult = await withSqlRetry((pool) =>
      pool.request()
        .input('UserID', sql.VarChar(255), userId)
        .query(`
          SELECT TOP 1 RequestID, PrimaryCodeHash, Status, ExpiresAt, PartnerEmail
          FROM dbo.AccountDeletionRequests
          WHERE UserID = @UserID
          ORDER BY CreatedAt DESC;
        `),
    );

    const requestRow = requestResult.recordset?.[0];
    if (!requestRow) {
      return next(new OperationalError('No active deletion request found for this account.', 404));
    }

    const expiresAt = requestRow.ExpiresAt ? new Date(requestRow.ExpiresAt) : null;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
      return next(new OperationalError('The verification code has expired. Please start the deletion process again.', 410));
    }

    const status = String(requestRow.Status || '').toLowerCase();
    if (status === 'completed') {
      return next(new OperationalError('This deletion request has already been completed.', 410));
    }

    const codeMatches = await bcrypt.compare(code, requestRow.PrimaryCodeHash || '');
    if (!codeMatches) {
      return next(new OperationalError('The verification code is invalid. Please check your email and try again.', 401));
    }

    await withSqlRetry(async (pool) => {
      await pool.request()
        .input('RequestID', sql.UniqueIdentifier, requestRow.RequestID)
        .query(`
          UPDATE dbo.AccountDeletionRequests
          SET Status = 'primary_verified',
              PrimaryVerifiedAt = SYSUTCDATETIME()
          WHERE RequestID = @RequestID;
        `);
    });

    if (user.partnerEmail) {
      try {
        await sendAccountDeletionPartnerNoticeEmail(user.partnerEmail, user.username);
      } catch (emailError) {
        console.error('[account-deletion] Partner email failed to send.', emailError);
      }
    }

    await deleteUserAndAssociations(userId, { requestId: requestRow.RequestID ?? null });

    res.status(200).json({ status: 'deleted' });
  } catch (error) {
    next(error as Error);
  }
}

export async function getUserStats(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await withSqlRetry((pool) =>
      pool.request().query(`
        WITH UserAggregates AS (
          SELECT
            u.UserID,
            u.AccountKind,
            u.IsOnline,
            u.CreatedAt,
            singles.RequestedRole AS ActiveSingleRole,
            CASE WHEN f.FakeUserID IS NULL THEN 0 ELSE 1 END AS IsFake,
            CASE WHEN f.FakeUserID IS NOT NULL AND ISNULL(f.IsActive, 0) = 1 THEN 1 ELSE 0 END AS IsVisibleFake
          FROM dbo.Users u
          LEFT JOIN dbo.FakeUsers f
            ON f.UserID = u.UserID
          OUTER APPLY (
            SELECT TOP (1)
              si.RequestedRole
            FROM dbo.SingleInvites si
            WHERE si.InviteeUserID = u.UserID
              AND si.Status IN ('awaiting_couple', 'completed')
            ORDER BY si.CreatedAt DESC
          ) singles
        )
        SELECT
          SUM(CASE WHEN IsFake = 0 OR IsVisibleFake = 1 THEN 1 ELSE 0 END) AS totalUsers,
          SUM(CASE WHEN AccountKind = 'couple' AND (IsFake = 0 OR IsVisibleFake = 1) THEN 1 ELSE 0 END) AS totalCouples,
          SUM(CASE WHEN AccountKind = 'couple' AND IsFake = 0 THEN 1 ELSE 0 END) AS realCouples,
          SUM(CASE WHEN IsOnline = 1 AND (IsFake = 0 OR IsVisibleFake = 1) THEN 1 ELSE 0 END) AS onlineUsers,
          SUM(CASE WHEN CreatedAt >= DATEADD(DAY, -7, GETUTCDATE()) AND (IsFake = 0 OR IsVisibleFake = 1) THEN 1 ELSE 0 END) AS signupsLast7Days,
          SUM(CASE WHEN CreatedAt >= DATEADD(MONTH, -6, GETUTCDATE()) AND (IsFake = 0 OR IsVisibleFake = 1) THEN 1 ELSE 0 END) AS signupsLast6Months,
          SUM(CASE WHEN AccountKind = 'single' AND ActiveSingleRole = 'single_male' THEN 1 ELSE 0 END) AS activeBulls,
          SUM(CASE WHEN AccountKind = 'single' AND ActiveSingleRole = 'single_female' THEN 1 ELSE 0 END) AS activeUnicorns,
          (
            SELECT COALESCE(SUM(CAST(DATALENGTH(DataUrl) AS BIGINT)), 0)
            FROM dbo.Photos
          ) AS totalPhotoBytes,
          (
            SELECT COUNT(*) FROM dbo.FakeEngagementEvents
          ) AS fakeEngagementsTotal,
          (
            SELECT COUNT(*)
            FROM dbo.FakeEngagementEvents
            WHERE CreatedAt >= DATEADD(DAY, -7, SYSUTCDATETIME())
          ) AS fakeEngagements7d
        FROM UserAggregates;
      `),
    );

    const row = result.recordset?.[0] ?? {};
    const totalUsers = Number(row.totalUsers ?? 0);
    const totalCouples = Number(row.totalCouples ?? 0);
    const realCouples = Number(row.realCouples ?? 0);
    const onlineUsers = Number(row.onlineUsers ?? 0);
    const signupsLast7Days = Number(row.signupsLast7Days ?? 0);
    const signupsLast6Months = Number(row.signupsLast6Months ?? 0);
    const totalPhotoBytes = Number(row.totalPhotoBytes ?? 0);
    const activeBulls = Number(row.activeBulls ?? 0);
    const activeUnicorns = Number(row.activeUnicorns ?? 0);
    const fakeEngagementsTotal = Number(row.fakeEngagementsTotal ?? 0);
    const fakeEngagements7d = Number(row.fakeEngagements7d ?? 0);

    const avgNewUsersPerDay = Number.isFinite(signupsLast7Days)
      ? Math.round((signupsLast7Days / 7) * 100) / 100
      : 0;
    const avgNewUsersPerMonth = Number.isFinite(signupsLast6Months)
      ? Math.round((signupsLast6Months / 6) * 100) / 100
      : 0;
    const totalPhotoStorageMb = Math.round(((totalPhotoBytes / (1024 * 1024)) || 0) * 100) / 100;

    res.status(200).json({
      totalCouples,
      onlineMembers: onlineUsers,
      avgNewUsersPerDay,
      avgNewUsersPerMonth,
      totalPhotoStorageMb,
      activeBulls,
      activeUnicorns,
      fakeEngagementsTotal,
      fakeEngagements7d,
      realCouples,
    });
  } catch (error) {
    next(error as Error);
  }
}

export async function getUserFavorites(req: Request, res: Response, next: NextFunction) {
  const { userId } = req.params;
  if (!userId) {
    return next(new OperationalError('User ID is required.', 400));
  }

  try {
    const pool = await getPool();
    const favoriteMetadata = await ensureUserFavoritesStructure(pool);
    const columnSql = quoteIdentifier(favoriteMetadata.activeColumn);

    const result = await pool.request()
      .input('UserID', sql.VarChar(255), userId)
      .query(`SELECT ${columnSql} AS FavoriteUserID FROM dbo.UserFavorites WHERE UserID = @UserID ORDER BY CreatedAt DESC;`);

    const favorites = (result.recordset ?? [])
      .map((row: Record<string, unknown>) => row?.FavoriteUserID)
      .filter((value): value is string | number => value !== null && value !== undefined)
      .map((value) => String(value));

    res.status(200).json(favorites);
  } catch (error) {
    next(error as Error);
  }
}

export async function toggleFavorite(req: Request, res: Response, next: NextFunction) {
  const { userId } = req.params;
  const { favoriteUserId } = req.body ?? {};

  if (!userId) {
    return next(new OperationalError('User ID is required.', 400));
  }
  if (!favoriteUserId) {
    return next(new OperationalError('favoriteUserId is required.', 400));
  }
  if (String(userId) === String(favoriteUserId)) {
    return next(new OperationalError('You cannot favorite yourself.', 400));
  }

  try {
    const pool = await getPool();
    const favoriteMetadata = await ensureUserFavoritesStructure(pool);
    const activeColumn = favoriteMetadata.activeColumn;
    const columnSql = quoteIdentifier(activeColumn);
    const favoriteParam = activeColumn === 'FavoriteID' ? 'FavoriteID' : 'FavoriteUserID';
    const favoriteParamValue = String(favoriteUserId).trim();

    if (!favoriteParamValue) {
      return next(new OperationalError('favoriteUserId cannot be empty.', 400));
    }
    const activeType = normalizeColumnType(favoriteMetadata.activeType);
    const activeParamType =
      activeType === 'uniqueidentifier' ? sql.UniqueIdentifier : sql.VarChar(255);
    if (activeParamType === sql.UniqueIdentifier && !isValidGuid(favoriteParamValue)) {
      return next(new OperationalError('favoriteUserId must be a valid GUID.', 400));
    }

    const legacyColumn = favoriteMetadata.legacyColumn;
    const legacyParamName = legacyColumn
      ? legacyColumn === 'FavoriteID'
        ? 'LegacyFavoriteID'
        : 'LegacyFavoriteUserID'
      : null;
    const legacyType = normalizeColumnType(favoriteMetadata.legacyType);
    const legacyParamType =
      legacyColumn && legacyType === 'uniqueidentifier' ? sql.UniqueIdentifier : sql.VarChar(255);
    if (legacyColumn && legacyParamType === sql.UniqueIdentifier && !isValidGuid(favoriteParamValue)) {
      return next(new OperationalError('favoriteUserId must be a valid GUID.', 400));
    }

    const bindFavoriteParams = (
      requestBuilder: sql.Request,
      includeLegacyParam: boolean,
    ) => {
      let builder = requestBuilder.input('UserID', sql.VarChar(255), userId);
      builder = builder.input(favoriteParam, activeParamType, favoriteParamValue);
      if (includeLegacyParam && legacyColumn && legacyParamName) {
        builder = builder.input(
          legacyParamName,
          legacyParamType,
          favoriteParamValue,
        );
      }
      return builder;
    };

    const check = await bindFavoriteParams(pool.request(), false)
      .query(`SELECT COUNT(*) AS C FROM dbo.UserFavorites WHERE UserID = @UserID AND ${columnSql} = @${favoriteParam};`);

    const alreadyFavorite = Number(check.recordset?.[0]?.C ?? 0) > 0;

    if (alreadyFavorite) {
      await bindFavoriteParams(pool.request(), false)
        .query(`DELETE FROM dbo.UserFavorites WHERE UserID = @UserID AND ${columnSql} = @${favoriteParam};`);

      return res.status(200).json({ isFavorite: false });
    }

    try {
      const insertColumns = ['UserID', columnSql];
      const insertValues = ['@UserID', `@${favoriteParam}`];
      if (legacyColumn && legacyParamName) {
        insertColumns.push(quoteIdentifier(legacyColumn));
        insertValues.push(`@${legacyParamName}`);
      }
      const insertQuery = `
        INSERT INTO dbo.UserFavorites (${insertColumns.join(', ')})
        VALUES (${insertValues.join(', ')});
      `;

      await bindFavoriteParams(pool.request(), Boolean(legacyColumn))
        .query(insertQuery);
    } catch (error) {
      if ((error as { number?: number; message?: string })?.number === 547 ||
        String((error as { message?: string })?.message ?? '').toLowerCase().includes('foreign key')) {
        return next(new OperationalError('User not found.', 404));
      }
      throw error;
    }

    return res.status(200).json({ isFavorite: true });
  } catch (error) {
    next(error as Error);
  }
}

export async function getUserAdmirers(req: Request, res: Response, next: NextFunction) {
  const { userId } = req.params;
  if (!userId) {
    return next(new OperationalError('User ID is required.', 400));
  }

  try {
    const admirers = await fetchAdmirersForUser(String(userId));
    const sanitized = admirers.map((item) => ({
      userId: item.userId,
      username: item.username,
      displayName: item.displayName,
      profilePictureUrl: item.profilePictureUrl,
      membershipType: item.membershipType,
      city: item.city,
      country: item.country,
      bio: item.bio,
      coupleType: item.coupleType,
      since: item.createdAt,
      isOnline: item.isOnline,
    }));
    res.status(200).json(sanitized);
  } catch (error) {
    if (error instanceof OperationalError && /UserFavorites table/i.test(error.message ?? '')) {
      return res.status(200).json([]);
    }
    next(error as Error);
  }
}

export async function getUserFavoriteSummaries(req: Request, res: Response, next: NextFunction) {
  const { userId } = req.params;
  if (!userId) {
    return next(new OperationalError('User ID is required.', 400));
  }

  try {
    const favorites = await fetchFavoritesOfUser(String(userId));
    const sanitized = favorites.map((item) => ({
      userId: item.userId,
      username: item.username,
      displayName: item.displayName,
      profilePictureUrl: item.profilePictureUrl,
      membershipType: item.membershipType,
      city: item.city,
      country: item.country,
      bio: item.bio,
      coupleType: item.coupleType,
      since: item.createdAt,
      isOnline: item.isOnline,
    }));
    res.status(200).json(sanitized);
  } catch (error) {
    if (error instanceof OperationalError && /UserFavorites table/i.test(error.message ?? '')) {
      return res.status(200).json([]);
    }
    next(error as Error);
  }
}

