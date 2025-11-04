"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePhotoPublicStatus = exports.updateSharedPhotoStatus = exports.getSentSharedPhotos = exports.getReceivedSharedPhotos = exports.sendPhoto = exports.deletePhoto = exports.replacePhoto = exports.uploadPhoto = exports.deleteComment = exports.addComment = exports.toggleLikePhoto = exports.getPhotoDetails = exports.getUserPhotos = void 0;
const db_1 = require("../config/db");
const generateId_1 = require("../utils/generateId");
const errorHandler_1 = require("../utils/errorHandler");
const emailService_1 = require("../utils/emailService");
const admirerService_1 = require("../services/admirerService");
const SINGLE_MEDIA_NOT_SUPPORTED_ERROR = 'Single member media does not support this operation.';
const PREMIUM_MEMBERSHIP_TIERS = new Set(['platinum', 'unlimited']);
async function resolvePhotoOwnerKind(pool, userId) {
    const normalizedId = String(userId).trim();
    if (!normalizedId.length)
        return null;
    const coupleResult = await pool
        .request()
        .input('UserID', db_1.sql.VarChar(255), normalizedId)
        .query(`
      SELECT TOP 1 UserID
      FROM dbo.Users
      WHERE UserID = @UserID;
    `);
    if (coupleResult.recordset?.length) {
        return 'couple';
    }
    const singleResult = await pool
        .request()
        .input('UserID', db_1.sql.VarChar(255), normalizedId)
        .query(`
      SELECT TOP 1 UserID
      FROM dbo.SingleUsers
      WHERE UserID = @UserID;
    `);
    return singleResult.recordset?.length ? 'single' : null;
}
function mapSinglePhotoRows(rows) {
    return rows.map((row) => ({
        PhotoID: String(row.PhotoID),
        UserID: String(row.UserID),
        DataUrl: row.DataUrl,
        Caption: row.Caption ?? null,
        UploadedAt: row.UploadedAt,
        IsPublic: Boolean(row.IsPublic ?? 0),
        likeCount: 0,
        commentCount: 0,
    }));
}
const getUserPhotos = async (req, res, next) => {
    const { userId } = req.params;
    try {
        const photos = await (0, db_1.withSqlRetry)(async (pool) => {
            const ownerKind = await resolvePhotoOwnerKind(pool, userId);
            if (!ownerKind) {
                throw new errorHandler_1.OperationalError('User not found.', 404);
            }
            if (ownerKind === 'single') {
                const result = await pool
                    .request()
                    .input('UserID', db_1.sql.VarChar(255), userId)
                    .query(`
            SELECT
              sp.PhotoID,
              sp.UserID,
              sp.DataUrl,
              sp.Caption,
              sp.UploadedAt,
              sp.IsPublic
            FROM dbo.SinglePhotos sp
            WHERE sp.UserID = @UserID
            ORDER BY sp.UploadedAt DESC;
          `);
                return mapSinglePhotoRows(result.recordset ?? []);
            }
            const result = await pool
                .request()
                .input('UserID', db_1.sql.VarChar(255), userId)
                .query(`
          SELECT
            p.PhotoID,
            p.UserID,
            p.DataUrl,
            p.Caption,
            p.UploadedAt,
            p.IsPublic,
            COALESCE(likeAgg.likeCount, 0) AS likeCount,
            COALESCE(commentAgg.commentCount, 0) AS commentCount
          FROM dbo.Photos AS p
          LEFT JOIN (
            SELECT PhotoID, COUNT(*) AS likeCount
            FROM dbo.PhotoLikes
            GROUP BY PhotoID
          ) AS likeAgg ON likeAgg.PhotoID = p.PhotoID
          LEFT JOIN (
            SELECT PhotoID, COUNT(*) AS commentCount
            FROM dbo.PhotoComments
            GROUP BY PhotoID
          ) AS commentAgg ON commentAgg.PhotoID = p.PhotoID
          WHERE p.UserID = @UserID
          ORDER BY p.UploadedAt DESC;
        `);
            return result.recordset;
        });
        res.status(200).json(photos);
    }
    catch (error) {
        next(error);
    }
};
exports.getUserPhotos = getUserPhotos;
const getPhotoDetails = async (req, res, next) => {
    const { photoId } = req.params;
    const currentUserId = req.query.currentUserId || null;
    try {
        const photoQuery = `
      SELECT PhotoID, UserID, DataUrl, Caption, UploadedAt, IsPublic
      FROM Photos WHERE PhotoID = @PhotoID;
    `;
        const likesQuery = `
      SELECT pl.UserID, u.Username, u.ProfilePictureUrl
      FROM PhotoLikes pl
      LEFT JOIN Users u ON pl.UserID = u.UserID
      WHERE pl.PhotoID = @PhotoID;
    `;
        const commentsQuery = `
      SELECT pc.CommentID, pc.PhotoID, pc.UserID, u.Username, u.ProfilePictureUrl, pc.CommentText, pc.CreatedAt
      FROM PhotoComments pc
      LEFT JOIN Users u ON pc.UserID = u.UserID
      WHERE pc.PhotoID = @PhotoID
      ORDER BY pc.CreatedAt ASC;
    `;
        const normalizedPhotoId = String(photoId);
        const { photoResult, likesResult, commentsResult } = await (0, db_1.withSqlRetry)(async (pool) => {
            const buildRequest = () => pool.request().input('PhotoID', db_1.sql.VarChar(255), normalizedPhotoId);
            const [photoResult, likesResult, commentsResult] = await Promise.all([
                buildRequest().query(photoQuery),
                buildRequest().query(likesQuery),
                buildRequest().query(commentsQuery),
            ]);
            return { photoResult, likesResult, commentsResult };
        });
        if (photoResult.recordset.length === 0) {
            return next(new errorHandler_1.OperationalError('Photo not found.', 404));
        }
        const photo = photoResult.recordset[0];
        // Build typed arrays for internal logic
        const likesTyped = likesResult.recordset.map((r) => ({
            userId: r.UserID,
            username: r.Username
        }));
        const commentsTyped = commentsResult.recordset.map((r) => ({
            id: r.CommentID,
            photoId: r.PhotoID,
            userId: r.UserID,
            username: r.Username,
            profilePictureUrl: r.ProfilePictureUrl,
            commentText: r.CommentText,
            createdAt: r.CreatedAt
        }));
        // Build response arrays with BOTH naming styles for UI compatibility
        const responseLikes = likesResult.recordset.map((r) => ({
            // PascalCase
            UserID: r.UserID,
            Username: r.Username ?? 'Unknown',
            ProfilePictureUrl: r.ProfilePictureUrl ?? null,
            // camelCase
            userId: r.UserID,
            username: r.Username ?? 'Unknown',
            profilePictureUrl: r.ProfilePictureUrl ?? null,
        }));
        const responseComments = commentsResult.recordset.map((r) => ({
            // PascalCase
            CommentID: r.CommentID,
            PhotoID: r.PhotoID,
            UserID: r.UserID,
            Username: r.Username ?? 'Unknown',
            ProfilePictureUrl: r.ProfilePictureUrl ?? null,
            CommentText: r.CommentText,
            CreatedAt: r.CreatedAt,
            // camelCase
            id: r.CommentID,
            photoId: r.PhotoID,
            userId: r.UserID,
            username: r.Username ?? 'Unknown',
            profilePictureUrl: r.ProfilePictureUrl ?? null,
            commentText: r.CommentText,
            createdAt: r.CreatedAt,
        }));
        const userHasLiked = currentUserId
            ? likesTyped.some(l => l.userId === currentUserId)
            : false;
        res.status(200).json({
            photo,
            likes: responseLikes,
            comments: responseComments,
            userHasLiked
        });
    }
    catch (error) {
        next(error);
    }
};
exports.getPhotoDetails = getPhotoDetails;
const toggleLikePhoto = async (req, res, next) => {
    const { photoId } = req.params;
    const { userId } = req.body;
    if (!userId) {
        return next(new errorHandler_1.OperationalError('User ID is required to like a photo.', 401));
    }
    try {
        const pool = await (0, db_1.getPool)();
        const likeCheck = await pool.request()
            .input('PhotoID', db_1.sql.VarChar(255), photoId)
            .input('UserID', db_1.sql.VarChar(255), userId)
            .query('SELECT LikeID FROM PhotoLikes WHERE PhotoID = @PhotoID AND UserID = @UserID');
        if (likeCheck.recordset.length > 0) {
            await pool.request()
                .input('PhotoID', db_1.sql.VarChar(255), photoId)
                .input('UserID', db_1.sql.VarChar(255), userId)
                .query('DELETE FROM PhotoLikes WHERE PhotoID = @PhotoID AND UserID = @UserID');
            res.status(200).json({ message: 'Like removed' });
        }
        else {
            const likeId = (0, generateId_1.generateId)('like_');
            await pool.request()
                .input('LikeID', db_1.sql.VarChar(255), likeId)
                .input('PhotoID', db_1.sql.VarChar(255), photoId)
                .input('UserID', db_1.sql.VarChar(255), userId)
                .query('INSERT INTO PhotoLikes (LikeID, PhotoID, UserID, CreatedAt) VALUES (@LikeID, @PhotoID, @UserID, GETUTCDATE())');
            // Create notification for the photo owner (non-blocking)
            try {
                const photoOwnerResult = await pool.request().input('PhotoID', db_1.sql.VarChar(255), photoId).query('SELECT UserID, Caption FROM Photos WHERE PhotoID = @PhotoID');
                const likerResult = await pool.request().input('UserID', db_1.sql.VarChar(255), userId).query('SELECT Username FROM Users WHERE UserID = @UserID');
                if (photoOwnerResult.recordset.length > 0 && likerResult.recordset.length > 0) {
                    const photoOwnerId = photoOwnerResult.recordset[0].UserID;
                    const photoCaption = photoOwnerResult.recordset[0].Caption;
                    const likerUsername = likerResult.recordset[0].Username;
                    if (photoOwnerId !== userId) { // Don't notify for self-likes
                        const notificationId = (0, generateId_1.generateId)('notif_');
                        const message = `${likerUsername} liked your photo: "${photoCaption || 'Untitled'}".`;
                        await pool.request()
                            .input('NotificationID', db_1.sql.VarChar(255), notificationId)
                            .input('UserID', db_1.sql.VarChar(255), photoOwnerId)
                            .input('Type', db_1.sql.VarChar(50), 'photo_like')
                            .input('SourceUserID', db_1.sql.VarChar(255), userId)
                            .input('EntityID', db_1.sql.VarChar(255), photoId)
                            .input('Message', db_1.sql.NVarChar(500), message)
                            .query('INSERT INTO Notifications (NotificationID, UserID, Type, SourceUserID, EntityID, Message) VALUES (@NotificationID, @UserID, @Type, @SourceUserID, @EntityID, @Message)');
                    }
                }
            }
            catch (e) {
                console.warn('Notifications insert failed (like):', e?.message || e);
            }
            res.status(201).json({ message: 'Like added' });
        }
    }
    catch (error) {
        next(error);
    }
};
exports.toggleLikePhoto = toggleLikePhoto;
const addComment = async (req, res, next) => {
    const { photoId } = req.params;
    const { userId, commentText } = req.body;
    if (!userId || !commentText) {
        return next(new errorHandler_1.OperationalError('User ID and comment text are required.', 400));
    }
    if (commentText.trim().length === 0 || commentText.length > 1000) {
        return next(new errorHandler_1.OperationalError('Comment is empty or too long.', 400));
    }
    try {
        const pool = await (0, db_1.getPool)();
        const commentId = (0, generateId_1.generateId)('comment_');
        const insertQuery = `
      DECLARE @NewComment TABLE (
        CommentID VARCHAR(255), PhotoID VARCHAR(255), UserID VARCHAR(255), 
        CommentText NVARCHAR(1000), CreatedAt DATETIME2
      );
      INSERT INTO PhotoComments (CommentID, PhotoID, UserID, CommentText, CreatedAt)
      OUTPUT inserted.CommentID, inserted.PhotoID, inserted.UserID, inserted.CommentText, inserted.CreatedAt
      INTO @NewComment
      VALUES (@CommentID, @PhotoID, @UserID, @CommentText, GETUTCDATE());
      SELECT * FROM @NewComment;
    `;
        const result = await pool.request()
            .input('CommentID', db_1.sql.VarChar(255), commentId)
            .input('PhotoID', db_1.sql.VarChar(255), photoId)
            .input('UserID', db_1.sql.VarChar(255), userId)
            .input('CommentText', db_1.sql.NVarChar(1000), commentText.trim())
            .query(insertQuery);
        const base = result.recordset[0];
        const commenterResult = await pool.request()
            .input('UserID', db_1.sql.VarChar(255), userId)
            .query('SELECT Username, ProfilePictureUrl FROM Users WHERE UserID = @UserID');
        const username = commenterResult.recordset?.[0]?.Username ?? 'Unknown';
        const profilePictureUrl = commenterResult.recordset?.[0]?.ProfilePictureUrl ?? null;
        // Return BOTH naming styles to satisfy all consumers
        const newComment = {
            // camelCase
            id: base.CommentID,
            photoId: base.PhotoID,
            userId: base.UserID,
            username,
            profilePictureUrl,
            commentText: base.CommentText,
            createdAt: base.CreatedAt,
            // PascalCase
            CommentID: base.CommentID,
            PhotoID: base.PhotoID,
            UserID: base.UserID,
            Username: username,
            ProfilePictureUrl: profilePictureUrl,
            CommentText: base.CommentText,
            CreatedAt: base.CreatedAt,
        };
        // Notification (non-blocking)
        try {
            const ownerRes = await pool.request()
                .input('PhotoID', db_1.sql.VarChar(255), photoId)
                .query('SELECT UserID FROM Photos WHERE PhotoID = @PhotoID');
            const photoOwnerId = ownerRes.recordset?.[0]?.UserID;
            if (photoOwnerId && photoOwnerId !== userId) {
                const notifId = (0, generateId_1.generateId)('notif_');
                const message = `${username} commented on your photo: "${commentText.trim()}"`;
                await pool.request()
                    .input('NotificationID', db_1.sql.VarChar(255), notifId)
                    .input('UserID', db_1.sql.VarChar(255), photoOwnerId)
                    .input('Type', db_1.sql.VarChar(50), 'photo_comment')
                    .input('SourceUserID', db_1.sql.VarChar(255), userId)
                    .input('EntityID', db_1.sql.VarChar(255), photoId)
                    .input('Message', db_1.sql.NVarChar(500), message)
                    .query('INSERT INTO Notifications (NotificationID, UserID, Type, SourceUserID, EntityID, Message) VALUES (@NotificationID, @UserID, @Type, @SourceUserID, @EntityID, @Message)');
            }
        }
        catch (e) {
            console.warn('Notifications insert failed (comment):', e?.message || e);
        }
        res.status(201).json(newComment);
    }
    catch (error) {
        next(error);
    }
};
exports.addComment = addComment;
const deleteComment = async (req, res, next) => {
    const { commentId } = req.params;
    const { actingUserId } = req.body;
    if (!actingUserId) {
        return next(new errorHandler_1.OperationalError('User ID is required to delete a comment.', 401));
    }
    try {
        const pool = await (0, db_1.getPool)();
        const commentInfo = await pool.request()
            .input('CommentID', db_1.sql.VarChar(255), commentId)
            .query(`
        SELECT pc.UserID as CommentUserID, p.UserID as PhotoOwnerUserID 
        FROM PhotoComments pc
        JOIN Photos p ON pc.PhotoID = p.PhotoID
        WHERE pc.CommentID = @CommentID
      `);
        if (commentInfo.recordset.length === 0) {
            return next(new errorHandler_1.OperationalError('Comment not found.', 404));
        }
        const { CommentUserID, PhotoOwnerUserID } = commentInfo.recordset[0];
        if (actingUserId !== CommentUserID && actingUserId !== PhotoOwnerUserID) {
            return next(new errorHandler_1.OperationalError('Not authorized to delete this comment.', 403));
        }
        await pool.request()
            .input('CommentID', db_1.sql.VarChar(255), commentId)
            .query('DELETE FROM PhotoComments WHERE CommentID = @CommentID');
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
};
exports.deleteComment = deleteComment;
const uploadPhoto = async (req, res, next) => {
    const { userId } = req.params;
    const { dataUrl, caption, isPublic } = req.body;
    if (!dataUrl) {
        return next(new errorHandler_1.OperationalError('Photo data (dataUrl) is required.', 400));
    }
    if (!dataUrl.startsWith('data:image/')) {
        return next(new errorHandler_1.OperationalError('Invalid image data URL format.', 400));
    }
    const photoId = (0, generateId_1.generateId)('photo_');
    try {
        const pool = await (0, db_1.getPool)();
        const ownerKind = await resolvePhotoOwnerKind(pool, userId);
        if (!ownerKind) {
            return next(new errorHandler_1.OperationalError('User not found.', 404));
        }
        if (ownerKind === 'single') {
            const query = `
        DECLARE @NewPhoto TABLE (
            PhotoID UNIQUEIDENTIFIER,
            UserID UNIQUEIDENTIFIER,
            DataUrl NVARCHAR(MAX),
            Caption NVARCHAR(500),
            UploadedAt DATETIME2,
            IsPublic BIT
        );
        INSERT INTO dbo.SinglePhotos (UserID, DataUrl, Caption, UploadedAt, IsPublic)
        OUTPUT inserted.PhotoID, inserted.UserID, inserted.DataUrl, inserted.Caption, inserted.UploadedAt, inserted.IsPublic
        INTO @NewPhoto
        VALUES (TRY_CONVERT(UNIQUEIDENTIFIER, @UserID), @DataUrl, @Caption, SYSUTCDATETIME(), 0);
        SELECT * FROM @NewPhoto;
      `;
            const result = await pool
                .request()
                .input('UserID', db_1.sql.VarChar(255), userId)
                .input('DataUrl', db_1.sql.NVarChar(db_1.sql.MAX), dataUrl)
                .input('Caption', db_1.sql.NVarChar(500), caption || null)
                .query(query);
            const mapped = mapSinglePhotoRows(result.recordset ?? []);
            const responsePayload = mapped[0] ?? null;
            if (!responsePayload) {
                return next(new errorHandler_1.OperationalError('Failed to store photo.', 500));
            }
            res.status(201).json(responsePayload);
            return;
        }
        const membershipResult = await pool
            .request()
            .input('UserID', db_1.sql.VarChar(255), userId)
            .query(`
        SELECT TOP 1 MembershipType, MembershipExpiryDate
        FROM dbo.Users
        WHERE UserID = @UserID;
      `);
        const membershipRow = membershipResult.recordset?.[0] ?? null;
        const membershipTypeRaw = membershipRow?.MembershipType !== undefined && membershipRow?.MembershipType !== null
            ? String(membershipRow.MembershipType).trim().toLowerCase()
            : '';
        const membershipExpiryValue = membershipRow?.MembershipExpiryDate ?? null;
        const membershipExpiry = membershipExpiryValue instanceof Date
            ? membershipExpiryValue
            : membershipExpiryValue
                ? new Date(membershipExpiryValue)
                : null;
        const membershipExpiryTime = membershipExpiry instanceof Date ? membershipExpiry.getTime() : Number.NaN;
        const membershipExpired = Number.isFinite(membershipExpiryTime) && membershipExpiryTime <= Date.now();
        const isPlatinumActive = PREMIUM_MEMBERSHIP_TIERS.has(membershipTypeRaw) && !membershipExpired;
        if (!isPlatinumActive) {
            const countResult = await pool
                .request()
                .input('UserID', db_1.sql.VarChar(255), userId)
                .query(`
          SELECT COUNT(*) AS PhotoCount
          FROM dbo.Photos
          WHERE UserID = @UserID;
        `);
            const photoCount = Number(countResult.recordset?.[0]?.PhotoCount ?? 0);
            if (photoCount >= 3) {
                return next(new errorHandler_1.OperationalError('Free members can upload up to 3 photos. Upgrade to Platinum to unlock the full gallery.', 403));
            }
        }
        const query = `
      DECLARE @NewPhoto TABLE (
          PhotoID VARCHAR(255), UserID VARCHAR(255), DataUrl NVARCHAR(MAX), 
          Caption NVARCHAR(500), UploadedAt DATETIME2, IsPublic BIT
      );
      INSERT INTO Photos (PhotoID, UserID, DataUrl, Caption, UploadedAt, IsPublic)
      OUTPUT inserted.PhotoID, inserted.UserID, inserted.DataUrl, inserted.Caption, inserted.UploadedAt, inserted.IsPublic
      INTO @NewPhoto
      VALUES (@PhotoID, @UserID, @DataUrl, @Caption, GETUTCDATE(), @IsPublic);
      SELECT * FROM @NewPhoto;
    `;
        const result = await pool.request()
            .input('PhotoID', db_1.sql.VarChar(255), photoId)
            .input('UserID', db_1.sql.VarChar(255), userId)
            .input('DataUrl', db_1.sql.NVarChar(db_1.sql.MAX), dataUrl)
            .input('Caption', db_1.sql.NVarChar(500), caption || null)
            .input('IsPublic', db_1.sql.Bit, isPublic ?? false)
            .query(query);
        const newPhoto = result.recordset[0];
        const isPhotoPublic = Boolean(newPhoto?.IsPublic ??
            newPhoto?.isPublic ??
            isPublic);
        res.status(201).json(newPhoto);
        if (isPhotoPublic) {
            void (0, admirerService_1.notifyAdmirersOfEvent)(userId, {
                type: 'photo_upload',
                caption: caption ?? newPhoto?.Caption ?? null,
            });
        }
    }
    catch (error) {
        next(error);
    }
};
exports.uploadPhoto = uploadPhoto;
const replacePhoto = async (req, res, next) => {
    const { userId, photoId } = req.params;
    const { dataUrl } = req.body;
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        return next(new errorHandler_1.OperationalError('A valid image dataUrl is required.', 400));
    }
    try {
        const pool = await (0, db_1.getPool)();
        const ownerKind = await resolvePhotoOwnerKind(pool, userId);
        if (!ownerKind) {
            return next(new errorHandler_1.OperationalError('User not found.', 404));
        }
        if (ownerKind === 'single') {
            const query = `
        DECLARE @UpdatedPhoto TABLE (
          PhotoID UNIQUEIDENTIFIER,
          UserID UNIQUEIDENTIFIER,
          DataUrl NVARCHAR(MAX),
          Caption NVARCHAR(500),
          UploadedAt DATETIME2,
          UpdatedAt DATETIME2 NULL,
          IsPublic BIT
        );

        UPDATE dbo.SinglePhotos
        SET
          DataUrl = @DataUrl,
          UpdatedAt = SYSUTCDATETIME()
        OUTPUT inserted.PhotoID, inserted.UserID, inserted.DataUrl, inserted.Caption, inserted.UploadedAt, inserted.UpdatedAt, inserted.IsPublic
        INTO @UpdatedPhoto
        WHERE PhotoID = TRY_CONVERT(UNIQUEIDENTIFIER, @PhotoID)
          AND UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID);

        SELECT * FROM @UpdatedPhoto;
      `;
            const result = await pool
                .request()
                .input('PhotoID', db_1.sql.VarChar(255), photoId)
                .input('UserID', db_1.sql.VarChar(255), userId)
                .input('DataUrl', db_1.sql.NVarChar(db_1.sql.MAX), dataUrl)
                .query(query);
            if (result.recordset.length === 0) {
                return next(new errorHandler_1.OperationalError('Photo not found or user not authorized.', 404));
            }
            const mapped = mapSinglePhotoRows(result.recordset ?? []);
            const responsePayload = mapped[0] ?? null;
            if (!responsePayload) {
                return next(new errorHandler_1.OperationalError('Failed to update photo.', 500));
            }
            res.status(200).json(responsePayload);
            return;
        }
        const query = `
      DECLARE @UpdatedPhoto TABLE (
        PhotoID VARCHAR(255),
        UserID VARCHAR(255),
        DataUrl NVARCHAR(MAX),
        Caption NVARCHAR(500),
        UploadedAt DATETIME2,
        UpdatedAt DATETIME2 NULL,
        IsPublic BIT
      );

      DECLARE @UserGuid UNIQUEIDENTIFIER = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID);
      DECLARE @PhotoGuid UNIQUEIDENTIFIER = TRY_CONVERT(UNIQUEIDENTIFIER, @PhotoID);
      DECLARE @HasUserGuid BIT = CASE WHEN @UserGuid IS NULL THEN 0 ELSE 1 END;
      DECLARE @HasPhotoGuid BIT = CASE WHEN @PhotoGuid IS NULL THEN 0 ELSE 1 END;

      IF COL_LENGTH('dbo.Photos', 'UpdatedAt') IS NOT NULL
      BEGIN
        UPDATE Photos
        SET DataUrl = @DataUrl,
            UpdatedAt = SYSUTCDATETIME()
        OUTPUT inserted.PhotoID, inserted.UserID, inserted.DataUrl, inserted.Caption, inserted.UploadedAt, inserted.UpdatedAt, inserted.IsPublic
        INTO @UpdatedPhoto
        WHERE
          (
            (@HasPhotoGuid = 1 AND PhotoID = @PhotoGuid)
            OR PhotoID = @PhotoID
          )
          AND (
            (@HasUserGuid = 1 AND UserID = @UserGuid)
            OR UserID = @UserID
          );
      END
      ELSE
      BEGIN
        UPDATE Photos
        SET DataUrl = @DataUrl
        OUTPUT inserted.PhotoID, inserted.UserID, inserted.DataUrl, inserted.Caption, inserted.UploadedAt, NULL, inserted.IsPublic
        INTO @UpdatedPhoto
        WHERE
          (
            (@HasPhotoGuid = 1 AND PhotoID = @PhotoGuid)
            OR PhotoID = @PhotoID
          )
          AND (
            (@HasUserGuid = 1 AND UserID = @UserGuid)
            OR UserID = @UserID
          );
      END

      SELECT PhotoID, UserID, DataUrl, Caption, UploadedAt, UpdatedAt, IsPublic FROM @UpdatedPhoto;
    `;
        const result = await pool.request()
            .input('PhotoID', db_1.sql.VarChar(255), photoId)
            .input('UserID', db_1.sql.VarChar(255), userId)
            .input('DataUrl', db_1.sql.NVarChar(db_1.sql.MAX), dataUrl)
            .query(query);
        if (result.recordset.length === 0) {
            return next(new errorHandler_1.OperationalError('Photo not found or user not authorized to replace this photo.', 404));
        }
        res.status(200).json(result.recordset[0]);
    }
    catch (error) {
        next(error);
    }
};
exports.replacePhoto = replacePhoto;
const deletePhoto = async (req, res, next) => {
    const { photoId, userId: ownerUserId } = req.params;
    try {
        const pool = await (0, db_1.getPool)();
        const ownerKind = await resolvePhotoOwnerKind(pool, ownerUserId);
        if (!ownerKind) {
            return next(new errorHandler_1.OperationalError('User not found.', 404));
        }
        if (ownerKind === 'single') {
            const result = await pool
                .request()
                .input('PhotoID', db_1.sql.VarChar(255), photoId)
                .input('UserID', db_1.sql.VarChar(255), ownerUserId)
                .query(`
          DELETE FROM dbo.SinglePhotos
          WHERE PhotoID = TRY_CONVERT(UNIQUEIDENTIFIER, @PhotoID)
            AND UserID = TRY_CONVERT(UNIQUEIDENTIFIER, @UserID);
        `);
            if (result.rowsAffected[0] === 0) {
                return next(new errorHandler_1.OperationalError('Photo not found or user not authorized to delete this photo.', 404));
            }
            res.status(204).send();
            return;
        }
        const result = await pool.request()
            .input('PhotoID', db_1.sql.VarChar(255), photoId)
            .input('UserID', db_1.sql.VarChar(255), ownerUserId)
            .query('DELETE FROM Photos WHERE PhotoID = @PhotoID AND UserID = @UserID;');
        if (result.rowsAffected[0] === 0) {
            return next(new errorHandler_1.OperationalError('Photo not found or user not authorized to delete this photo.', 404));
        }
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
};
exports.deletePhoto = deletePhoto;
const sendPhoto = async (req, res, next) => {
    const { photoId, senderUserId, recipientUserId, recipientUsername, durationSeconds } = req.body;
    if (!photoId || !senderUserId || !(recipientUserId || recipientUsername) || durationSeconds === undefined) {
        return next(new errorHandler_1.OperationalError('Missing required fields.', 400));
    }
    if (typeof durationSeconds !== 'number' || durationSeconds <= 0) {
        return next(new errorHandler_1.OperationalError('DurationSeconds must be a positive number.', 400));
    }
    try {
        const pool = await (0, db_1.getPool)();
        // Fetch recipient details (ID, Username, Email)
        const userQuery = `SELECT UserID, Username, Email FROM Users WHERE ${recipientUserId ? 'UserID = @Identifier' : 'Username = @Identifier'}`;
        const userRes = await pool.request()
            .input('Identifier', db_1.sql.VarChar(255), recipientUserId || recipientUsername)
            .query(userQuery);
        if (userRes.recordset.length === 0) {
            return next(new errorHandler_1.OperationalError(`Recipient user "${recipientUserId || recipientUsername}" not found.`, 404));
        }
        const { UserID: actualRecipientUserId, Username: actualRecipientUsername, Email: recipientEmail } = userRes.recordset[0];
        const photoCheck = await pool.request().input('PhotoID', db_1.sql.VarChar(255), photoId).input('SenderUserID', db_1.sql.VarChar(255), senderUserId).query('SELECT p.Caption as PhotoCaption, p.DataUrl as PhotoDataUrl, u.Username as SenderUsername FROM Photos p JOIN Users u ON p.UserID = u.UserID WHERE p.PhotoID = @PhotoID AND p.UserID = @SenderUserID;');
        if (photoCheck.recordset.length === 0)
            return next(new errorHandler_1.OperationalError('Photo not found or sender does not own this photo.', 404));
        const { PhotoCaption, PhotoDataUrl, SenderUsername } = photoCheck.recordset[0];
        const shareId = (0, generateId_1.generateId)('share_');
        const sharedAt = new Date();
        const expiresAt = new Date(sharedAt.getTime() + durationSeconds * 1000);
        const insertQuery = `
      INSERT INTO SharedPhotos (ShareID, PhotoID, SenderUserID, RecipientUserID, DurationSeconds, SharedAt, ExpiresAt, Status)
      OUTPUT inserted.ShareID, inserted.PhotoID, inserted.SenderUserID, inserted.RecipientUserID, inserted.DurationSeconds, inserted.SharedAt, inserted.ExpiresAt, inserted.Status
      VALUES (@ShareID, @PhotoID, @SenderUserID, @RecipientUserID, @DurationSeconds, @SharedAt, @ExpiresAt, 'pending'); 
    `;
        const result = await pool.request()
            .input('ShareID', db_1.sql.VarChar(255), shareId)
            .input('PhotoID', db_1.sql.VarChar(255), photoId)
            .input('SenderUserID', db_1.sql.VarChar(255), senderUserId)
            .input('RecipientUserID', db_1.sql.VarChar(255), actualRecipientUserId)
            .input('DurationSeconds', db_1.sql.Int, durationSeconds)
            .input('SharedAt', db_1.sql.DateTime2, sharedAt)
            .input('ExpiresAt', db_1.sql.DateTime2, expiresAt)
            .query(insertQuery);
        const createdShareBase = result.recordset[0];
        const fullSharedItem = { ...createdShareBase, SenderUsername, RecipientUsername: actualRecipientUsername, PhotoDataUrl, PhotoCaption };
        // Send email notification (non-blocking)
        try {
            await (0, emailService_1.sendPhotoShareRequestEmail)(recipientEmail, actualRecipientUsername, SenderUsername);
        }
        catch (emailError) {
            console.warn(`[sendPhoto] Failed to send notification email to ${recipientEmail} for share ${shareId}:`, emailError.message);
        }
        res.status(201).json(fullSharedItem);
    }
    catch (error) {
        next(error);
    }
};
exports.sendPhoto = sendPhoto;
const getReceivedSharedPhotos = async (req, res, next) => {
    const { recipientUserId } = req.params;
    const statusFilter = req.query.status;
    try {
        const pool = await (0, db_1.getPool)();
        let query = `
      SELECT sp.ShareID, sp.PhotoID, sp.SenderUserID, s_user.Username as SenderUsername,
            sp.RecipientUserID, r_user.Username as RecipientUsername,
            sp.DurationSeconds, sp.SharedAt, sp.ExpiresAt, sp.Status, 
            p.DataUrl as PhotoDataUrl, p.Caption as PhotoCaption
      FROM SharedPhotos sp
      JOIN Users s_user ON sp.SenderUserID = s_user.UserID
      JOIN Users r_user ON sp.RecipientUserID = r_user.UserID
      JOIN Photos p ON sp.PhotoID = p.PhotoID
      WHERE sp.RecipientUserID = @RecipientUserID
    `;
        const request = pool.request().input('RecipientUserID', db_1.sql.VarChar(255), recipientUserId);
        if (statusFilter) {
            query += ' AND sp.Status = @StatusFilter';
            request.input('StatusFilter', db_1.sql.VarChar(50), statusFilter);
        }
        query += ' ORDER BY sp.SharedAt DESC;';
        const result = await request.query(query);
        const sharedPhotos = result.recordset;
        res.status(200).json(sharedPhotos);
    }
    catch (error) {
        next(error);
    }
};
exports.getReceivedSharedPhotos = getReceivedSharedPhotos;
const getSentSharedPhotos = async (req, res, next) => {
    const { senderUserId } = req.params;
    try {
        const pool = await (0, db_1.getPool)();
        const query = `
      SELECT sp.ShareID, sp.PhotoID, sp.SenderUserID, s_user.Username as SenderUsername,
            sp.RecipientUserID, r_user.Username as RecipientUsername,
            sp.DurationSeconds, sp.SharedAt, sp.ExpiresAt, sp.Status, 
            p.Caption as PhotoCaption, p.DataUrl as PhotoDataUrl
      FROM SharedPhotos sp
      JOIN Users s_user ON sp.SenderUserID = s_user.UserID
      JOIN Users r_user ON sp.RecipientUserID = r_user.UserID
      JOIN Photos p ON sp.PhotoID = p.PhotoID
      WHERE sp.SenderUserID = @SenderUserID
      ORDER BY sp.SharedAt DESC;
    `;
        const result = await pool.request().input('SenderUserID', db_1.sql.VarChar(255), senderUserId).query(query);
        const sentShares = result.recordset;
        res.status(200).json(sentShares);
    }
    catch (error) {
        next(error);
    }
};
exports.getSentSharedPhotos = getSentSharedPhotos;
const updateSharedPhotoStatus = async (req, res, next) => {
    const { shareId } = req.params;
    const { status, actingUserId } = req.body;
    const validStatuses = ['accepted', 'denied', 'viewed', 'expired', 'active'];
    if (!status || !validStatuses.includes(status))
        return next(new errorHandler_1.OperationalError(`Invalid status.`, 400));
    if (!actingUserId)
        return next(new errorHandler_1.OperationalError('Acting user ID is required.', 400));
    try {
        const pool = await (0, db_1.getPool)();
        const currentShareResult = await pool.request().input('ShareID', db_1.sql.VarChar(255), shareId).query('SELECT ShareID, RecipientUserID, Status FROM SharedPhotos WHERE ShareID = @ShareID;');
        if (currentShareResult.recordset.length === 0)
            return next(new errorHandler_1.OperationalError('Shared photo not found.', 404));
        const currentShare = currentShareResult.recordset[0];
        if ((status === 'accepted' || status === 'denied' || status === 'viewed') && currentShare.RecipientUserID !== actingUserId)
            return next(new errorHandler_1.OperationalError('Not authorized.', 403));
        if (currentShare.Status === 'expired')
            return next(new errorHandler_1.OperationalError('Cannot update expired share.', 409));
        if (currentShare.Status !== 'pending' && (status === 'accepted' || status === 'denied'))
            return next(new errorHandler_1.OperationalError(`Only pending shares can be ${status}.`, 409));
        if (status === 'viewed' && !(currentShare.Status === 'accepted' || currentShare.Status === 'viewed' || currentShare.Status === 'active'))
            return next(new errorHandler_1.OperationalError(`Photo must be accepted/active to be viewed.`, 409));
        const shouldRefreshExpiry = status === 'viewed';
        const updateQuery = `
      UPDATE SharedPhotos
      SET
        Status = @Status,
        UpdatedAt = GETUTCDATE(),
        ExpiresAt = CASE
          WHEN @RefreshExpiry = 1 THEN DATEADD(SECOND, DurationSeconds, SYSUTCDATETIME())
          ELSE ExpiresAt
        END
      WHERE ShareID = @ShareID;
    `;
        const updateResult = await pool
            .request()
            .input('ShareID', db_1.sql.VarChar(255), shareId)
            .input('Status', db_1.sql.VarChar(50), status)
            .input('RefreshExpiry', db_1.sql.Bit, shouldRefreshExpiry ? 1 : 0)
            .query(updateQuery);
        if (updateResult.rowsAffected[0] === 0)
            return next(new errorHandler_1.OperationalError('Failed to update status.', 404));
        const selectQuery = `
      SELECT sp.ShareID, sp.PhotoID, sp.SenderUserID, s_user.Username as SenderUsername,
            sp.RecipientUserID, r_user.Username as RecipientUsername,
            sp.DurationSeconds, sp.SharedAt, sp.ExpiresAt, sp.Status, 
            p.DataUrl as PhotoDataUrl, p.Caption as PhotoCaption
      FROM SharedPhotos sp
      JOIN Users s_user ON sp.SenderUserID = s_user.UserID
      JOIN Users r_user ON sp.RecipientUserID = r_user.UserID
      JOIN Photos p ON sp.PhotoID = p.PhotoID
      WHERE sp.ShareID = @ShareID;
    `;
        const finalResult = await pool.request().input('ShareID', db_1.sql.VarChar(255), shareId).query(selectQuery);
        if (finalResult.recordset.length === 0)
            return next(new errorHandler_1.OperationalError('Updated share not found.', 500));
        res.status(200).json(finalResult.recordset[0]);
    }
    catch (error) {
        console.error("Error in updateSharedPhotoStatus:", error);
        next(error);
    }
};
exports.updateSharedPhotoStatus = updateSharedPhotoStatus;
const updatePhotoPublicStatus = async (req, res, next) => {
    const { userId, photoId } = req.params;
    const { isPublic } = req.body;
    if (typeof isPublic !== 'boolean')
        return next(new errorHandler_1.OperationalError('isPublic must be a boolean.', 400));
    try {
        const pool = await (0, db_1.getPool)();
        const ownerKind = await resolvePhotoOwnerKind(pool, userId);
        if (!ownerKind) {
            return next(new errorHandler_1.OperationalError('User not found.', 404));
        }
        if (ownerKind === 'single') {
            return next(new errorHandler_1.OperationalError(SINGLE_MEDIA_NOT_SUPPORTED_ERROR, 400));
        }
        const existingResult = await pool.request()
            .input('PhotoID', db_1.sql.VarChar(255), photoId)
            .input('UserID', db_1.sql.VarChar(255), userId)
            .query(`
        SELECT PhotoID, UserID, DataUrl, Caption, UploadedAt, IsPublic
        FROM Photos
        WHERE PhotoID = @PhotoID AND UserID = @UserID;
      `);
        if (existingResult.recordset.length === 0) {
            return next(new errorHandler_1.OperationalError('Photo not found or user not authorized.', 404));
        }
        const previousPhoto = existingResult.recordset[0];
        const wasPublic = Boolean(previousPhoto?.IsPublic ??
            previousPhoto?.isPublic);
        if (wasPublic === isPublic) {
            res.status(200).json(previousPhoto);
            return;
        }
        const query = `
      DECLARE @UpdatedPhoto TABLE (PhotoID VARCHAR(255), UserID VARCHAR(255), DataUrl NVARCHAR(MAX), Caption NVARCHAR(500), UploadedAt DATETIME2, IsPublic BIT);
      UPDATE Photos
      SET IsPublic = @IsPublic 
      OUTPUT inserted.PhotoID, inserted.UserID, inserted.DataUrl, inserted.Caption, inserted.UploadedAt, inserted.IsPublic
      INTO @UpdatedPhoto
      WHERE PhotoID = @PhotoID AND UserID = @UserID;
      SELECT * FROM @UpdatedPhoto;
    `;
        const result = await pool.request()
            .input('PhotoID', db_1.sql.VarChar(255), photoId)
            .input('UserID', db_1.sql.VarChar(255), userId)
            .input('IsPublic', db_1.sql.Bit, isPublic)
            .query(query);
        if (result.recordset.length === 0)
            return next(new errorHandler_1.OperationalError('Photo not found or user not authorized.', 404));
        const updatedPhoto = result.recordset[0];
        res.status(200).json(updatedPhoto);
        if (!wasPublic && isPublic) {
            const captionValue = updatedPhoto?.Caption ??
                updatedPhoto?.caption ??
                previousPhoto?.Caption ??
                null;
            void (0, admirerService_1.notifyAdmirersOfEvent)(userId, {
                type: 'photo_upload',
                caption: captionValue ?? null,
            });
        }
    }
    catch (error) {
        next(error);
    }
};
exports.updatePhotoPublicStatus = updatePhotoPublicStatus;
