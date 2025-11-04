import type { NextFunction, Request, Response } from 'express';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getPool, sql } from '../config/db';
import { OperationalError } from '../utils/errorHandler';
import { sendMessage } from './messageController';

type RawRow = Record<string, unknown>;

const PUBLIC_ASSET_BASE_URL = (process.env.PUBLIC_ASSET_BASE_URL ?? '').replace(/\/$/, '');
const FAKE_CHAT_UPLOAD_ROOT = process.env.FAKE_CHAT_UPLOAD_ROOT
  ? path.resolve(process.env.FAKE_CHAT_UPLOAD_ROOT)
  : path.resolve(__dirname, '../../uploads/fake-chat');

const buildPublicMediaUrl = (storagePath: string | null): string | null => {
  if (!storagePath) {
    return null;
  }
  if (PUBLIC_ASSET_BASE_URL) {
    return `${PUBLIC_ASSET_BASE_URL}${storagePath}`;
  }
  return storagePath;
};

const ensureDirectory = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

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

const mapConversationSummary = (row: RawRow) => {
  const getString = (key: string): string | null => {
    const value = row[key];
    if (value === null || value === undefined) {
      return null;
    }
    const text = String(value).trim();
    return text.length ? text : null;
  };

  const getNumber = (key: string): number => {
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : 0;
  };

  return {
    fakeUserId: getString('FakeUserID'),
    realUserId: getString('RealUserID'),
    fakeLabel: getString('CoupleLabel'),
    fakeUsername: getString('FakeUsername'),
    fakeEmail: getString('FakeEmail'),
    fakeCity: getString('FakeCity'),
    fakeCountry: getString('FakeCountry'),
    fakeSegment: getString('Segment'),
    fakeMembership: getString('MembershipPlan'),
    fakeIsActive: getNumber('IsActive') === 1,
    realUsername: getString('RealUsername'),
    realEmail: getString('RealEmail'),
    realCity: getString('RealCity'),
    realCountry: getString('RealCountry'),
    realIsOnline: getNumber('RealIsOnline') === 1,
    lastMessageId: getString('LastMessageID'),
    lastMessageContent: getString('LastMessageContent'),
    lastMessageSentAt: toIsoString(row['LastMessageSentAt']),
    lastMessageSenderId: getString('LastMessageSenderID'),
    messageCount: getNumber('MessageCount'),
  };
};

const mapMessageRow = (row: RawRow) => {
  const getString = (key: string): string | null => {
    const value = row[key];
    if (value === null || value === undefined) {
      return null;
    }
    const text = String(value).trim();
    return text.length ? text : null;
  };

  return {
    messageId: getString('MessageID'),
    senderUserId: getString('SenderUserID'),
    recipientUserId: getString('RecipientUserID'),
    messageContent: getString('MessageContent') ?? '',
    sentAt: toIsoString(row['SentAt']),
    status: getString('Status'),
    mediaId: getString('FakeChatMediaID'),
    mediaType: getString('MediaType'),
    mimeType: getString('MimeType'),
    mediaUrl: buildPublicMediaUrl(getString('StorageUrl')),
    thumbnailUrl: buildPublicMediaUrl(getString('ThumbnailUrl')),
  };
};

const mapMediaRow = (row: RawRow) => {
  const getString = (key: string): string | null => {
    const value = row[key];
    if (value === null || value === undefined) {
      return null;
    }
    const text = String(value).trim();
    return text.length ? text : null;
  };

  const size = Number(row['SizeBytes']);

  return {
    mediaId: getString('MediaID'),
    fakeUserId: getString('FakeUserID'),
    realUserId: getString('RealUserID'),
    mediaType: getString('MediaType'),
    mimeType: getString('MimeType'),
    fileName: getString('FileName'),
    originalFileName: getString('OriginalFileName'),
    sizeBytes: Number.isFinite(size) ? size : 0,
    mediaUrl: buildPublicMediaUrl(getString('StorageUrl')),
    thumbnailUrl: buildPublicMediaUrl(getString('ThumbnailUrl')),
    uploadedAt: toIsoString(row['UploadedAt']),
  };
};

export async function listFakeConversations(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = await getPool();
    const query = `
      WITH NormalizedMessages AS (
        SELECT
          dm.MessageID,
          dm.MessageContent,
          dm.SentAt,
          dm.SenderUserID,
          dm.RecipientUserID,
          fake.UserID AS FakeUserID,
          CASE WHEN fake.UserID = dm.SenderUserID THEN dm.RecipientUserID ELSE dm.SenderUserID END AS RealUserID
        FROM dbo.DirectMessages dm
        CROSS APPLY (
          SELECT TOP (1) f.UserID
          FROM dbo.FakeUsers f
          WHERE f.UserID IN (dm.SenderUserID, dm.RecipientUserID)
        ) fake
        WHERE fake.UserID IS NOT NULL
      ),
      FilteredMessages AS (
        SELECT
          nm.*,
          ROW_NUMBER() OVER (PARTITION BY nm.FakeUserID, nm.RealUserID ORDER BY nm.SentAt DESC) AS rn,
          COUNT(*) OVER (PARTITION BY nm.FakeUserID, nm.RealUserID) AS MessageCount
        FROM NormalizedMessages nm
        WHERE EXISTS (
          SELECT 1
          FROM dbo.Users ur
          WHERE ur.UserID = nm.RealUserID
            AND (ur.AccountKind IS NULL OR ur.AccountKind = 'couple')
        )
      )
      SELECT
        CAST(fm.FakeUserID AS NVARCHAR(100)) AS FakeUserID,
        CAST(fm.RealUserID AS NVARCHAR(100)) AS RealUserID,
        CAST(fm.MessageID AS NVARCHAR(100)) AS LastMessageID,
        fm.MessageContent AS LastMessageContent,
        fm.SentAt AS LastMessageSentAt,
        CAST(fm.SenderUserID AS NVARCHAR(100)) AS LastMessageSenderID,
        fm.MessageCount,
        fu.CoupleLabel,
        fu.Segment,
        fu.MembershipPlan,
        CAST(fu.IsActive AS INT) AS IsActive,
        uFake.Username AS FakeUsername,
        uFake.Email AS FakeEmail,
        uFake.City AS FakeCity,
        uFake.Country AS FakeCountry,
        uReal.Username AS RealUsername,
        uReal.Email AS RealEmail,
        uReal.City AS RealCity,
        uReal.Country AS RealCountry,
        CAST(ISNULL(uReal.IsOnline, 0) AS INT) AS RealIsOnline
      FROM FilteredMessages fm
      JOIN dbo.FakeUsers fu ON fu.UserID = fm.FakeUserID
      JOIN dbo.Users uFake ON uFake.UserID = fm.FakeUserID
      JOIN dbo.Users uReal ON uReal.UserID = fm.RealUserID
      WHERE fm.rn = 1
      ORDER BY fm.SentAt DESC;
    `;

    const result = await pool.request().query(query);
    const conversations = (result.recordset ?? []).map(mapConversationSummary);
    res.status(200).json({ conversations });
  } catch (error) {
    next(error as Error);
  }
}

export async function getFakeConversation(req: Request, res: Response, next: NextFunction) {
  const { fakeUserId, realUserId } = req.params;
  if (!fakeUserId || !realUserId) {
    return next(new OperationalError('Fake and real user identifiers are required.', 400));
  }

  try {
    const pool = await getPool();
    const request = pool
      .request()
      .input('FakeUserID', sql.UniqueIdentifier, fakeUserId)
      .input('RealUserID', sql.UniqueIdentifier, realUserId);

    const query = `
      SELECT
        CAST(dm.MessageID AS NVARCHAR(100)) AS MessageID,
        CAST(dm.SenderUserID AS NVARCHAR(100)) AS SenderUserID,
        CAST(dm.RecipientUserID AS NVARCHAR(100)) AS RecipientUserID,
        dm.MessageContent,
        dm.SentAt,
        dm.Status,
        CAST(dm.FakeChatMediaID AS NVARCHAR(100)) AS FakeChatMediaID,
        media.MediaType,
        media.MimeType,
        media.StorageUrl,
        media.ThumbnailUrl
      FROM dbo.DirectMessages dm
      LEFT JOIN dbo.FakeChatMediaLibrary media ON media.MediaID = dm.FakeChatMediaID
      WHERE
        (dm.SenderUserID = @FakeUserID AND dm.RecipientUserID = @RealUserID)
        OR
        (dm.SenderUserID = @RealUserID AND dm.RecipientUserID = @FakeUserID)
      ORDER BY dm.SentAt ASC;

      SELECT
        CAST(f.UserID AS NVARCHAR(100)) AS FakeUserID,
        f.CoupleLabel,
        f.Segment,
        f.MembershipPlan,
        CAST(f.IsActive AS INT) AS IsActive,
        u.Username,
        u.Email,
        u.City,
        u.Country
      FROM dbo.FakeUsers f
      JOIN dbo.Users u ON u.UserID = f.UserID
      WHERE f.UserID = @FakeUserID;

      SELECT
        CAST(u.UserID AS NVARCHAR(100)) AS RealUserID,
        u.Username,
        u.Email,
        u.City,
        u.Country,
        CAST(ISNULL(u.IsOnline, 0) AS INT) AS IsOnline
      FROM dbo.Users u
      WHERE u.UserID = @RealUserID;
    `;

    const result = await request.query(query);
    const recordsets = result.recordsets as sql.IRecordSet<RawRow>[] | undefined;
    const messagesSet = recordsets?.[0] ?? [];
    const fakeSet = recordsets?.[1] ?? [];
    const realSet = recordsets?.[2] ?? [];

    if (!fakeSet.length) {
      return next(new OperationalError('Fake profile not found.', 404));
    }
    if (!realSet.length) {
      return next(new OperationalError('Real user not found.', 404));
    }

    const fakeRow = fakeSet[0];
    const realRow = realSet[0];

    const fakeProfile = {
      fakeUserId: String(fakeRow.FakeUserID ?? ''),
      label: typeof fakeRow.CoupleLabel === 'string' ? fakeRow.CoupleLabel : null,
      segment: typeof fakeRow.Segment === 'string' ? fakeRow.Segment : null,
      membershipPlan: typeof fakeRow.MembershipPlan === 'string' ? fakeRow.MembershipPlan : null,
      isActive: Number(fakeRow.IsActive ?? 0) === 1,
      username: typeof fakeRow.Username === 'string' ? fakeRow.Username : null,
      email: typeof fakeRow.Email === 'string' ? fakeRow.Email : null,
      city: typeof fakeRow.City === 'string' ? fakeRow.City : null,
      country: typeof fakeRow.Country === 'string' ? fakeRow.Country : null,
    };

    const realProfile = {
      realUserId: String(realRow.RealUserID ?? ''),
      username: typeof realRow.Username === 'string' ? realRow.Username : null,
      email: typeof realRow.Email === 'string' ? realRow.Email : null,
      city: typeof realRow.City === 'string' ? realRow.City : null,
      country: typeof realRow.Country === 'string' ? realRow.Country : null,
      isOnline: Number(realRow.IsOnline ?? 0) === 1,
    };

    const messages = (messagesSet ?? []).map(mapMessageRow);

    res.status(200).json({
      fake: fakeProfile,
      real: realProfile,
      messages,
    });
  } catch (error) {
    next(error as Error);
  }
}

export async function adminSendFakeMessage(req: Request, res: Response, next: NextFunction) {
  const { fakeUserId, realUserId } = req.params;
  if (!fakeUserId || !realUserId) {
    return next(new OperationalError('Fake and real user identifiers are required.', 400));
  }

  req.body = {
    ...(req.body ?? {}),
    senderUserId: fakeUserId,
    recipientUserId: realUserId,
  };

  return sendMessage(req, res, next);
}

const MEDIA_TYPE_ALLOWLIST = new Set(['image', 'video', 'gif', 'audio']);
const MAX_MEDIA_SIZE_BYTES = Number(process.env.FAKE_CHAT_MEDIA_MAX_BYTES ?? 10 * 1024 * 1024);

const inferExtension = (fileName: string | null, mimeType: string): string => {
  const trimmedName = (fileName ?? '').trim();
  const extFromName = trimmedName ? path.extname(trimmedName) : '';
  if (extFromName) {
    return extFromName.toLowerCase();
  }
  if (mimeType.startsWith('image/')) {
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/jpeg') return '.jpg';
    if (mimeType === 'image/gif') return '.gif';
    if (mimeType === 'image/webp') return '.webp';
  } else if (mimeType.startsWith('video/')) {
    if (mimeType === 'video/mp4') return '.mp4';
    if (mimeType === 'video/webm') return '.webm';
    if (mimeType === 'video/ogg') return '.ogv';
  } else if (mimeType.startsWith('audio/')) {
    if (mimeType === 'audio/mpeg') return '.mp3';
    if (mimeType === 'audio/ogg') return '.ogg';
    if (mimeType === 'audio/wav') return '.wav';
  }
  return '.bin';
};

const sanitizeFileName = (value: string): string =>
  value
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

export async function listFakeChatMedia(req: Request, res: Response, next: NextFunction) {
  const { fakeUserId, realUserId } = req.params;
  if (!fakeUserId) {
    return next(new OperationalError('Fake user identifier is required.', 400));
  }

  try {
    const pool = await getPool();
    const request = pool
      .request()
      .input('FakeUserID', sql.NVarChar(255), fakeUserId);

    if (realUserId) {
      request.input('RealUserID', sql.NVarChar(255), realUserId);
    }

    const query = `
      SELECT
        CAST(MediaID AS NVARCHAR(100)) AS MediaID,
        CAST(FakeUserID AS NVARCHAR(100)) AS FakeUserID,
        CAST(RealUserID AS NVARCHAR(100)) AS RealUserID,
        MediaType,
        MimeType,
        FileName,
        OriginalFileName,
        SizeBytes,
        StorageUrl,
        ThumbnailUrl,
        UploadedAt
      FROM dbo.FakeChatMediaLibrary
      WHERE FakeUserID = @FakeUserID
        AND (@RealUserID IS NULL OR RealUserID IS NULL OR RealUserID = @RealUserID)
      ORDER BY UploadedAt DESC;
    `;

    const result = await request.query(query);
    const media = (result.recordset ?? []).map(mapMediaRow);
    res.status(200).json({ media });
  } catch (error) {
    next(error as Error);
  }
}

export async function uploadFakeChatMedia(req: Request, res: Response, next: NextFunction) {
  const { fakeUserId, realUserId } = req.params;
  if (!fakeUserId) {
    return next(new OperationalError('Fake user identifier is required.', 400));
  }

  const { fileName, mimeType, mediaType, base64Data, originalFileName } = req.body ?? {};

  if (typeof mimeType !== 'string' || !mimeType.trim()) {
    return next(new OperationalError('mimeType is required.', 400));
  }

  const normalizedMediaType =
    typeof mediaType === 'string' && MEDIA_TYPE_ALLOWLIST.has(mediaType.trim().toLowerCase())
      ? mediaType.trim().toLowerCase()
      : 'image';

  if (typeof base64Data !== 'string' || !base64Data.trim()) {
    return next(new OperationalError('base64Data is required for upload.', 400));
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data.trim(), 'base64');
  } catch (error) {
    return next(new OperationalError('Failed to decode uploaded file.', 400));
  }

  if (!buffer || buffer.length === 0) {
    return next(new OperationalError('Uploaded file is empty.', 400));
  }

  if (buffer.length > MAX_MEDIA_SIZE_BYTES) {
    return next(
      new OperationalError(`Uploaded file exceeds ${MAX_MEDIA_SIZE_BYTES} bytes limit.`, 413),
    );
  }

  try {
    const extension = inferExtension(typeof fileName === 'string' ? fileName : null, mimeType);
    const safeNameBase =
      typeof fileName === 'string' && fileName.trim().length
        ? sanitizeFileName(fileName.trim().replace(extension, '') || 'upload')
        : 'upload';
    const generatedName = `${Date.now()}-${randomUUID()}-${safeNameBase}${extension}`;

    const targetDir = path.join(FAKE_CHAT_UPLOAD_ROOT, fakeUserId);
    await ensureDirectory(targetDir);
    const absolutePath = path.join(targetDir, generatedName);
    await fs.writeFile(absolutePath, buffer);

    const storageUrl = `/uploads/fake-chat/${fakeUserId}/${generatedName}`;
    const mediaId = randomUUID();

    const pool = await getPool();
    const insertResult = await pool
      .request()
      .input('MediaID', sql.UniqueIdentifier, mediaId)
      .input('FakeUserID', sql.NVarChar(255), fakeUserId)
      .input('RealUserID', sql.NVarChar(255), realUserId ?? null)
      .input('MediaType', sql.VarChar(20), normalizedMediaType)
      .input('MimeType', sql.VarChar(100), mimeType)
      .input('FileName', sql.NVarChar(255), generatedName)
      .input(
        'OriginalFileName',
        sql.NVarChar(255),
        typeof originalFileName === 'string' && originalFileName.trim().length
          ? originalFileName.trim()
          : typeof fileName === 'string'
            ? fileName.trim()
            : null,
      )
      .input('SizeBytes', sql.BigInt, buffer.length)
      .input('StorageUrl', sql.NVarChar(2048), storageUrl)
      .query(`
        INSERT INTO dbo.FakeChatMediaLibrary
          (MediaID, FakeUserID, RealUserID, MediaType, MimeType, FileName, OriginalFileName, SizeBytes, StorageUrl)
        VALUES
          (@MediaID, @FakeUserID, @RealUserID, @MediaType, @MimeType, @FileName, @OriginalFileName, @SizeBytes, @StorageUrl);

        SELECT
          CAST(MediaID AS NVARCHAR(100)) AS MediaID,
          CAST(FakeUserID AS NVARCHAR(100)) AS FakeUserID,
          CAST(RealUserID AS NVARCHAR(100)) AS RealUserID,
          MediaType,
          MimeType,
          FileName,
          OriginalFileName,
          SizeBytes,
          StorageUrl,
          ThumbnailUrl,
          UploadedAt
        FROM dbo.FakeChatMediaLibrary
        WHERE MediaID = @MediaID;
      `);

    const recordset = insertResult.recordset ?? [];
    const media = recordset.length ? mapMediaRow(recordset[0]) : null;
    if (!media) {
      return next(new OperationalError('Failed to persist uploaded media.', 500));
    }

    res.status(201).json(media);
  } catch (error) {
    next(error as Error);
  }
}
