import type { NextFunction, Request, Response } from 'express';
import { getPool, sql } from '../config/db';

type RawRow = Record<string, unknown>;

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

const getString = (row: RawRow, key: string): string | null => {
  const value = row[key];
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
};

const getBoolean = (row: RawRow, key: string): boolean =>
  Boolean(
    row[key] === true ||
      row[key] === 1 ||
      row[key] === '1' ||
      String(row[key] ?? '').toLowerCase() === 'true',
  );

export async function listRealCouplePhotos(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = await getPool();
    const query = `
      SELECT
        CAST(u.UserID AS NVARCHAR(100)) AS UserID,
        u.Username,
        u.Email,
        u.ProfilePictureUrl,
        u.City,
        u.Country,
        u.IsOnline,
        p.PhotoID,
        p.DataUrl,
        p.Caption,
        p.UploadedAt,
        p.IsPublic
      FROM dbo.Users u
      LEFT JOIN dbo.FakeUsers f
        ON f.UserID = u.UserID
      LEFT JOIN dbo.Photos p
        ON p.UserID = u.UserID
      WHERE (u.AccountKind IS NULL OR u.AccountKind = 'couple')
        AND f.UserID IS NULL
      ORDER BY u.Username ASC, p.UploadedAt DESC;
    `;

    const result = await pool.request().query(query);
    const rows: RawRow[] = result.recordset ?? [];

    const grouped = new Map<
      string,
      {
        userId: string;
        username: string | null;
        email: string | null;
        profilePictureUrl: string | null;
        city: string | null;
        country: string | null;
        isOnline: boolean;
        photos: Array<{
          photoId: string;
          dataUrl: string;
          caption: string | null;
          uploadedAt: string | null;
          isPublic: boolean;
          isProfilePhoto: boolean;
        }>;
      }
    >();

    rows.forEach((row) => {
      const userId = getString(row, 'UserID');
      if (!userId) {
        return;
      }

      const username = getString(row, 'Username');
      const email = getString(row, 'Email');
      const profilePictureUrl = getString(row, 'ProfilePictureUrl');
      const city = getString(row, 'City');
      const country = getString(row, 'Country');
      const isOnline = getBoolean(row, 'IsOnline');

      let entry = grouped.get(userId);
      if (!entry) {
        entry = {
          userId,
          username,
          email,
          profilePictureUrl,
          city,
          country,
          isOnline,
          photos: [],
        };
        grouped.set(userId, entry);
      }

      const photoId = getString(row, 'PhotoID');
      const dataUrl = getString(row, 'DataUrl');
      if (!photoId || !dataUrl) {
        return;
      }

      const caption = getString(row, 'Caption');
      const uploadedAt = toIsoString(row['UploadedAt']);
      const isPublic = getBoolean(row, 'IsPublic');
      const isProfilePhoto =
        Boolean(profilePictureUrl) &&
        (profilePictureUrl === photoId || profilePictureUrl === dataUrl);

      entry.photos.push({
        photoId,
        dataUrl,
        caption,
        uploadedAt,
        isPublic,
        isProfilePhoto,
      });
    });

    const couples = Array.from(grouped.values()).map((item) => ({
      ...item,
      photos: item.photos,
    }));

    res.status(200).json({ couples });
  } catch (error) {
    next(error as Error);
  }
}

