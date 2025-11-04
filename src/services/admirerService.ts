import { sql, withSqlRetry, getPool } from '../config/db';
import { OperationalError } from '../utils/errorHandler';
import { sendAdmirerUpdateEmail } from '../utils/emailService';

const FAVORITE_COLUMN_CANDIDATES = ['FavoriteUserID', 'FavoriteID'] as const;

async function resolveFavoriteColumn(pool?: sql.ConnectionPool): Promise<string> {
  const resolvedPool = pool ?? (await getPool());
  const result = await resolvedPool.request().query<{
    COLUMN_NAME: string;
  }>(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = 'UserFavorites'
      AND COLUMN_NAME IN ('FavoriteUserID', 'FavoriteID');
  `);

  const columnName = result.recordset?.[0]?.COLUMN_NAME;
  if (!columnName) {
    throw new OperationalError(
      `UserFavorites table is missing ${FAVORITE_COLUMN_CANDIDATES.join(' / ')} column. Run migration 2025-10-09_create_user_favorites.sql.`,
      500,
    );
  }
  return columnName;
}

export interface AdmirerContact {
  userId: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  profilePictureUrl: string | null;
  membershipType: string | null;
  city: string | null;
  country: string | null;
  bio: string | null;
  coupleType: string | null;
  createdAt: Date | string | null;
  isOnline: boolean | null;
}

const mapAdmirerRow = (row: Record<string, any>): AdmirerContact => ({
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
  isOnline:
    row.IsOnline === null || row.IsOnline === undefined ? null : row.IsOnline === 1 || row.IsOnline === true,
});

const mapFavoriteRow = (row: Record<string, any>): AdmirerContact => ({
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
  isOnline:
    row.IsOnline === null || row.IsOnline === undefined ? null : row.IsOnline === 1 || row.IsOnline === true,
});

export async function fetchAdmirersForUser(userId: string): Promise<AdmirerContact[]> {
  if (!userId) return [];

  try {
    return await withSqlRetry(async (pool) => {
      const favoriteColumn = await resolveFavoriteColumn(pool);
      const columnSql = `[${favoriteColumn}]`;

      const userColumnsResult = await pool.request().query<{ COLUMN_NAME: string }>(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME = 'Users';
      `);
      const userColumns = new Set(
        (userColumnsResult.recordset ?? []).map((row) => row.COLUMN_NAME?.toLowerCase?.() ?? ''),
      );
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
        .input('TargetUserID', sql.VarChar(255), userId)
        .query(admirersQuery);

      return (result.recordset ?? []).map(mapAdmirerRow);
    });
  } catch (error) {
    console.error('[admirerService] fetchAdmirersForUser failed:', error);
    return [];
  }
}

export async function fetchFavoritesOfUser(userId: string): Promise<AdmirerContact[]> {
  if (!userId) return [];

  try {
    return await withSqlRetry(async (pool) => {
      const favoriteColumn = await resolveFavoriteColumn(pool);
      const columnSql = `[${favoriteColumn}]`;

      const userColumnsResult = await pool.request().query<{ COLUMN_NAME: string }>(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME = 'Users';
      `);
      const userColumns = new Set(
        (userColumnsResult.recordset ?? []).map((row) => row.COLUMN_NAME?.toLowerCase?.() ?? ''),
      );
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
        .input('SourceUserID', sql.VarChar(255), userId)
        .query(favoritesQuery);

      return (result.recordset ?? []).map(mapFavoriteRow);
    });
  } catch (error) {
    console.error('[admirerService] fetchFavoritesOfUser failed:', error);
    return [];
  }
}

async function fetchUserDisplayDetails(userId: string | null): Promise<{
  username: string;
  profileUrl: string;
} | null> {
  if (!userId) return null;

  let row: Record<string, any> | undefined;
  try {
    const result = await withSqlRetry((pool) =>
      pool.request()
        .input('UserID', sql.VarChar(255), userId)
        .query(`
          SELECT TOP (1)
            Username,
            DisplayName
          FROM dbo.Users
          WHERE UserID = @UserID;
        `),
    );
    row = result.recordset?.[0];
  } catch (error: any) {
    const message = String(error?.message ?? '').toLowerCase();
    if (message.includes('invalid column name') && message.includes('displayname')) {
      const fallback = await withSqlRetry((pool) =>
        pool.request()
          .input('UserID', sql.VarChar(255), userId)
          .query(`
            SELECT TOP (1)
              Username
            FROM dbo.Users
            WHERE UserID = @UserID;
          `),
      );
      row = fallback.recordset?.[0];
    } else {
      throw error;
    }
  }

  if (!row) return null;

  const username = row.DisplayName ?? row.Username ?? 'member';
  const frontendBase = (process.env.FRONTEND_URL || 'https://DateAstrum.com').replace(/\/$/, '');
  return {
    username: String(username),
    profileUrl: `${frontendBase}/#/profile`,
  };
}

type AdmirerNotificationEvent =
  | { type: 'photo_upload'; caption?: string | null }
  | { type: 'location_share'; message?: string | null };

export async function notifyAdmirersOfEvent(userId: string, event: AdmirerNotificationEvent): Promise<void> {
  if (!userId) return;

  try {
    const [owner, admirers] = await Promise.all([
      fetchUserDisplayDetails(userId),
      fetchAdmirersForUser(userId),
    ]);

    if (!admirers.length || !owner) return;

    const recipients = admirers.filter((admirer) => admirer.email);
    if (!recipients.length) return;

    await Promise.allSettled(
      recipients.map((admirer) =>
        sendAdmirerUpdateEmail(admirer.email!, {
          admirerName: admirer.displayName ?? admirer.username ?? 'member',
          actorName: owner.username,
          profileUrl: owner.profileUrl,
          eventType: event.type,
          photoCaption: event.type === 'photo_upload' ? event.caption ?? null : null,
          locationMessage: event.type === 'location_share' ? event.message ?? null : null,
        }),
      ),
    );
  } catch (error) {
    console.error('[admirerService] Failed to notify admirers:', error);
  }
}

