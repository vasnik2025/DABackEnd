"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUserAndAssociations = deleteUserAndAssociations;
const db_1 = require("../config/db");
const isValidGuid = (value) => typeof value === 'string' &&
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
async function deleteUserAndAssociations(userId, options) {
    await (0, db_1.withSqlRetry)(async (pool) => {
        const request = pool.request();
        request.input('UserID', db_1.sql.VarChar(255), userId);
        if (options?.requestId && isValidGuid(options.requestId)) {
            request.input('RequestID', db_1.sql.UniqueIdentifier, options.requestId);
        }
        else {
            request.input('RequestID', db_1.sql.UniqueIdentifier, null);
        }
        await request.batch(`
      SET NOCOUNT ON;
      BEGIN TRY
        BEGIN TRANSACTION;

        DECLARE @UserGuid UNIQUEIDENTIFIER = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID);
        DECLARE @HasGuid BIT = CASE WHEN @UserGuid IS NULL THEN 0 ELSE 1 END;
        DECLARE @SingleExists BIT = 0;

        IF @HasGuid = 1 AND EXISTS (SELECT 1 FROM dbo.SingleUsers WHERE UserID = @UserGuid)
        BEGIN
          SET @SingleExists = 1;
        END;

        IF OBJECT_ID('dbo.PhotoComments', 'U') IS NOT NULL
        BEGIN
          DELETE FROM dbo.PhotoComments
          WHERE (@HasGuid = 1 AND UserID = @UserGuid) OR UserID = @UserID;

          IF OBJECT_ID('dbo.Photos', 'U') IS NOT NULL
          BEGIN
            DELETE PC
            FROM dbo.PhotoComments PC
            INNER JOIN dbo.Photos P ON P.PhotoID = PC.PhotoID
            WHERE (@HasGuid = 1 AND P.UserID = @UserGuid) OR P.UserID = @UserID;
          END
        END

        IF OBJECT_ID('dbo.PhotoLikes', 'U') IS NOT NULL
        BEGIN
          DELETE FROM dbo.PhotoLikes
          WHERE (@HasGuid = 1 AND UserID = @UserGuid) OR UserID = @UserID;

          IF OBJECT_ID('dbo.Photos', 'U') IS NOT NULL
          BEGIN
            DELETE PL
            FROM dbo.PhotoLikes PL
            INNER JOIN dbo.Photos P ON P.PhotoID = PL.PhotoID
            WHERE (@HasGuid = 1 AND P.UserID = @UserGuid) OR P.UserID = @UserID;
          END
        END

        IF OBJECT_ID('dbo.SharedPhotos', 'U') IS NOT NULL
          DELETE FROM dbo.SharedPhotos
          WHERE (@HasGuid = 1 AND SenderUserID = @UserGuid) OR SenderUserID = @UserID
             OR (@HasGuid = 1 AND RecipientUserID = @UserGuid) OR RecipientUserID = @UserID;

        IF OBJECT_ID('dbo.DirectMessages', 'U') IS NOT NULL
          DELETE FROM dbo.DirectMessages
          WHERE (@HasGuid = 1 AND SenderUserID = @UserGuid) OR SenderUserID = @UserID
             OR (@HasGuid = 1 AND RecipientUserID = @UserGuid) OR RecipientUserID = @UserID;

        IF OBJECT_ID('dbo.Notifications', 'U') IS NOT NULL
          DELETE FROM dbo.Notifications
          WHERE (@HasGuid = 1 AND UserID = @UserGuid) OR UserID = @UserID
             OR (@HasGuid = 1 AND SourceUserID = @UserGuid) OR SourceUserID = @UserID;

        IF OBJECT_ID('dbo.UserFavorites', 'U') IS NOT NULL
        BEGIN
          DELETE FROM dbo.UserFavorites
          WHERE (@HasGuid = 1 AND UserID = @UserGuid) OR UserID = @UserID;

          IF COL_LENGTH('dbo.UserFavorites', 'FavoriteUserID') IS NOT NULL
            DELETE FROM dbo.UserFavorites
            WHERE (@HasGuid = 1 AND FavoriteUserID = @UserGuid) OR FavoriteUserID = @UserID;
          ELSE IF COL_LENGTH('dbo.UserFavorites', 'FavoriteID') IS NOT NULL
            DELETE FROM dbo.UserFavorites
            WHERE (@HasGuid = 1 AND FavoriteID = @UserGuid) OR FavoriteID = @UserID;
        END

        IF OBJECT_ID('dbo.PaypalTransactions', 'U') IS NOT NULL
          DELETE PT
          FROM dbo.PaypalTransactions PT
          WHERE (@HasGuid = 1 AND PT.UserID = @UserGuid) OR PT.UserID = @UserID
             OR EXISTS (
                SELECT 1
                FROM dbo.PaypalOrders PO
                WHERE PO.OrderID = PT.PaypalOrderID
                  AND ((@HasGuid = 1 AND PO.UserID = @UserGuid) OR PO.UserID = @UserID)
             );

        IF OBJECT_ID('dbo.PaypalOrders', 'U') IS NOT NULL
          DELETE FROM dbo.PaypalOrders
          WHERE (@HasGuid = 1 AND UserID = @UserGuid) OR UserID = @UserID;

        IF OBJECT_ID('dbo.Photos', 'U') IS NOT NULL
          DELETE FROM dbo.Photos
          WHERE (@HasGuid = 1 AND UserID = @UserGuid) OR UserID = @UserID;

        IF EXISTS (SELECT 1 FROM dbo.Users WHERE UserID = @UserID OR (@HasGuid = 1 AND UserID = @UserGuid))
          DELETE FROM dbo.Users
          WHERE (@HasGuid = 1 AND UserID = @UserGuid) OR UserID = @UserID;

        IF @SingleExists = 1
        BEGIN
          IF OBJECT_ID('dbo.SinglePhotos', 'U') IS NOT NULL
            DELETE FROM dbo.SinglePhotos
            WHERE UserID = @UserGuid;

          IF OBJECT_ID('dbo.SingleProfiles', 'U') IS NOT NULL
            DELETE FROM dbo.SingleProfiles
            WHERE UserID = @UserGuid;

          IF OBJECT_ID('dbo.SingleReviews', 'U') IS NOT NULL
            DELETE FROM dbo.SingleReviews
            WHERE SingleUserID = @UserGuid
               OR CoupleUserID = @UserID
               OR (@HasGuid = 1 AND CoupleUserID = @UserGuid);

          IF OBJECT_ID('dbo.SingleInvites', 'U') IS NOT NULL
          BEGIN
            UPDATE dbo.SingleInvites
              SET InviteeUserID = NULL,
                  Status =
                    CASE
                      WHEN Status IN ('completed', 'awaiting_couple') THEN 'revoked'
                      ELSE Status
                    END,
                  UpdatedAt = SYSUTCDATETIME()
            WHERE InviteeUserID = @UserGuid;
          END;

          IF OBJECT_ID('dbo.SingleUsers', 'U') IS NOT NULL
            DELETE FROM dbo.SingleUsers
            WHERE UserID = @UserGuid;
        END;

        IF @RequestID IS NOT NULL
        BEGIN
          UPDATE dbo.AccountDeletionRequests
            SET Status = 'completed',
                CompletedAt = SYSUTCDATETIME()
          WHERE RequestID = @RequestID;
        END

        COMMIT TRANSACTION;
      END TRY
      BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
      END CATCH;
    `);
    });
}
