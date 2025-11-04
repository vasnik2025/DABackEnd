"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAdmirersForUser = fetchAdmirersForUser;
exports.fetchFavoritesOfUser = fetchFavoritesOfUser;
exports.notifyAdmirersOfEvent = notifyAdmirersOfEvent;
const db_1 = require("../config/db");
const errorHandler_1 = require("../utils/errorHandler");
const emailService_1 = require("../utils/emailService");
const FAVORITE_COLUMN_CANDIDATES = ['FavoriteUserID', 'FavoriteID'];
async function resolveFavoriteColumn(pool) {
    const resolvedPool = pool ?? (await (0, db_1.getPool)());
    const result = await resolvedPool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'UserFavorites'
      AND COLUMN_NAME IN ('FavoriteUserID', 'FavoriteID');
  `);
    const columnName = result.recordset?.[0]?.COLUMN_NAME;
    if (!columnName) {
        throw new errorHandler_1.OperationalError(`UserFavorites table is missing ${FAVORITE_COLUMN_CANDIDATES.join(' / ')} column. Run migration 2025-10-09_create_user_favorites.sql.`, 500);
    }
    return columnName;
}
const mapAdmirerRow = (row) => ({
    userId: String(row.AdmirerID),
    email: row.Email ?? null,
    username: row.Username ?? null,
    displayName: row.DisplayName ?? null,
    profilePictureUrl: row.ProfilePictureUrl ?? null,
    membershipType: row.MembershipType ?? null,
    city: row.City ?? null,
    country: row.Country ?? null,
    bio: row.Bio ?? null,
    coupleType: row.CoupleType ?? null,
    createdAt: row.CreatedAt ?? null,
    isOnline: row.IsOnline === null || row.IsOnline === undefined ? null : row.IsOnline === 1 || row.IsOnline === true,
});
const mapFavoriteRow = (row) => ({
    userId: String(row.UserID),
    email: row.Email ?? null,
    username: row.Username ?? null,
    displayName: row.DisplayName ?? null,
    profilePictureUrl: row.ProfilePictureUrl ?? null,
    membershipType: row.MembershipType ?? null,
    city: row.City ?? null,
    country: row.Country ?? null,
    bio: row.Bio ?? null,
    coupleType: row.CoupleType ?? null,
    createdAt: row.CreatedAt ?? null,
    isOnline: row.IsOnline === null || row.IsOnline === undefined ? null : row.IsOnline === 1 || row.IsOnline === true,
});
async function fetchAdmirersForUser(userId) {
    if (!userId)
        return [];
    try {
        return await (0, db_1.withSqlRetry)(async (pool) => {
            const favoriteColumn = await resolveFavoriteColumn(pool);
            const columnSql = `[${favoriteColumn}]`;
            const userColumnsResult = await pool.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME = 'Users';
      `);
            const userColumns = new Set((userColumnsResult.recordset ?? []).map((row) => row.COLUMN_NAME?.toLowerCase?.() ?? ''));
            const hasDisplayName = userColumns.has('displayname');
            const hasBio = userColumns.has('bio');
            const hasCoupleType = userColumns.has('coupletype');
            const selectClauses = [
                'CAST(uf.UserID AS NVARCHAR(255)) AS AdmirerID',
                'u.Email',
                'u.Username',
                hasDisplayName ? 'u.DisplayName' : 'NULL AS DisplayName',
                'u.ProfilePictureUrl',
                'u.MembershipType',
                'u.City',
                'u.Country',
                hasBio ? 'u.Bio' : 'NULL AS Bio',
                hasCoupleType ? 'u.CoupleType' : 'NULL AS CoupleType',
                'uf.CreatedAt',
                'u.IsOnline',
            ];
            const admirersQuery = `
        SELECT
          ${selectClauses.join(',\n          ')}
        FROM dbo.UserFavorites uf
        JOIN dbo.Users u ON u.UserID = uf.UserID
        WHERE ${columnSql} = TRY_CONVERT(UNIQUEIDENTIFIER, @TargetUserID)
           OR ${columnSql} = @TargetUserID
        ORDER BY uf.CreatedAt DESC;
      `;
            const result = await pool.request()
                .input('TargetUserID', db_1.sql.VarChar(255), userId)
                .query(admirersQuery);
            return (result.recordset ?? []).map(mapAdmirerRow);
        });
    }
    catch (error) {
        console.error('[admirerService] fetchAdmirersForUser failed:', error);
        return [];
    }
}
async function fetchFavoritesOfUser(userId) {
    if (!userId)
        return [];
    try {
        return await (0, db_1.withSqlRetry)(async (pool) => {
            const favoriteColumn = await resolveFavoriteColumn(pool);
            const columnSql = `[${favoriteColumn}]`;
            const userColumnsResult = await pool.request().query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME = 'Users';
      `);
            const userColumns = new Set((userColumnsResult.recordset ?? []).map((row) => row.COLUMN_NAME?.toLowerCase?.() ?? ''));
            const hasDisplayName = userColumns.has('displayname');
            const hasBio = userColumns.has('bio');
            const hasCoupleType = userColumns.has('coupletype');
            const selectClauses = [
                `CAST(${columnSql} AS NVARCHAR(255)) AS UserID`,
                'u.Email',
                'u.Username',
                hasDisplayName ? 'u.DisplayName' : 'NULL AS DisplayName',
                'u.ProfilePictureUrl',
                'u.MembershipType',
                'u.City',
                'u.Country',
                hasBio ? 'u.Bio' : 'NULL AS Bio',
                hasCoupleType ? 'u.CoupleType' : 'NULL AS CoupleType',
                'uf.CreatedAt',
                'u.IsOnline',
            ];
            const favoritesQuery = `
        SELECT
          ${selectClauses.join(',\n          ')}
        FROM dbo.UserFavorites uf
        JOIN dbo.Users u
          ON CAST(u.UserID AS NVARCHAR(255)) = CAST(${columnSql} AS NVARCHAR(255))
        WHERE CAST(uf.UserID AS NVARCHAR(255)) = CAST(@SourceUserID AS NVARCHAR(255))
        ORDER BY uf.CreatedAt DESC;
      `;
            const result = await pool.request()
                .input('SourceUserID', db_1.sql.VarChar(255), userId)
                .query(favoritesQuery);
            return (result.recordset ?? []).map(mapFavoriteRow);
        });
    }
    catch (error) {
        console.error('[admirerService] fetchFavoritesOfUser failed:', error);
        return [];
    }
}
async function fetchUserDisplayDetails(userId) {
    if (!userId)
        return null;
    let row;
    try {
        const result = await (0, db_1.withSqlRetry)((pool) => pool.request()
            .input('UserID', db_1.sql.VarChar(255), userId)
            .query(`
          SELECT TOP (1)
            Username,
            DisplayName
          FROM dbo.Users
          WHERE UserID = @UserID;
        `));
        row = result.recordset?.[0];
    }
    catch (error) {
        const message = String(error?.message ?? '').toLowerCase();
        if (message.includes('invalid column name') && message.includes('displayname')) {
            const fallback = await (0, db_1.withSqlRetry)((pool) => pool.request()
                .input('UserID', db_1.sql.VarChar(255), userId)
                .query(`
            SELECT TOP (1)
              Username
            FROM dbo.Users
            WHERE UserID = @UserID;
          `));
            row = fallback.recordset?.[0];
        }
        else {
            throw error;
        }
    }
    if (!row)
        return null;
    const username = row.DisplayName ?? row.Username ?? 'member';
    const frontendBase = (process.env.FRONTEND_URL || 'https://DateAstrum.com').replace(/\/$/, '');
    return {
        username: String(username),
        profileUrl: `${frontendBase}/#/profile`,
    };
}
async function notifyAdmirersOfEvent(userId, event) {
    if (!userId)
        return;
    try {
        const [owner, admirers] = await Promise.all([
            fetchUserDisplayDetails(userId),
            fetchAdmirersForUser(userId),
        ]);
        if (!admirers.length || !owner)
            return;
        const recipients = admirers.filter((admirer) => admirer.email);
        if (!recipients.length)
            return;
        await Promise.allSettled(recipients.map((admirer) => (0, emailService_1.sendAdmirerUpdateEmail)(admirer.email, {
            admirerName: admirer.displayName ?? admirer.username ?? 'member',
            actorName: owner.username,
            profileUrl: owner.profileUrl,
            eventType: event.type,
            photoCaption: event.type === 'photo_upload' ? event.caption ?? null : null,
            locationMessage: event.type === 'location_share' ? event.message ?? null : null,
        })));
    }
    catch (error) {
        console.error('[admirerService] Failed to notify admirers:', error);
    }
}
