import type { Request, Response, NextFunction } from 'express';
import { getPool, sql } from '../config/db';
import { OperationalError } from '../utils/errorHandler';
import { generateId } from '../utils/generateId';
import type { VoiceMessageStatus, VoiceMessageSummary, VoiceMessageAudioPayload } from '../shared_types';

const MAX_DURATION_SECONDS = 30;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // 4MB safety cap for 30s opus recordings

const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const isGuid = (value: string): boolean => GUID_REGEX.test(value);

const normalizeUserId = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
};

const inferSqlIdentifierType = (userId: string) =>
  (isGuid(userId) ? sql.UniqueIdentifier : sql.VarChar(255));

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return null;
};

type RawVoiceMessageRow = {
  VoiceMessageID: string;
  SenderUserID: string;
  SenderUsername?: string | null;
  RecipientUserID: string;
  RecipientUsername?: string | null;
  DurationSeconds: number;
  Status: VoiceMessageStatus;
  CreatedAt: string | Date;
  HeardAt?: string | Date | null;
  DeletedAt?: string | Date | null;
};

const mapVoiceMessageRow = (row: RawVoiceMessageRow): VoiceMessageSummary => ({
  voiceMessageId: String(row.VoiceMessageID),
  senderUserId: String(row.SenderUserID),
  senderUsername: row.SenderUsername ?? null,
  recipientUserId: String(row.RecipientUserID),
  recipientUsername: row.RecipientUsername ?? null,
  durationSeconds: Number(row.DurationSeconds ?? 0),
  status: (row.Status ?? 'pending') as VoiceMessageStatus,
  createdAt: toIsoString(row.CreatedAt) ?? new Date().toISOString(),
  heardAt: toIsoString(row.HeardAt ?? null),
  deletedAt: toIsoString(row.DeletedAt ?? null),
});

const stripDataUrlPrefix = (dataUrl: string): { mimeTypeGuess: string | null; base64Payload: string } => {
  const match = /^data:([^;]+);base64,(.*)$/i.exec(dataUrl.trim());
  if (!match) {
    return { mimeTypeGuess: null, base64Payload: dataUrl.trim() };
  }
  return { mimeTypeGuess: match[1] ?? null, base64Payload: match[2] ?? '' };
};

const resolveMimeType = (explicit: unknown, fallbackGuess: string | null): string => {
  if (typeof explicit === 'string' && explicit.trim().length) {
    return explicit.trim().toLowerCase();
  }
  if (fallbackGuess && fallbackGuess.trim().length) {
    return fallbackGuess.trim().toLowerCase();
  }
  return 'audio/webm';
};

export const createVoiceMessage = async (req: Request, res: Response, next: NextFunction) => {
  const { senderUserId, recipientUserId, audioBase64, audioMimeType, durationSeconds } = req.body ?? {};

  const normalizedSender = normalizeUserId(senderUserId);
  const normalizedRecipient = normalizeUserId(recipientUserId);

  if (!normalizedSender) {
    return next(new OperationalError('Sender user ID is required.', 401));
  }
  if (!normalizedRecipient) {
    return next(new OperationalError('Recipient user ID is required.', 400));
  }

  const integerDuration = Number(durationSeconds ?? 0);
  if (!Number.isFinite(integerDuration) || integerDuration <= 0 || integerDuration > MAX_DURATION_SECONDS) {
    return next(new OperationalError(`Voice messages can be up to ${MAX_DURATION_SECONDS} seconds.`, 400));
  }

  if (typeof audioBase64 !== 'string' || !audioBase64.trim().length) {
    return next(new OperationalError('Audio payload is required.', 400));
  }

  const { mimeTypeGuess, base64Payload } = stripDataUrlPrefix(audioBase64);
  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(base64Payload, 'base64');
  } catch (error) {
    return next(new OperationalError('Failed to decode audio payload.', 400));
  }

  if (!audioBuffer || audioBuffer.length === 0) {
    return next(new OperationalError('Audio payload is empty.', 400));
  }

  if (audioBuffer.length > MAX_AUDIO_BYTES) {
    return next(new OperationalError('Voice message is too large. Try recording a shorter clip.', 413));
  }

  const resolvedMimeType = resolveMimeType(audioMimeType, mimeTypeGuess);

  try {
    const pool = await getPool();
    const senderType = inferSqlIdentifierType(normalizedSender);
    const recipientType = inferSqlIdentifierType(normalizedRecipient);

    const insertResult = await pool
      .request()
      .input('SenderUserID', senderType, normalizedSender)
      .input('RecipientUserID', recipientType, normalizedRecipient)
      .input('AudioData', sql.VarBinary(sql.MAX), audioBuffer)
      .input('AudioMimeType', sql.NVarChar(100), resolvedMimeType)
      .input('AudioSizeBytes', sql.BigInt, audioBuffer.length)
      .input('DurationSeconds', sql.Int, integerDuration)
      .query(`
        DECLARE @Inserted TABLE (
          VoiceMessageID UNIQUEIDENTIFIER,
          SenderUserID UNIQUEIDENTIFIER,
          RecipientUserID UNIQUEIDENTIFIER,
          DurationSeconds INT,
          Status VARCHAR(20),
          CreatedAt DATETIME2(7),
          HeardAt DATETIME2(7),
          DeletedAt DATETIME2(7)
        );

        INSERT INTO dbo.VoiceMessages (
          SenderUserID,
          RecipientUserID,
          AudioData,
          AudioMimeType,
          AudioSizeBytes,
          DurationSeconds
        )
        OUTPUT
          inserted.VoiceMessageID,
          inserted.SenderUserID,
          inserted.RecipientUserID,
          inserted.DurationSeconds,
          inserted.Status,
          inserted.CreatedAt,
          inserted.HeardAt,
          inserted.DeletedAt
        INTO @Inserted
        VALUES (
          @SenderUserID,
          @RecipientUserID,
          @AudioData,
          @AudioMimeType,
          @AudioSizeBytes,
          @DurationSeconds
        );

        SELECT
          i.VoiceMessageID,
          i.SenderUserID,
          s.Username AS SenderUsername,
          i.RecipientUserID,
          r.Username AS RecipientUsername,
          i.DurationSeconds,
          i.Status,
          i.CreatedAt,
          i.HeardAt,
          i.DeletedAt
        FROM @Inserted i
        LEFT JOIN dbo.Users s ON s.UserID = i.SenderUserID
        LEFT JOIN dbo.Users r ON r.UserID = i.RecipientUserID;
      `);

    const newRow = insertResult.recordset?.[0];
    if (!newRow) {
      return next(new OperationalError('Failed to store voice message.', 500));
    }

    const voiceMessage = mapVoiceMessageRow(newRow);
    const notificationId = generateId('notif_');
    const messageText = voiceMessage.senderUsername
      ? `${voiceMessage.senderUsername} sent you a voice message.`
      : 'You received a new voice message.';

    await pool
      .request()
      .input('NotificationID', sql.VarChar(255), notificationId)
      .input('UserID', sql.VarChar(255), normalizedRecipient)
      .input('Type', sql.VarChar(50), 'voice_message')
      .input('SourceUserID', sql.VarChar(255), normalizedSender)
      .input('EntityID', sql.VarChar(255), voiceMessage.voiceMessageId)
      .input('Message', sql.NVarChar(sql.MAX), messageText)
      .query(`
        INSERT INTO dbo.Notifications (NotificationID, UserID, Type, SourceUserID, EntityID, Message, IsRead, CreatedAt)
        VALUES (@NotificationID, @UserID, @Type, @SourceUserID, @EntityID, @Message, 0, GETUTCDATE());
      `);

    res.status(201).json(voiceMessage);
  } catch (error) {
    next(error as Error);
  }
};

export const listVoiceMessagesForRecipient = async (req: Request, res: Response, next: NextFunction) => {
  const { recipientUserId } = req.query;
  const normalizedRecipient = normalizeUserId(recipientUserId);

  if (!normalizedRecipient) {
    return next(new OperationalError('Recipient user ID is required.', 400));
  }

  try {
    const pool = await getPool();
    const paramType = inferSqlIdentifierType(normalizedRecipient);

    const result = await pool
      .request()
      .input('RecipientUserID', paramType, normalizedRecipient)
      .query(`
        SELECT
          vm.VoiceMessageID,
          vm.SenderUserID,
          s.Username AS SenderUsername,
          vm.RecipientUserID,
          r.Username AS RecipientUsername,
          vm.DurationSeconds,
          vm.Status,
          vm.CreatedAt,
          vm.HeardAt,
          vm.DeletedAt
        FROM dbo.VoiceMessages vm
        LEFT JOIN dbo.Users s ON s.UserID = vm.SenderUserID
        LEFT JOIN dbo.Users r ON r.UserID = vm.RecipientUserID
        WHERE vm.RecipientUserID = @RecipientUserID
          AND vm.Status IN ('pending', 'playing')
        ORDER BY vm.CreatedAt DESC;
      `);

    const messages = (result.recordset ?? []).map(mapVoiceMessageRow);
    res.status(200).json(messages);
  } catch (error) {
    next(error as Error);
  }
};

export const fetchVoiceMessageAudio = async (req: Request, res: Response, next: NextFunction) => {
  const { voiceMessageId } = req.params;
  const { recipientUserId } = req.query;

  const normalizedMessageId = normalizeUserId(voiceMessageId);
  const normalizedRecipient = normalizeUserId(recipientUserId);

  if (!normalizedMessageId || !normalizedRecipient) {
    return next(new OperationalError('Voice message lookup requires message and recipient IDs.', 400));
  }

  try {
    const pool = await getPool();
    const messageParamType = inferSqlIdentifierType(normalizedMessageId);
    const recipientParamType = inferSqlIdentifierType(normalizedRecipient);

    const result = await pool
      .request()
      .input('VoiceMessageID', messageParamType, normalizedMessageId)
      .input('RecipientUserID', recipientParamType, normalizedRecipient)
      .query(`
        DECLARE @Fetched TABLE (
          VoiceMessageID UNIQUEIDENTIFIER,
          SenderUserID UNIQUEIDENTIFIER,
          RecipientUserID UNIQUEIDENTIFIER,
          DurationSeconds INT,
          Status VARCHAR(20),
          CreatedAt DATETIME2(7),
          HeardAt DATETIME2(7),
          DeletedAt DATETIME2(7),
          AudioData VARBINARY(MAX),
          AudioMimeType NVARCHAR(100)
        );

        UPDATE vm
        SET
          Status = CASE WHEN vm.Status = 'pending' THEN 'playing' ELSE vm.Status END
        OUTPUT
          inserted.VoiceMessageID,
          inserted.SenderUserID,
          inserted.RecipientUserID,
          inserted.DurationSeconds,
          inserted.Status,
          inserted.CreatedAt,
          inserted.HeardAt,
          inserted.DeletedAt,
          inserted.AudioData,
          inserted.AudioMimeType
        INTO @Fetched
        FROM dbo.VoiceMessages vm
        WHERE vm.VoiceMessageID = @VoiceMessageID
          AND vm.RecipientUserID = @RecipientUserID
          AND vm.Status IN ('pending', 'playing');

        SELECT * FROM @Fetched;
      `);

    const fetched = result.recordset?.[0];
    if (!fetched) {
      return next(new OperationalError('Voice message not found or no longer available.', 404));
    }

    if (!fetched.AudioData) {
      return next(new OperationalError('Voice message has already been removed.', 410));
    }

    const payload: VoiceMessageAudioPayload = {
      voiceMessageId: normalizeUserId(fetched.VoiceMessageID) ?? normalizedMessageId,
      audioBase64: Buffer.from(fetched.AudioData).toString('base64'),
      audioMimeType: fetched.AudioMimeType ?? 'audio/webm',
      durationSeconds: Number(fetched.DurationSeconds ?? 0),
    };

    res.status(200).json(payload);
  } catch (error) {
    next(error as Error);
  }
};

export const acknowledgeVoiceMessage = async (req: Request, res: Response, next: NextFunction) => {
  const { voiceMessageId } = req.params;
  const { recipientUserId } = req.body ?? {};

  const normalizedMessageId = normalizeUserId(voiceMessageId);
  const normalizedRecipient = normalizeUserId(recipientUserId);

  if (!normalizedMessageId || !normalizedRecipient) {
    return next(new OperationalError('Voice message acknowledgement requires message and recipient IDs.', 400));
  }

  try {
    const pool = await getPool();
    const messageParamType = inferSqlIdentifierType(normalizedMessageId);
    const recipientParamType = inferSqlIdentifierType(normalizedRecipient);

    const updateResult = await pool
      .request()
      .input('VoiceMessageID', messageParamType, normalizedMessageId)
      .input('RecipientUserID', recipientParamType, normalizedRecipient)
      .query(`
        DECLARE @Updated TABLE (
          VoiceMessageID UNIQUEIDENTIFIER,
          SenderUserID UNIQUEIDENTIFIER,
          RecipientUserID UNIQUEIDENTIFIER,
          DurationSeconds INT,
          Status VARCHAR(20),
          CreatedAt DATETIME2(7),
          HeardAt DATETIME2(7),
          DeletedAt DATETIME2(7)
        );

        UPDATE vm
        SET
          Status = 'deleted',
          HeardAt = COALESCE(vm.HeardAt, SYSUTCDATETIME()),
          DeletedAt = SYSUTCDATETIME(),
          AudioData = NULL,
          AudioSizeBytes = 0
        OUTPUT
          inserted.VoiceMessageID,
          inserted.SenderUserID,
          inserted.RecipientUserID,
          inserted.DurationSeconds,
          inserted.Status,
          inserted.CreatedAt,
          inserted.HeardAt,
          inserted.DeletedAt
        INTO @Updated
        FROM dbo.VoiceMessages vm
        WHERE vm.VoiceMessageID = @VoiceMessageID
          AND vm.RecipientUserID = @RecipientUserID
          AND vm.Status IN ('pending', 'playing', 'heard');

        SELECT
          u.VoiceMessageID,
          u.SenderUserID,
          s.Username AS SenderUsername,
          u.RecipientUserID,
          r.Username AS RecipientUsername,
          u.DurationSeconds,
          u.Status,
          u.CreatedAt,
          u.HeardAt,
          u.DeletedAt
        FROM @Updated u
        LEFT JOIN dbo.Users s ON s.UserID = u.SenderUserID
        LEFT JOIN dbo.Users r ON r.UserID = u.RecipientUserID;
      `);

    const updatedRow = updateResult.recordset?.[0];
    if (!updatedRow) {
      return next(new OperationalError('Voice message not found or already dismissed.', 404));
    }

    const summary = mapVoiceMessageRow(updatedRow);

    const notificationId = generateId('notif_');
    const messageText = summary.recipientUsername
      ? `${summary.recipientUsername} listened to your voice message.`
      : 'Your voice message was heard and removed.';

    await pool
      .request()
      .input('NotificationID', sql.VarChar(255), notificationId)
      .input('UserID', sql.VarChar(255), summary.senderUserId)
      .input('Type', sql.VarChar(50), 'voice_message_heard')
      .input('SourceUserID', sql.VarChar(255), summary.recipientUserId)
      .input('EntityID', sql.VarChar(255), summary.voiceMessageId)
      .input('Message', sql.NVarChar(sql.MAX), messageText)
      .query(`
        INSERT INTO dbo.Notifications (NotificationID, UserID, Type, SourceUserID, EntityID, Message, IsRead, CreatedAt)
        VALUES (@NotificationID, @UserID, @Type, @SourceUserID, @EntityID, @Message, 0, GETUTCDATE());
      `);

    res.status(200).json(summary);
  } catch (error) {
    next(error as Error);
  }
};
