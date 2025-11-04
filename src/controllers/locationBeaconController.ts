import type { NextFunction, Request, Response } from 'express';
import { sql, withSqlRetry } from '../config/db';
import { OperationalError } from '../utils/errorHandler';
import { notifyAdmirersOfEvent } from '../services/admirerService';

const BEACON_LIFETIME_HOURS = 8;
const MAX_MESSAGE_LENGTH = 280;
const VISIBILITY_OPTIONS = new Set(['public', 'favorites', 'verified']);

type BeaconRow = {
  BeaconID: string;
  UserID: string;
  Latitude: number;
  Longitude: number;
  Message: string | null;
  Visibility: string;
  CreatedAt: Date;
  ExpiresAt: Date;
  RevokedAt: Date | null;
};

const mapBeaconRow = (row: BeaconRow | undefined | null) => {
  if (!row) return null;
  return {
    beaconId: row.BeaconID,
    userId: row.UserID,
    latitude: Number(row.Latitude),
    longitude: Number(row.Longitude),
    message: row.Message ?? null,
    visibility: row.Visibility,
    createdAt: row.CreatedAt?.toISOString?.() ?? row.CreatedAt,
    expiresAt: row.ExpiresAt?.toISOString?.() ?? row.ExpiresAt,
    revokedAt: row.RevokedAt ? row.RevokedAt.toISOString?.() ?? row.RevokedAt : null,
  };
};

const parseLatitude = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < -90 || parsed > 90) {
    throw new OperationalError('Latitude must be between -90 and 90.', 400);
  }
  return parsed;
};

const parseLongitude = (value: unknown): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < -180 || parsed > 180) {
    throw new OperationalError('Longitude must be between -180 and 180.', 400);
  }
  return parsed;
};

const normalizeMessage = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text.length) return null;
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new OperationalError(`Message must be at most ${MAX_MESSAGE_LENGTH} characters.`, 400);
  }
  return text;
};

const normalizeVisibility = (value: unknown): string => {
  const text = String(value ?? 'public').trim().toLowerCase();
  if (!VISIBILITY_OPTIONS.has(text)) {
    throw new OperationalError('visibility must be one of: public, favorites, verified.', 400);
  }
  return text;
};

export async function getLocationBeacon(req: Request, res: Response, next: NextFunction) {
  const { userId } = req.params;
  if (!userId) {
    return next(new OperationalError('User ID is required.', 400));
  }

  try {
    const result = await withSqlRetry((pool) =>
      pool.request()
        .input('UserID', sql.VarChar(255), userId)
        .query<BeaconRow>(`
          SELECT TOP (1)
            BeaconID, UserID, Latitude, Longitude, Message, Visibility, CreatedAt, ExpiresAt, RevokedAt
          FROM dbo.UserLocationBeacons
          WHERE UserID = @UserID
            AND RevokedAt IS NULL
            AND ExpiresAt > SYSUTCDATETIME()
          ORDER BY CreatedAt DESC;
        `),
    );

    const beacon = mapBeaconRow(result.recordset?.[0] ?? null);
    return res.status(200).json(beacon);
  } catch (error) {
    return next(error as Error);
  }
}

export async function upsertLocationBeacon(req: Request, res: Response, next: NextFunction) {
  const { userId } = req.params;
  if (!userId) {
    return next(new OperationalError('User ID is required.', 400));
  }

  try {
    const latitude = parseLatitude(req.body?.latitude);
    const longitude = parseLongitude(req.body?.longitude);
    const message = normalizeMessage(req.body?.message);
    const visibility = normalizeVisibility(req.body?.visibility);
    const expiresAt = new Date(Date.now() + BEACON_LIFETIME_HOURS * 60 * 60 * 1000);

    await withSqlRetry(async (pool) => {
      const request = pool.request();
      request.input('UserID', sql.VarChar(255), userId);
      request.input('Latitude', sql.Decimal(9, 6), latitude);
      request.input('Longitude', sql.Decimal(9, 6), longitude);
      request.input('Message', sql.NVarChar(MAX_MESSAGE_LENGTH), message);
      request.input('Visibility', sql.VarChar(20), visibility);
      request.input('ExpiresAt', sql.DateTime2, expiresAt);
      await request.batch(`
        SET NOCOUNT ON;
        DECLARE @now DATETIME2(7) = SYSUTCDATETIME();

        UPDATE dbo.UserLocationBeacons
          SET RevokedAt = @now
        WHERE UserID = @UserID AND RevokedAt IS NULL;

        INSERT INTO dbo.UserLocationBeacons (BeaconID, UserID, Latitude, Longitude, Message, Visibility, CreatedAt, ExpiresAt)
        VALUES (NEWID(), @UserID, @Latitude, @Longitude, @Message, @Visibility, @now, @ExpiresAt);
      `);
    });

    const fetchResult = await withSqlRetry((pool) =>
      pool.request()
        .input('UserID', sql.VarChar(255), userId)
        .query<BeaconRow>(`
          SELECT TOP (1)
            BeaconID, UserID, Latitude, Longitude, Message, Visibility, CreatedAt, ExpiresAt, RevokedAt
          FROM dbo.UserLocationBeacons
          WHERE UserID = @UserID AND RevokedAt IS NULL
          ORDER BY CreatedAt DESC;
        `),
    );

    const beacon = mapBeaconRow(fetchResult.recordset?.[0] ?? null);
    res.status(201).json(beacon);

    void notifyAdmirersOfEvent(userId, {
      type: 'location_share',
      message,
    });
    return;
  } catch (error) {
    return next(error as Error);
  }
}

export async function revokeLocationBeacon(req: Request, res: Response, next: NextFunction) {
  const { userId } = req.params;
  if (!userId) {
    return next(new OperationalError('User ID is required.', 400));
  }

  try {
    const result = await withSqlRetry((pool) =>
      pool.request()
        .input('UserID', sql.VarChar(255), userId)
        .query(`
          UPDATE dbo.UserLocationBeacons
            SET RevokedAt = SYSUTCDATETIME()
          WHERE UserID = @UserID AND RevokedAt IS NULL;
        `),
    );

    const affected = result.rowsAffected?.[0] ?? 0;
    if (affected === 0) {
      return res.status(204).send();
    }

    return res.status(204).send();
  } catch (error) {
    return next(error as Error);
  }
}

type PublicBeaconRow = BeaconRow & {
  Username: string;
  ProfilePictureUrl: string | null;
  City: string | null;
  Country: string | null;
  MembershipType: string | null;
  CoupleType: string | null;
  Partner1Nickname: string | null;
  Partner2Nickname: string | null;
};

const sanitizeLimit = (value: unknown, fallback = 100, max = 200) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 1), max);
};

export async function listPublicLocationBeacons(req: Request, res: Response, next: NextFunction) {
  const limit = sanitizeLimit(req.query?.limit);

  try {
    const result = await withSqlRetry((pool) =>
      pool
        .request()
        .input('Limit', sql.Int, limit)
        .query<PublicBeaconRow>(`
          SELECT TOP (@Limit)
            b.BeaconID,
            b.UserID,
            b.Latitude,
            b.Longitude,
            b.Message,
            b.Visibility,
            b.CreatedAt,
            b.ExpiresAt,
            b.RevokedAt,
            u.Username,
            u.ProfilePictureUrl,
            u.City,
            u.Country,
            u.MembershipType,
            u.CoupleType,
            u.Partner1Nickname,
            u.Partner2Nickname
          FROM dbo.UserLocationBeacons AS b
          INNER JOIN dbo.Users AS u ON u.UserID = b.UserID
          WHERE b.Visibility = 'public'
            AND b.RevokedAt IS NULL
            AND b.ExpiresAt > SYSUTCDATETIME()
          ORDER BY b.CreatedAt DESC;
        `),
    );

    const items = (result.recordset ?? []).map((row) => {
      const beacon = mapBeaconRow(row);
      const displayName =
        row.Partner1Nickname ??
        row.Partner2Nickname ??
        null;

      return {
        beacon,
        user: {
          id: row.UserID,
          username: row.Username,
          displayName,
          profilePictureUrl: row.ProfilePictureUrl ?? null,
          city: row.City ?? null,
          country: row.Country ?? null,
          membershipType: row.MembershipType ?? null,
          coupleType: row.CoupleType ?? null,
        },
      };
    });

    return res.status(200).json({ items });
  } catch (error) {
    return next(error as Error);
  }
}
