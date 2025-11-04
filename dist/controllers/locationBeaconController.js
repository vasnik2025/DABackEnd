"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocationBeacon = getLocationBeacon;
exports.upsertLocationBeacon = upsertLocationBeacon;
exports.revokeLocationBeacon = revokeLocationBeacon;
exports.listPublicLocationBeacons = listPublicLocationBeacons;
const db_1 = require("../config/db");
const errorHandler_1 = require("../utils/errorHandler");
const admirerService_1 = require("../services/admirerService");
const BEACON_LIFETIME_HOURS = 8;
const MAX_MESSAGE_LENGTH = 280;
const VISIBILITY_OPTIONS = new Set(['public', 'favorites', 'verified']);
const mapBeaconRow = (row) => {
    if (!row)
        return null;
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
const parseLatitude = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < -90 || parsed > 90) {
        throw new errorHandler_1.OperationalError('Latitude must be between -90 and 90.', 400);
    }
    return parsed;
};
const parseLongitude = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < -180 || parsed > 180) {
        throw new errorHandler_1.OperationalError('Longitude must be between -180 and 180.', 400);
    }
    return parsed;
};
const normalizeMessage = (value) => {
    if (value === undefined || value === null)
        return null;
    const text = String(value).trim();
    if (!text.length)
        return null;
    if (text.length > MAX_MESSAGE_LENGTH) {
        throw new errorHandler_1.OperationalError(`Message must be at most ${MAX_MESSAGE_LENGTH} characters.`, 400);
    }
    return text;
};
const normalizeVisibility = (value) => {
    const text = String(value ?? 'public').trim().toLowerCase();
    if (!VISIBILITY_OPTIONS.has(text)) {
        throw new errorHandler_1.OperationalError('visibility must be one of: public, favorites, verified.', 400);
    }
    return text;
};
async function getLocationBeacon(req, res, next) {
    const { userId } = req.params;
    if (!userId) {
        return next(new errorHandler_1.OperationalError('User ID is required.', 400));
    }
    try {
        const result = await (0, db_1.withSqlRetry)((pool) => pool.request()
            .input('UserID', db_1.sql.VarChar(255), userId)
            .query(`
          SELECT TOP (1)
            BeaconID, UserID, Latitude, Longitude, Message, Visibility, CreatedAt, ExpiresAt, RevokedAt
          FROM dbo.UserLocationBeacons
          WHERE UserID = @UserID
            AND RevokedAt IS NULL
            AND ExpiresAt > SYSUTCDATETIME()
          ORDER BY CreatedAt DESC;
        `));
        const beacon = mapBeaconRow(result.recordset?.[0] ?? null);
        return res.status(200).json(beacon);
    }
    catch (error) {
        return next(error);
    }
}
async function upsertLocationBeacon(req, res, next) {
    const { userId } = req.params;
    if (!userId) {
        return next(new errorHandler_1.OperationalError('User ID is required.', 400));
    }
    try {
        const latitude = parseLatitude(req.body?.latitude);
        const longitude = parseLongitude(req.body?.longitude);
        const message = normalizeMessage(req.body?.message);
        const visibility = normalizeVisibility(req.body?.visibility);
        const expiresAt = new Date(Date.now() + BEACON_LIFETIME_HOURS * 60 * 60 * 1000);
        await (0, db_1.withSqlRetry)(async (pool) => {
            const request = pool.request();
            request.input('UserID', db_1.sql.VarChar(255), userId);
            request.input('Latitude', db_1.sql.Decimal(9, 6), latitude);
            request.input('Longitude', db_1.sql.Decimal(9, 6), longitude);
            request.input('Message', db_1.sql.NVarChar(MAX_MESSAGE_LENGTH), message);
            request.input('Visibility', db_1.sql.VarChar(20), visibility);
            request.input('ExpiresAt', db_1.sql.DateTime2, expiresAt);
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
        const fetchResult = await (0, db_1.withSqlRetry)((pool) => pool.request()
            .input('UserID', db_1.sql.VarChar(255), userId)
            .query(`
          SELECT TOP (1)
            BeaconID, UserID, Latitude, Longitude, Message, Visibility, CreatedAt, ExpiresAt, RevokedAt
          FROM dbo.UserLocationBeacons
          WHERE UserID = @UserID AND RevokedAt IS NULL
          ORDER BY CreatedAt DESC;
        `));
        const beacon = mapBeaconRow(fetchResult.recordset?.[0] ?? null);
        res.status(201).json(beacon);
        void (0, admirerService_1.notifyAdmirersOfEvent)(userId, {
            type: 'location_share',
            message,
        });
        return;
    }
    catch (error) {
        return next(error);
    }
}
async function revokeLocationBeacon(req, res, next) {
    const { userId } = req.params;
    if (!userId) {
        return next(new errorHandler_1.OperationalError('User ID is required.', 400));
    }
    try {
        const result = await (0, db_1.withSqlRetry)((pool) => pool.request()
            .input('UserID', db_1.sql.VarChar(255), userId)
            .query(`
          UPDATE dbo.UserLocationBeacons
            SET RevokedAt = SYSUTCDATETIME()
          WHERE UserID = @UserID AND RevokedAt IS NULL;
        `));
        const affected = result.rowsAffected?.[0] ?? 0;
        if (affected === 0) {
            return res.status(204).send();
        }
        return res.status(204).send();
    }
    catch (error) {
        return next(error);
    }
}
const sanitizeLimit = (value, fallback = 100, max = 200) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return fallback;
    return Math.min(Math.max(Math.floor(parsed), 1), max);
};
async function listPublicLocationBeacons(req, res, next) {
    const limit = sanitizeLimit(req.query?.limit);
    try {
        const result = await (0, db_1.withSqlRetry)((pool) => pool
            .request()
            .input('Limit', db_1.sql.Int, limit)
            .query(`
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
        `));
        const items = (result.recordset ?? []).map((row) => {
            const beacon = mapBeaconRow(row);
            const displayName = row.Partner1Nickname ??
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
    }
    catch (error) {
        return next(error);
    }
}
