"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markNotificationRead = exports.getNotifications = void 0;
const db_1 = require("../config/db");
const errorHandler_1 = require("../utils/errorHandler");
const getNotifications = async (req, res, next) => {
    const { userId } = req.params;
    if (!userId) {
        return next(new errorHandler_1.OperationalError('User ID is required.', 401));
    }
    try {
        const pool = await (0, db_1.getPool)();
        const query = `
      SELECT
        N.NotificationID AS id,
        N.UserID,
        N.Type AS type,
        N.SourceUserID AS sourceUserId,
        U.Username AS sourceUsername,
        N.EntityID AS entityId,
        N.Message AS message,
        N.IsRead AS isRead,
        N.CreatedAt AS createdAt,
        DM.MessageContent AS messageContent,
        DM.SenderUserID AS messageSenderUserID,
        DM.RecipientUserID AS messageRecipientUserID,
        VM.VoiceMessageID AS voiceMessageId,
        VM.SenderUserID AS voiceSenderUserID,
        VM.RecipientUserID AS voiceRecipientUserID,
        VM.Status AS voiceMessageStatus
      FROM Notifications N
      LEFT JOIN Users U ON U.UserID = N.SourceUserID
      LEFT JOIN DirectMessages DM ON DM.MessageID = TRY_CONVERT(uniqueidentifier, N.EntityID)
      LEFT JOIN VoiceMessages VM ON VM.VoiceMessageID = TRY_CONVERT(uniqueidentifier, N.EntityID)
      WHERE N.UserID = @UserID
      ORDER BY N.CreatedAt DESC
    `;
        const result = await pool
            .request()
            .input('UserID', db_1.sql.VarChar(255), userId)
            .query(query);
        res.status(200).json(result.recordset);
    }
    catch (error) {
        next(error);
    }
};
exports.getNotifications = getNotifications;
const markNotificationRead = async (req, res, next) => {
    const { notificationId } = req.params;
    if (!notificationId) {
        return next(new errorHandler_1.OperationalError('Notification ID is required.', 400));
    }
    try {
        const pool = await (0, db_1.getPool)();
        const result = await pool.request()
            .input('NotificationID', db_1.sql.VarChar(255), notificationId)
            .query(`
        IF COL_LENGTH('dbo.Notifications', 'UpdatedAt') IS NOT NULL
        BEGIN
          EXEC sp_executesql
            N'UPDATE Notifications
               SET IsRead = 1, UpdatedAt = GETUTCDATE()
             WHERE NotificationID = @NotificationID;',
            N'@NotificationID VARCHAR(255)',
            @NotificationID = @NotificationID;
        END
        ELSE
        BEGIN
          UPDATE Notifications
          SET IsRead = 1
          WHERE NotificationID = @NotificationID;
        END;
        SELECT @@ROWCOUNT AS Affected;
      `);
        const affected = result.recordset?.[0]?.Affected ?? 0;
        if (!affected) {
            return next(new errorHandler_1.OperationalError('Notification not found.', 404));
        }
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
};
exports.markNotificationRead = markNotificationRead;
