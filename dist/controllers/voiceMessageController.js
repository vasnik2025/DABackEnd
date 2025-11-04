"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acknowledgeVoiceMessage = exports.fetchVoiceMessageAudio = exports.listVoiceMessagesForRecipient = exports.createVoiceMessage = void 0;
const db_1 = require("../config/db");
const errorHandler_1 = require("../utils/errorHandler");
const generateId_1 = require("../utils/generateId");
const MAX_DURATION_SECONDS = 30;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024; // 4MB safety cap for 30s opus recordings
const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const isGuid = (value) => GUID_REGEX.test(value);
const normalizeUserId = (raw) => {
    if (typeof raw !== 'string')
        return null;
    const trimmed = raw.trim();
    return trimmed.length ? trimmed : null;
};
const inferSqlIdentifierType = (userId) => (isGuid(userId) ? db_1.sql.UniqueIdentifier : db_1.sql.VarChar(255));
const toIsoString = (value) => {
    if (!value)
        return null;
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
const mapVoiceMessageRow = (row) => ({
    voiceMessageId: String(row.VoiceMessageID),
    senderUserId: String(row.SenderUserID),
    senderUsername: row.SenderUsername ?? null,
    recipientUserId: String(row.RecipientUserID),
    recipientUsername: row.RecipientUsername ?? null,
    durationSeconds: Number(row.DurationSeconds ?? 0),
    status: (row.Status ?? 'pending'),
    createdAt: toIsoString(row.CreatedAt) ?? new Date().toISOString(),
    heardAt: toIsoString(row.HeardAt ?? null),
    deletedAt: toIsoString(row.DeletedAt ?? null),
});
const stripDataUrlPrefix = (dataUrl) => {
    const match = /^data:([^;]+);base64,(.*)$/i.exec(dataUrl.trim());
    if (!match) {
        return { mimeTypeGuess: null, base64Payload: dataUrl.trim() };
    }
    return { mimeTypeGuess: match[1] ?? null, base64Payload: match[2] ?? '' };
};
const resolveMimeType = (explicit, fallbackGuess) => {
    if (typeof explicit === 'string' && explicit.trim().length) {
        return explicit.trim().toLowerCase();
    }
    if (fallbackGuess && fallbackGuess.trim().length) {
        return fallbackGuess.trim().toLowerCase();
    }
    return 'audio/webm';
};
const createVoiceMessage = async (req, res, next) => {
    const { senderUserId, recipientUserId, audioBase64, audioMimeType, durationSeconds } = req.body ?? {};
    const normalizedSender = normalizeUserId(senderUserId);
    const normalizedRecipient = normalizeUserId(recipientUserId);
    if (!normalizedSender) {
        return next(new errorHandler_1.OperationalError('Sender user ID is required.', 401));
    }
    if (!normalizedRecipient) {
        return next(new errorHandler_1.OperationalError('Recipient user ID is required.', 400));
    }
    const integerDuration = Number(durationSeconds ?? 0);
    if (!Number.isFinite(integerDuration) || integerDuration <= 0 || integerDuration > MAX_DURATION_SECONDS) {
        return next(new errorHandler_1.OperationalError(`Voice messages can be up to ${MAX_DURATION_SECONDS} seconds.`, 400));
    }
    if (typeof audioBase64 !== 'string' || !audioBase64.trim().length) {
        return next(new errorHandler_1.OperationalError('Audio payload is required.', 400));
    }
    const { mimeTypeGuess, base64Payload } = stripDataUrlPrefix(audioBase64);
    let audioBuffer;
    try {
        audioBuffer = Buffer.from(base64Payload, 'base64');
    }
    catch (error) {
        return next(new errorHandler_1.OperationalError('Failed to decode audio payload.', 400));
    }
    if (!audioBuffer || audioBuffer.length === 0) {
        return next(new errorHandler_1.OperationalError('Audio payload is empty.', 400));
    }
    if (audioBuffer.length > MAX_AUDIO_BYTES) {
        return next(new errorHandler_1.OperationalError('Voice message is too large. Try recording a shorter clip.', 413));
    }
    const resolvedMimeType = resolveMimeType(audioMimeType, mimeTypeGuess);
    try {
        const pool = await (0, db_1.getPool)();
        const senderType = inferSqlIdentifierType(normalizedSender);
        const recipientType = inferSqlIdentifierType(normalizedRecipient);
        const insertResult = await pool
            .request()
            .input('SenderUserID', senderType, normalizedSender)
            .input('RecipientUserID', recipientType, normalizedRecipient)
            .input('AudioData', db_1.sql.VarBinary(db_1.sql.MAX), audioBuffer)
            .input('AudioMimeType', db_1.sql.NVarChar(100), resolvedMimeType)
            .input('AudioSizeBytes', db_1.sql.BigInt, audioBuffer.length)
            .input('DurationSeconds', db_1.sql.Int, integerDuration)
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
            return next(new errorHandler_1.OperationalError('Failed to store voice message.', 500));
        }
        const voiceMessage = mapVoiceMessageRow(newRow);
        const notificationId = (0, generateId_1.generateId)('notif_');
        const messageText = voiceMessage.senderUsername
            ? `${voiceMessage.senderUsername} sent you a voice message.`
            : 'You received a new voice message.';
        await pool
            .request()
            .input('NotificationID', db_1.sql.VarChar(255), notificationId)
            .input('UserID', db_1.sql.VarChar(255), normalizedRecipient)
            .input('Type', db_1.sql.VarChar(50), 'voice_message')
            .input('SourceUserID', db_1.sql.VarChar(255), normalizedSender)
            .input('EntityID', db_1.sql.VarChar(255), voiceMessage.voiceMessageId)
            .input('Message', db_1.sql.NVarChar(db_1.sql.MAX), messageText)
            .query(`
        INSERT INTO dbo.Notifications (NotificationID, UserID, Type, SourceUserID, EntityID, Message, IsRead, CreatedAt)
        VALUES (@NotificationID, @UserID, @Type, @SourceUserID, @EntityID, @Message, 0, GETUTCDATE());
      `);
        res.status(201).json(voiceMessage);
    }
    catch (error) {
        next(error);
    }
};
exports.createVoiceMessage = createVoiceMessage;
const listVoiceMessagesForRecipient = async (req, res, next) => {
    const { recipientUserId } = req.query;
    const normalizedRecipient = normalizeUserId(recipientUserId);
    if (!normalizedRecipient) {
        return next(new errorHandler_1.OperationalError('Recipient user ID is required.', 400));
    }
    try {
        const pool = await (0, db_1.getPool)();
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
    }
    catch (error) {
        next(error);
    }
};
exports.listVoiceMessagesForRecipient = listVoiceMessagesForRecipient;
const fetchVoiceMessageAudio = async (req, res, next) => {
    const { voiceMessageId } = req.params;
    const { recipientUserId } = req.query;
    const normalizedMessageId = normalizeUserId(voiceMessageId);
    const normalizedRecipient = normalizeUserId(recipientUserId);
    if (!normalizedMessageId || !normalizedRecipient) {
        return next(new errorHandler_1.OperationalError('Voice message lookup requires message and recipient IDs.', 400));
    }
    try {
        const pool = await (0, db_1.getPool)();
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
            return next(new errorHandler_1.OperationalError('Voice message not found or no longer available.', 404));
        }
        if (!fetched.AudioData) {
            return next(new errorHandler_1.OperationalError('Voice message has already been removed.', 410));
        }
        const payload = {
            voiceMessageId: normalizeUserId(fetched.VoiceMessageID) ?? normalizedMessageId,
            audioBase64: Buffer.from(fetched.AudioData).toString('base64'),
            audioMimeType: fetched.AudioMimeType ?? 'audio/webm',
            durationSeconds: Number(fetched.DurationSeconds ?? 0),
        };
        res.status(200).json(payload);
    }
    catch (error) {
        next(error);
    }
};
exports.fetchVoiceMessageAudio = fetchVoiceMessageAudio;
const acknowledgeVoiceMessage = async (req, res, next) => {
    const { voiceMessageId } = req.params;
    const { recipientUserId } = req.body ?? {};
    const normalizedMessageId = normalizeUserId(voiceMessageId);
    const normalizedRecipient = normalizeUserId(recipientUserId);
    if (!normalizedMessageId || !normalizedRecipient) {
        return next(new errorHandler_1.OperationalError('Voice message acknowledgement requires message and recipient IDs.', 400));
    }
    try {
        const pool = await (0, db_1.getPool)();
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
            return next(new errorHandler_1.OperationalError('Voice message not found or already dismissed.', 404));
        }
        const summary = mapVoiceMessageRow(updatedRow);
        const notificationId = (0, generateId_1.generateId)('notif_');
        const messageText = summary.recipientUsername
            ? `${summary.recipientUsername} listened to your voice message.`
            : 'Your voice message was heard and removed.';
        await pool
            .request()
            .input('NotificationID', db_1.sql.VarChar(255), notificationId)
            .input('UserID', db_1.sql.VarChar(255), summary.senderUserId)
            .input('Type', db_1.sql.VarChar(50), 'voice_message_heard')
            .input('SourceUserID', db_1.sql.VarChar(255), summary.recipientUserId)
            .input('EntityID', db_1.sql.VarChar(255), summary.voiceMessageId)
            .input('Message', db_1.sql.NVarChar(db_1.sql.MAX), messageText)
            .query(`
        INSERT INTO dbo.Notifications (NotificationID, UserID, Type, SourceUserID, EntityID, Message, IsRead, CreatedAt)
        VALUES (@NotificationID, @UserID, @Type, @SourceUserID, @EntityID, @Message, 0, GETUTCDATE());
      `);
        res.status(200).json(summary);
    }
    catch (error) {
        next(error);
    }
};
exports.acknowledgeVoiceMessage = acknowledgeVoiceMessage;
