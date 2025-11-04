// FIX: Changed type-only import to standard import to fix type resolution.
import type { Request, Response, NextFunction } from 'express';
import { getPool, sql } from "../config/db";
import { generateId } from "../utils/generateId";
import { sendFakeEngagementAlertEmail } from "../utils/emailService";
import { OperationalError } from "../utils/errorHandler";
import { DirectMessageBE, DirectMessageStatusBE } from "../shared_types";

const PUBLIC_ASSET_BASE_URL = (process.env.PUBLIC_ASSET_BASE_URL ?? '').replace(/\/$/, '');
const buildPublicMediaUrl = (storageUrl: string | null): string | null => {
  if (!storageUrl) {
    return null;
  }
  if (PUBLIC_ASSET_BASE_URL) {
    return `${PUBLIC_ASSET_BASE_URL}${storageUrl}`;
  }
  return storageUrl;
};

type MessageUserSnapshot = {
  id: string;
  username: string | null;
  profilePictureUrl?: string | null;
  isOnline?: boolean | null;
  city?: string | null;
  country?: string | null;
  accountKind?: string | null;
};

const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const DATA_URL_PREVIEW_REGEX = /^data:([^;]+);base64,/i;

const isGuid = (value: unknown): value is string =>
  typeof value === 'string' && GUID_REGEX.test(value.trim());

const normalizeUserId = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
};

const inferSqlIdentifierType = (userId: string) =>
  isGuid(userId) ? sql.UniqueIdentifier : sql.VarChar(255);

const inferAttachmentKind = (mimeLike: string): 'photo' | 'video' | 'attachment' => {
  if (mimeLike.startsWith('image/')) {
    return 'photo';
  }
  if (mimeLike.startsWith('video/')) {
    return 'video';
  }
  return 'attachment';
};

const buildAttachmentPreviewLabel = (kind: 'photo' | 'video' | 'attachment'): string => {
  switch (kind) {
    case 'photo':
      return 'Sent a photo';
    case 'video':
      return 'Sent a video';
    default:
      return 'Sent an attachment';
  }
};

const summarizeMessagePreview = (
  rawContent: unknown,
  fakeChatMediaId: unknown,
  mediaType?: unknown,
  mimeType?: unknown,
): string => {
  const content = typeof rawContent === 'string' ? rawContent : '';
  const trimmed = content.trim();
  const mediaId =
    typeof fakeChatMediaId === 'string' && fakeChatMediaId.trim().length ? fakeChatMediaId.trim() : '';
  const normalizedMediaType = typeof mediaType === 'string' ? mediaType.toLowerCase() : '';
  const normalizedMimeType = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';

  if (mediaId) {
    const kind = inferAttachmentKind(normalizedMimeType || normalizedMediaType);
    return buildAttachmentPreviewLabel(kind);
  }

  if (!trimmed) {
    return 'Sent a message';
  }

  const dataMatch = DATA_URL_PREVIEW_REGEX.exec(trimmed);
  if (dataMatch) {
    const kind = inferAttachmentKind((dataMatch[1] ?? '').toLowerCase());
    return buildAttachmentPreviewLabel(kind);
  }

  const MAX_PREVIEW_LENGTH = 140;
  return trimmed.length > MAX_PREVIEW_LENGTH
    ? `${trimmed.slice(0, MAX_PREVIEW_LENGTH - 3)}...`
    : trimmed;
};

async function fetchMessageUserSnapshot(
  pool: sql.ConnectionPool,
  userIdRaw: string,
): Promise<MessageUserSnapshot | null> {
  const userId = normalizeUserId(userIdRaw);
  if (!userId) return null;

  const coupleResult = await pool
    .request()
    .input('UserID', sql.VarChar(255), userId)
    .query(`
      SELECT
        UserID,
        Username,
        ProfilePictureUrl,
        IsOnline,
        City,
        Country,
        AccountKind
      FROM dbo.Users
      WHERE UserID = @UserID;
    `);

  const coupleRow = coupleResult.recordset?.[0];
  if (coupleRow) {
    return {
      id: String(coupleRow.UserID),
      username: coupleRow.Username ?? null,
      profilePictureUrl: coupleRow.ProfilePictureUrl ?? null,
      isOnline: coupleRow.IsOnline ?? null,
      city: coupleRow.City ?? null,
      country: coupleRow.Country ?? null,
      accountKind: coupleRow.AccountKind ?? 'couple',
    };
  }

  if (!isGuid(userId)) {
    return null;
  }

  const singleResult = await pool
    .request()
    .input('UserID', sql.UniqueIdentifier, userId)
    .query(`
      SELECT
        su.UserID,
        COALESCE(sp.PreferredNickname, su.Username, su.Email) AS Username,
        sp.City,
        sp.Country
      FROM dbo.SingleUsers su
      LEFT JOIN dbo.SingleProfiles sp ON sp.UserID = su.UserID
      WHERE su.UserID = @UserID;
    `);

  const singleRow = singleResult.recordset?.[0];
  if (!singleRow) {
    return null;
  }

  return {
    id: String(singleRow.UserID),
    username: singleRow.Username ?? null,
    profilePictureUrl: null,
    isOnline: null,
    city: singleRow.City ?? null,
    country: singleRow.Country ?? null,
    accountKind: 'single',
  };
}

async function fetchMessageUserSnapshots(
  pool: sql.ConnectionPool,
  userIds: Iterable<string>,
): Promise<Map<string, MessageUserSnapshot>> {
  const snapshots = new Map<string, MessageUserSnapshot>();
  for (const rawId of userIds) {
    const normalized = normalizeUserId(rawId);
    if (!normalized || snapshots.has(normalized)) {
      continue;
    }
    const snapshot = await fetchMessageUserSnapshot(pool, normalized);
    if (snapshot) {
      snapshots.set(normalized, snapshot);
    }
  }
  return snapshots;
}

export const sendMessage = async (req: Request, res: Response, next: NextFunction) => {
  const { senderUserId, recipientUserId, messageContent, fakeChatMediaId } = req.body;

  const normalizedSenderId = normalizeUserId(senderUserId);
  const normalizedRecipientId = normalizeUserId(recipientUserId);
  const normalizedMediaId =
    typeof fakeChatMediaId === 'string' && fakeChatMediaId.trim().length
      ? fakeChatMediaId.trim()
      : null;

  if (!normalizedSenderId) {
    return next(new OperationalError('Sender not authenticated.', 401));
  }
  if (!normalizedRecipientId || typeof messageContent !== 'string') {
    return next(new OperationalError('Recipient UserID and message content are required.', 400));
  }

  const DATA_URL_REGEX = /^data:[^;]+;base64,/i;

  let trimmedMessage = messageContent.trim();
  if (normalizedMediaId && DATA_URL_REGEX.test(trimmedMessage)) {
    trimmedMessage = '';
  }

  const hasText = trimmedMessage.length > 0;
  const hasMediaAttachment = Boolean(normalizedMediaId);

  if (trimmedMessage.length > 10_000_000) {
    return next(new OperationalError('Message content is invalid or too long (max 10MB).', 400));
  }

  if (!hasText && !hasMediaAttachment) {
    return next(
      new OperationalError(
        'Message must include text or an approved media attachment.',
        400,
      ),
    );
  }

  const messageId = generateId('msg_');
  const sentAt = new Date();

  try {
    const pool = await getPool();

    let attachedMedia: {
      MediaID: string;
      FakeUserID: string | null;
      RealUserID: string | null;
      MediaType: string | null;
      MimeType: string | null;
      StorageUrl: string | null;
      ThumbnailUrl: string | null;
    } | null = null;

    if (normalizedMediaId) {
      if (!isGuid(normalizedMediaId)) {
        return next(new OperationalError('Invalid media identifier supplied.', 400));
      }
      const mediaResult = await pool
        .request()
        .input('MediaID', sql.UniqueIdentifier, normalizedMediaId)
        .query(`
          SELECT
            CAST(MediaID AS NVARCHAR(100)) AS MediaID,
            CAST(FakeUserID AS NVARCHAR(100)) AS FakeUserID,
            CAST(RealUserID AS NVARCHAR(100)) AS RealUserID,
            MediaType,
            MimeType,
            StorageUrl,
            ThumbnailUrl
          FROM dbo.FakeChatMediaLibrary
          WHERE MediaID = @MediaID;
        `);
      if (mediaResult.recordset.length === 0) {
        return next(new OperationalError('Attached media not found.', 404));
      }
      const mediaRow = mediaResult.recordset[0];
      const mediaFakeUser = normalizeUserId(String(mediaRow.FakeUserID ?? ''));
      if (mediaFakeUser && mediaFakeUser !== normalizedSenderId) {
        return next(new OperationalError('Media belongs to a different fake profile.', 403));
      }
      const mediaRealUser = normalizeUserId(String(mediaRow.RealUserID ?? ''));
      if (mediaRealUser && mediaRealUser !== normalizedRecipientId) {
        return next(new OperationalError('Media is not available for this conversation.', 403));
      }
      attachedMedia = {
        MediaID: String(mediaRow.MediaID ?? normalizedMediaId),
        FakeUserID: mediaRow.FakeUserID ? String(mediaRow.FakeUserID) : null,
        RealUserID: mediaRow.RealUserID ? String(mediaRow.RealUserID) : null,
        MediaType: mediaRow.MediaType ? String(mediaRow.MediaType) : null,
        MimeType: mediaRow.MimeType ? String(mediaRow.MimeType) : null,
        StorageUrl: mediaRow.StorageUrl ? String(mediaRow.StorageUrl) : null,
        ThumbnailUrl: mediaRow.ThumbnailUrl ? String(mediaRow.ThumbnailUrl) : null,
      };
    }
    const recipientSnapshot = await fetchMessageUserSnapshot(pool, normalizedRecipientId);
    if (!recipientSnapshot) {
      return next(new OperationalError('Recipient user not found.', 404));
    }

    let initialStatus: DirectMessageStatusBE = 'pending';

    const conversationStatusResult = await pool
      .request()
      .input('SenderUserID', sql.VarChar(255), normalizedSenderId)
      .input('RecipientUserID', sql.VarChar(255), normalizedRecipientId)
      .query(`
        SELECT TOP (1) Status
        FROM dbo.DirectMessages
        WHERE
          (SenderUserID = @SenderUserID AND RecipientUserID = @RecipientUserID)
          OR
          (SenderUserID = @RecipientUserID AND RecipientUserID = @SenderUserID)
        ORDER BY SentAt DESC;
      `);

    const previousStatus = String(conversationStatusResult.recordset?.[0]?.Status ?? '').toLowerCase();
    const autoAcceptableStatuses = new Set<DirectMessageStatusBE | string>([
      'accepted',
      'viewed',
      'read',
      'delivered',
      'sent',
    ]);
    if (autoAcceptableStatuses.has(previousStatus)) {
      initialStatus = 'accepted';
    }

    const query = `
      DECLARE @NewMessage TABLE (
        MessageID VARCHAR(255), SenderUserID VARCHAR(255), RecipientUserID VARCHAR(255),
        MessageContent NVARCHAR(MAX), SentAt DATETIME2, Status VARCHAR(20), FakeChatMediaID UNIQUEIDENTIFIER NULL
      );
      INSERT INTO DirectMessages (MessageID, SenderUserID, RecipientUserID, MessageContent, SentAt, Status, UpdatedAt, FakeChatMediaID)
      OUTPUT inserted.MessageID, inserted.SenderUserID, inserted.RecipientUserID, inserted.MessageContent, inserted.SentAt, inserted.Status, inserted.FakeChatMediaID
      INTO @NewMessage
      VALUES (@MessageID, @SenderUserID, @RecipientUserID, @MessageContent, @SentAt, @InitialStatus, GETUTCDATE(), @FakeChatMediaID);
      SELECT * FROM @NewMessage;
    `;
    const result = await pool
      .request()
      .input('MessageID', sql.VarChar(255), messageId)
      .input('SenderUserID', sql.VarChar(255), normalizedSenderId)
      .input('RecipientUserID', sql.VarChar(255), normalizedRecipientId)
      .input('MessageContent', sql.NVarChar(sql.MAX), trimmedMessage)
      .input('SentAt', sql.DateTime2, sentAt)
      .input('InitialStatus', sql.VarChar(20), initialStatus)
      .input(
        'FakeChatMediaID',
        sql.UniqueIdentifier,
        normalizedMediaId ? normalizedMediaId : null,
      )
      .query(query);

    const newMessage: DirectMessageBE = result.recordset[0];
    if (attachedMedia) {
      (newMessage as any).FakeChatMediaID = attachedMedia.MediaID ?? normalizedMediaId;
      (newMessage as any).FakeChatMediaType = attachedMedia.MediaType ?? null;
      (newMessage as any).FakeChatMediaMimeType = attachedMedia.MimeType ?? null;
      (newMessage as any).FakeChatMediaUrl = buildPublicMediaUrl(attachedMedia.StorageUrl ?? null);
      (newMessage as any).FakeChatMediaThumbnailUrl = buildPublicMediaUrl(attachedMedia.ThumbnailUrl ?? null);
    } else {
      (newMessage as any).FakeChatMediaID = null;
      (newMessage as any).FakeChatMediaType = null;
      (newMessage as any).FakeChatMediaMimeType = null;
      (newMessage as any).FakeChatMediaUrl = null;
      (newMessage as any).FakeChatMediaThumbnailUrl = null;
    }

    const senderSnapshot = await fetchMessageUserSnapshot(pool, normalizedSenderId);
    newMessage.SenderUsername = senderSnapshot?.username ?? null;
    newMessage.RecipientUsername = recipientSnapshot.username ?? null;

    const attachmentPreviewLabel = attachedMedia
      ? `[${(attachedMedia.MediaType ?? attachedMedia.MimeType ?? 'media')
          .toString()
          .split('/')
          .shift()
          ?.trim()
          .replace(/^\w/, (c) => c.toUpperCase()) ?? 'Media'} attachment]`
      : '';

    const shorten = (value: string, max: number): string =>
      value.length > max ? `${value.slice(0, max - 3)}...` : value;

    const messagePreview = hasText
      ? shorten(trimmedMessage, 500)
      : attachmentPreviewLabel;

    try {
      const engagementCheck = await pool
        .request()
        .input('RecipientID', sql.VarChar(255), normalizedRecipientId)
        .input('SenderID', sql.VarChar(255), normalizedSenderId)
        .query(`
          SELECT
            CASE WHEN EXISTS (
              SELECT 1
              FROM dbo.FakeUsers f
              WHERE f.UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @RecipientID)
                AND ISNULL(f.IsActive, 0) = 1
            ) THEN 1 ELSE 0 END AS RecipientIsFake,
            CASE WHEN EXISTS (
              SELECT 1
              FROM dbo.FakeUsers f
              WHERE f.UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @SenderID)
                AND ISNULL(f.IsActive, 0) = 1
            ) THEN 1 ELSE 0 END AS SenderIsFake,
            ISNULL(
              (
                SELECT TOP (1) LOWER(ISNULL(AccountKind, 'couple'))
                FROM dbo.Users
                WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @SenderID)
              ),
              'couple'
            ) AS SenderAccountKind,
            (
              SELECT TOP (1) Email
              FROM dbo.Users
              WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @SenderID)
            ) AS SenderEmail,
            (
              SELECT TOP (1) Email
              FROM dbo.Users
              WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @RecipientID)
            ) AS RecipientEmail,
            (
              SELECT TOP (1) CoupleLabel
              FROM dbo.FakeUsers
              WHERE UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @RecipientID)
                AND ISNULL(IsActive, 0) = 1
            ) AS FakeLabel
        `);

      const engagementRow = engagementCheck.recordset?.[0] ?? {};
      const recipientIsFake = Number(engagementRow.RecipientIsFake ?? 0) === 1;
      const senderIsFake = Number(engagementRow.SenderIsFake ?? 0) === 1;
      const senderAccountKind = String(engagementRow.SenderAccountKind ?? '').toLowerCase();

      if (recipientIsFake && !senderIsFake && (senderAccountKind === 'couple' || senderAccountKind === '')) {
        await sendFakeEngagementAlertEmail({
          senderUserId: normalizedSenderId,
          senderUsername: senderSnapshot?.username ?? null,
          senderEmail: typeof engagementRow.SenderEmail === 'string' ? engagementRow.SenderEmail : null,
          fakeUserId: normalizedRecipientId,
          fakeLabel:
            typeof engagementRow.FakeLabel === 'string' && engagementRow.FakeLabel.trim().length
              ? engagementRow.FakeLabel
              : recipientSnapshot.username ?? null,
          fakeEmail: typeof engagementRow.RecipientEmail === 'string' ? engagementRow.RecipientEmail : null,
          messagePreview: messagePreview || attachmentPreviewLabel || trimmedMessage,
        });
        try {
          await pool
            .request()
            .input('SenderUserID', sql.NVarChar(255), normalizedSenderId)
            .input('FakeUserID', sql.NVarChar(255), normalizedRecipientId)
            .input('MessageID', sql.NVarChar(255), newMessage.MessageID)
            .input('Preview', sql.NVarChar(500), messagePreview || attachmentPreviewLabel || trimmedMessage)
            .query(`
              INSERT INTO dbo.FakeEngagementEvents (SenderUserID, FakeUserID, MessageID, MessagePreview, CreatedAt)
              VALUES (@SenderUserID, @FakeUserID, @MessageID, @Preview, SYSUTCDATETIME());
            `);
        } catch (eventError) {
          console.error('[messageController] Failed to persist fake engagement event.', eventError);
        }
      }
    } catch (alertError) {
      console.error('[messageController] Failed to dispatch fake engagement alert.', alertError);
    }

    try {
      const notificationId = generateId('notif_');
      await pool.request()
        .input('NotificationID', sql.VarChar(255), notificationId)
        .input('UserID', sql.VarChar(255), normalizedRecipientId)
        .input('Type', sql.VarChar(50), 'new_message')
        .input('SourceUserID', sql.VarChar(255), normalizedSenderId)
        .input('EntityID', sql.VarChar(255), messageId)
        .input(
          'Message',
          sql.NVarChar(sql.MAX),
          (() => {
            const fallback = attachmentPreviewLabel || '[Media attachment]';
            if (!hasText) {
              return fallback;
            }
            if (DATA_URL_REGEX.test(trimmedMessage)) {
              return fallback;
            }
            return shorten(trimmedMessage, 400);
          })(),
        )
        .query(`
          INSERT INTO Notifications (NotificationID, UserID, Type, SourceUserID, EntityID, Message, IsRead, CreatedAt)
          VALUES (@NotificationID, @UserID, @Type, @SourceUserID, @EntityID, @Message, 0, GETUTCDATE());
        `);
    } catch (notificationError) {
      console.error('Failed to record chat notification:', notificationError);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    const requestError = error as {
      number?: number;
      message?: unknown;
      originalError?: { number?: number; message?: unknown };
    };
    const errorNumber = requestError?.number ?? requestError?.originalError?.number;
    const combinedMessage = [requestError?.message, requestError?.originalError?.message]
      .map((value) => (typeof value === 'string' ? value : ''))
      .join(' ');
    if (errorNumber === 547 && combinedMessage.includes('FK_DirectMessages')) {
      return next(new OperationalError('Recipient user not found.', 404));
    }
    next(error as Error);
  }
};

export const getConversation = async (req: Request, res: Response, next: NextFunction) => {
  const { currentUserId } = req.query;
  const { otherUserId } = req.params;

  if (!currentUserId) {
    return next(new OperationalError('User not authenticated.', 401));
  }
  if (!otherUserId) {
    return next(new OperationalError('Other user ID is required to fetch conversation.', 400));
  }

  try {
    const currentUserIdNormalized = normalizeUserId(String(currentUserId));
    if (!currentUserIdNormalized) {
      return next(new OperationalError('User not authenticated.', 401));
    }

    const pool = await getPool();
    let query = `
      SELECT
        dm.MessageID,
        dm.SenderUserID,
        dm.RecipientUserID,
        dm.MessageContent,
        dm.SentAt,
        dm.Status
      FROM DirectMessages dm
    `;
    const request = pool.request();
    if (otherUserId === 'ALL_UNACCEPTED') {
      query += ` WHERE dm.RecipientUserID = @CurrentUserID AND dm.Status = 'pending' ORDER BY dm.SentAt DESC;`;
      request.input('CurrentUserID', sql.VarChar(255), currentUserIdNormalized);
    } else {
      const otherUserIdNormalized = normalizeUserId(otherUserId);
      if (!otherUserIdNormalized) {
        return next(new OperationalError('Other user ID is required to fetch conversation.', 400));
      }
      query += `
        WHERE (dm.SenderUserID = @CurrentUserID AND dm.RecipientUserID = @OtherUserID)
           OR (dm.SenderUserID = @OtherUserID AND dm.RecipientUserID = @CurrentUserID)
        ORDER BY dm.SentAt ASC;
      `;
      request
        .input('CurrentUserID', sql.VarChar(255), currentUserIdNormalized)
        .input('OtherUserID', sql.VarChar(255), otherUserIdNormalized);
    }

    const result = await request.query(query);
    const messages: DirectMessageBE[] = result.recordset;

    const uniqueIds = new Set<string>();
    for (const message of messages) {
      const senderKey = normalizeUserId(String(message.SenderUserID));
      const recipientKey = normalizeUserId(String(message.RecipientUserID));
      if (senderKey) uniqueIds.add(senderKey);
      if (recipientKey) uniqueIds.add(recipientKey);
    }
    const snapshots = await fetchMessageUserSnapshots(pool, uniqueIds);

    const enriched = messages.map((message) => {
      const senderKey = normalizeUserId(String(message.SenderUserID));
      const recipientKey = normalizeUserId(String(message.RecipientUserID));
      return {
        ...message,
        SenderUsername: senderKey ? snapshots.get(senderKey)?.username ?? null : null,
        RecipientUsername: recipientKey ? snapshots.get(recipientKey)?.username ?? null : null,
      };
    });

    res.status(200).json(enriched);
  } catch (error) {
    next(error as Error);
  }
};

export const deleteConversation = async (req: Request, res: Response, next: NextFunction) => {
    const { otherUserId } = req.params;
    const { actingUserId } = req.body;

    if (!actingUserId) {
        return next(new OperationalError('Current user ID is required for this action.', 401));
    }
    if (!otherUserId) {
        return next(new OperationalError('Other user ID is required to delete a conversation.', 400));
    }

    try {
        const pool = await getPool();
        const query = `
            DELETE FROM DirectMessages
            WHERE (SenderUserID = @ActingUserID AND RecipientUserID = @OtherUserID)
               OR (SenderUserID = @OtherUserID AND RecipientUserID = @ActingUserID);
        `;
        await pool.request()
            .input('ActingUserID', sql.VarChar(255), actingUserId)
            .input('OtherUserID', sql.VarChar(255), otherUserId)
            .query(query);
        
        res.status(204).send();
    } catch (error) {
        next(error as Error);
    }
};

export const getConversationsList = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.params;

  if (!userId) {
    return next(new OperationalError('User ID is required.', 401));
  }

  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId) {
    return next(new OperationalError('User ID is required.', 401));
  }

  try {
    const pool = await getPool();
    const query = `
      WITH RankedMessages AS (
        SELECT
          dm.MessageID,
          dm.SenderUserID,
          dm.RecipientUserID,
          dm.MessageContent,
          dm.FakeChatMediaID,
          dm.SentAt,
          dm.Status,
          ROW_NUMBER() OVER(
            PARTITION BY CASE WHEN SenderUserID = @UserID THEN RecipientUserID ELSE SenderUserID END
            ORDER BY SentAt DESC
          ) AS rn,
          CASE WHEN SenderUserID = @UserID THEN RecipientUserID ELSE SenderUserID END AS OtherUserID
        FROM DirectMessages dm
        WHERE dm.SenderUserID = @UserID OR dm.RecipientUserID = @UserID
      ),
      UnreadCounts AS (
        SELECT
          CASE WHEN dm.SenderUserID = @UserID THEN dm.RecipientUserID ELSE dm.SenderUserID END AS OtherUserID,
          COUNT(*) AS UnreadCount
        FROM DirectMessages dm
        WHERE dm.RecipientUserID = @UserID
          AND dm.Status NOT IN ('read', 'viewed', 'denied')
        GROUP BY CASE WHEN dm.SenderUserID = @UserID THEN dm.RecipientUserID ELSE dm.SenderUserID END
      )
      SELECT
        rm.OtherUserID,
        rm.MessageID,
        rm.MessageContent,
        rm.FakeChatMediaID,
        rm.SentAt,
        rm.SenderUserID,
        rm.Status,
        media.MediaType,
        media.MimeType,
        COALESCE(unread.UnreadCount, 0) AS UnreadCount
      FROM RankedMessages rm
      LEFT JOIN dbo.FakeChatMediaLibrary media ON media.MediaID = rm.FakeChatMediaID
      LEFT JOIN UnreadCounts unread ON unread.OtherUserID = rm.OtherUserID
      WHERE rm.rn = 1
      ORDER BY rm.SentAt DESC;
    `;

    const result = await pool
      .request()
      .input('UserID', sql.VarChar(255), normalizedUserId)
      .query(query);

    const rows = result.recordset ?? [];
    const idSet = new Set<string>();
    for (const row of rows) {
      const key = normalizeUserId(String(row.OtherUserID));
      if (key) {
        idSet.add(key);
      }
    }
    const snapshots = await fetchMessageUserSnapshots(pool, idSet);

    const previews = rows
      .map((row) => {
        const otherUserKey = normalizeUserId(String(row.OtherUserID));
        if (!otherUserKey) {
          return null;
        }
        const snapshot = snapshots.get(otherUserKey);
        if (!snapshot) {
          return null;
        }
        const previewContent = summarizeMessagePreview(
          row.MessageContent,
          row.FakeChatMediaID,
          row.MediaType,
          row.MimeType,
        );
        return {
          UserID: snapshot.id,
          Username: snapshot.username ?? 'Unknown user',
          ProfilePictureUrl: snapshot.profilePictureUrl ?? null,
          IsOnline: snapshot.isOnline ?? null,
          City: snapshot.city ?? null,
          Country: snapshot.country ?? null,
          AccountKind: snapshot.accountKind ?? null,
          LastMessageContent: previewContent,
          LastMessageSentAt: row.SentAt,
          LastMessageSenderID: String(row.SenderUserID),
          LastMessageStatus: row.Status,
          Status: row.Status,
          UnreadCount: Number(row.UnreadCount ?? 0),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    res.status(200).json(previews);
  } catch (error) {
    next(error as Error);
  }
};

export const updateMessageStatus = async (req: Request, res: Response, next: NextFunction) => {
    const { messageId } = req.params;
  const { status: requestedStatus, actingUserId } = req.body;

  const validStatuses: DirectMessageStatusBE[] = ['pending', 'sent', 'delivered', 'read', 'accepted', 'denied', 'viewed'];
  const newStatus = requestedStatus as DirectMessageStatusBE | undefined;

  if (!newStatus || !validStatuses.includes(newStatus)) {
    return next(new OperationalError(`Invalid status: ${requestedStatus}. Must be one of: ${validStatuses.join(', ')}.`, 400));
  }
  const normalizedActingUserId = normalizeUserId(actingUserId);
  if (!normalizedActingUserId) {
    return next(new OperationalError('Acting user ID is required.', 401));
  }
  if (!messageId) {
    return next(new OperationalError('Message ID is required.', 400));
  }

  const messageIdTrimmed = String(messageId).trim();

  try {
    const pool = await getPool();

    const messageCheckResult = await pool
      .request()
      .input('MessageID', sql.VarChar(255), messageIdTrimmed)
      .query('SELECT RecipientUserID, SenderUserID, Status FROM DirectMessages WHERE MessageID = @MessageID');

    if (messageCheckResult.recordset.length === 0) {
      return next(new OperationalError('Message not found.', 404));
    }

    const dbRecord = messageCheckResult.recordset[0];
    const recipientId = normalizeUserId(String(dbRecord.RecipientUserID));
    const senderId = normalizeUserId(String(dbRecord.SenderUserID));
    if (!recipientId || !senderId) {
      return next(new OperationalError('Message participants are invalid.', 500));
    }

    const currentMessage: Pick<DirectMessageBE, 'Status' | 'RecipientUserID' | 'SenderUserID'> = {
      Status: dbRecord.Status as DirectMessageStatusBE,
      RecipientUserID: recipientId,
      SenderUserID: senderId,
    };
    const currentStatus = (currentMessage.Status ?? '').toLowerCase();
    const nextStatus = newStatus.toLowerCase() as DirectMessageStatusBE;

    if (currentStatus === nextStatus) {
      const selectQuery = `
        SELECT MessageID, SenderUserID, RecipientUserID, MessageContent, SentAt, Status
        FROM DirectMessages
        WHERE MessageID = @MessageIDToFetch;
      `;
      const noOpResult = await pool
        .request()
        .input('MessageIDToFetch', sql.VarChar(255), messageIdTrimmed)
        .query(selectQuery);
      if (noOpResult.recordset.length === 0) {
        return next(new OperationalError('Message not found for no-op return.', 404));
      }
      const hydratedSnapshots = await fetchMessageUserSnapshots(pool, [
        normalizeUserId(String(noOpResult.recordset[0].SenderUserID)) ?? '',
        normalizeUserId(String(noOpResult.recordset[0].RecipientUserID)) ?? '',
      ]);
      const senderSnapshot = normalizeUserId(String(noOpResult.recordset[0].SenderUserID));
      const recipientSnapshot = normalizeUserId(String(noOpResult.recordset[0].RecipientUserID));
      const fullMessage = {
        ...noOpResult.recordset[0],
        SenderUsername: senderSnapshot ? hydratedSnapshots.get(senderSnapshot)?.username ?? null : null,
        RecipientUsername: recipientSnapshot ? hydratedSnapshots.get(recipientSnapshot)?.username ?? null : null,
      };
      return res.status(200).json(fullMessage);
    }

    if (nextStatus === 'read') {
      if (currentMessage.RecipientUserID !== normalizedActingUserId) {
        return next(new OperationalError('Only the recipient can mark messages as read.', 403));
      }
      const allowedForRead = ['pending', 'sent', 'delivered', 'accepted', 'read'];
      if (!allowedForRead.includes(currentStatus)) {
        return next(new OperationalError(`Cannot mark message as read from status '${currentMessage.Status}'.`, 409));
      }
    } else if (nextStatus === 'viewed') {
      if (currentMessage.RecipientUserID !== normalizedActingUserId) {
        return next(new OperationalError('Only the recipient can mark messages as viewed.', 403));
      }
      const allowedForViewed = ['accepted', 'viewed'];
      if (!allowedForViewed.includes(currentStatus)) {
        return next(new OperationalError(`Messages must be 'accepted' or already 'viewed' to be marked as 'viewed'. Current status: ${currentMessage.Status}.`, 409));
      }
    } else if (nextStatus === 'accepted') {
      if (currentMessage.RecipientUserID !== normalizedActingUserId) {
        return next(new OperationalError('Only the recipient can accept a message.', 403));
      }
      if (currentStatus !== 'pending') {
        return next(new OperationalError(`Only 'pending' messages can be 'accepted'. Current status: ${currentMessage.Status}.`, 409));
      }
    } else if (nextStatus === 'denied') {
      if (currentMessage.RecipientUserID !== normalizedActingUserId) {
        return next(new OperationalError('Only the recipient can deny a message.', 403));
      }
      if (currentStatus !== 'pending') {
        return next(new OperationalError(`Only 'pending' messages can be 'denied'. Current status: ${currentMessage.Status}.`, 409));
      }
    } else if (nextStatus === 'pending') {
      return next(new OperationalError('Cannot manually set status to pending.', 400));
    }

    const query = `
      DECLARE @UpdatedMessage TABLE (
        MessageID VARCHAR(255), SenderUserID VARCHAR(255), RecipientUserID VARCHAR(255),
        MessageContent NVARCHAR(MAX), SentAt DATETIME2, Status VARCHAR(20)
      );
      UPDATE DirectMessages
      SET Status = @NewStatus, UpdatedAt = GETUTCDATE()
      OUTPUT inserted.MessageID, inserted.SenderUserID, inserted.RecipientUserID, inserted.MessageContent, inserted.SentAt, inserted.Status
      INTO @UpdatedMessage
      WHERE MessageID = @MessageID;
      SELECT * FROM @UpdatedMessage;
    `;
    const result = await pool
      .request()
      .input('MessageID', sql.VarChar(255), messageIdTrimmed)
      .input('NewStatus', sql.VarChar(20), nextStatus)
      .query(query);

    if (result.recordset.length === 0) {
      return next(new OperationalError('Failed to update message status or message not found (concurrency issue?).', 404));
    }

    const updatedMessageBase: DirectMessageBE = result.recordset[0];

    const participantSnapshots = await fetchMessageUserSnapshots(pool, [
      normalizeUserId(String(updatedMessageBase.SenderUserID)) ?? '',
      normalizeUserId(String(updatedMessageBase.RecipientUserID)) ?? '',
    ]);

    const senderSnapshotKey = normalizeUserId(String(updatedMessageBase.SenderUserID));
    const recipientSnapshotKey = normalizeUserId(String(updatedMessageBase.RecipientUserID));

    const fullUpdatedMessage: DirectMessageBE = {
      ...updatedMessageBase,
      SenderUsername: senderSnapshotKey ? participantSnapshots.get(senderSnapshotKey)?.username ?? null : null,
      RecipientUsername: recipientSnapshotKey ? participantSnapshots.get(recipientSnapshotKey)?.username ?? null : null,
    };

    res.status(200).json(fullUpdatedMessage);
  } catch (error) {
    next(error as Error);
  }
};
