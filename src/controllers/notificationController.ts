// FIX: Changed type-only import to standard import to fix type resolution.
import type { Request, Response, NextFunction } from 'express';
import { getPool, sql } from "../config/db";
import { OperationalError } from "../utils/errorHandler";

export const getNotifications = async (req: Request, res: Response, next: NextFunction) => {
  const { userId } = req.params;
  if (!userId) {
    return next(new OperationalError('User ID is required.', 401));
  }
  try {
    const pool = await getPool();

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
      LEFT JOIN DirectMessages DM ON DM.MessageID = N.EntityID
      LEFT JOIN VoiceMessages VM ON VM.VoiceMessageID = TRY_CONVERT(uniqueidentifier, N.EntityID)
      WHERE N.UserID = @UserID
      ORDER BY N.CreatedAt DESC
    `;

    const result = await pool
      .request()
      .input('UserID', sql.VarChar(255), userId)
      .query(query);

    res.status(200).json(result.recordset);
  } catch (error) {
    next(error as Error);
  }
};

export const markNotificationRead = async (req: Request, res: Response, next: NextFunction) => {
  const { notificationId } = req.params;
  if (!notificationId) {
    return next(new OperationalError('Notification ID is required.', 400));
  }

  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('NotificationID', sql.VarChar(255), notificationId)
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
      return next(new OperationalError('Notification not found.', 404));
    }

    res.status(204).send();
  } catch (error) {
    next(error as Error);
  }
};
