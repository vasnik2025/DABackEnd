"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInviterEmailContext = getInviterEmailContext;
exports.createSingleInvite = createSingleInvite;
exports.listSingleInvites = listSingleInvites;
exports.listAdminSingleInvites = listAdminSingleInvites;
exports.approveSingleInvite = approveSingleInvite;
exports.completeSingleActivation = completeSingleActivation;
exports.revokeSingleInvite = revokeSingleInvite;
exports.verifyInviteToken = verifyInviteToken;
exports.updateInviteStatus = updateInviteStatus;
exports.associateInviteWithUser = associateInviteWithUser;
exports.logVerificationDecision = logVerificationDecision;
exports.createVerificationSession = createVerificationSession;
exports.saveVerificationProfile = saveVerificationProfile;
exports.saveVerificationMedia = saveVerificationMedia;
exports.upsertSingleProfile = upsertSingleProfile;
exports.fetchSingleProfile = fetchSingleProfile;
exports.listActiveSinglesByCountry = listActiveSinglesByCountry;
exports.updateSingleProfileForUser = updateSingleProfileForUser;
exports.listSingleAvailabilitySlots = listSingleAvailabilitySlots;
exports.createSingleAvailabilitySlot = createSingleAvailabilitySlot;
exports.deleteSingleAvailabilitySlot = deleteSingleAvailabilitySlot;
exports.createSingleAvailabilityRequest = createSingleAvailabilityRequest;
exports.listAvailabilityRequestsForSingle = listAvailabilityRequestsForSingle;
exports.fetchActiveSingleDetail = fetchActiveSingleDetail;
exports.createSingleReview = createSingleReview;
exports.markInviteAsDeclined = markInviteAsDeclined;
exports.getRoleLabel = getRoleLabel;
exports.getSinglePlanProductCode = getSinglePlanProductCode;
exports.isActiveStatus = isActiveStatus;
const crypto_1 = require("crypto");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../config/db");
const errorHandler_1 = require("../utils/errorHandler");
const emailService_1 = require("../utils/emailService");
const ACTIVE_INVITE_STATUSES = ['pending', 'awaiting_verification', 'awaiting_activation', 'awaiting_couple'];
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://dateastrum.com').replace(/\/$/, '');
const INVITE_TOKEN_BYTES = 32;
const TOKEN_SALT_BYTES = 16;
const HASH_ALGORITHM = 'sha256';
const ROLE_SET = new Set(['single_male', 'single_female']);
const ACTIVE_STATUS_SET = new Set(ACTIVE_INVITE_STATUSES);
const ALL_STATUS_SET = new Set([
    'pending',
    'awaiting_verification',
    'awaiting_activation',
    'awaiting_couple',
    'completed',
    'revoked',
    'expired',
    'declined',
]);
const SINGLE_PLAN_PRODUCT = process.env.SINGLE_PLAN_PRODUCT_ID ?? 'single_monthly_15';
const SINGLE_ROLE_TO_LABEL = {
    single_male: 'Bull Invite',
    single_female: 'Unicorn Invite',
};
const SINGLE_ACTIVATION_TTL_HOURS = Math.max(1, Number(process.env.SINGLE_ACTIVATION_TTL_HOURS ?? 168));
const SINGLE_ACTIVATION_PATH = '/join/singles/activate';
let ensureInviteStatusColumnPromise = null;
let ensureSingleProfileContactColumnsPromise = null;
async function ensureInviteStatusColumnSize() {
    if (!ensureInviteStatusColumnPromise) {
        ensureInviteStatusColumnPromise = (0, db_1.withSqlRetry)(async (pool) => {
            const result = await pool
                .request()
                .query(`
          SELECT TOP 1 c.max_length
          FROM sys.columns c
          WHERE c.object_id = OBJECT_ID(N'dbo.SingleInvites')
            AND c.name = N'Status';
        `);
            const maxLength = Number(result.recordset?.[0]?.max_length ?? 0);
            if (maxLength > 0 && maxLength < 60) {
                await pool.request().query(`
          ALTER TABLE dbo.SingleInvites
            ALTER COLUMN Status NVARCHAR(30) NOT NULL;
        `);
            }
        }).catch((error) => {
            ensureInviteStatusColumnPromise = null;
            console.error('[singleMember] Failed to ensure SingleInvites.Status length', error);
            throw error;
        });
    }
    await ensureInviteStatusColumnPromise;
}
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function buildCoupleDisplayName(row) {
    const partner1 = row?.Partner1Nickname ? String(row.Partner1Nickname) : null;
    const partner2 = row?.Partner2Nickname ? String(row.Partner2Nickname) : null;
    if (partner1 && partner2)
        return `${partner1} & ${partner2}`;
    if (partner1 || partner2)
        return partner1 ?? partner2;
    return row?.Username ? String(row.Username) : null;
}
async function computeSingleReviewStats(pool, singleUserId) {
    const normalizedSingleUserId = normalizeSingleUserId(singleUserId);
    const statsResult = await pool
        .request()
        .input('SingleUserID', db_1.sql.UniqueIdentifier, normalizedSingleUserId)
        .query(`
      SELECT
        AVG(CAST(Score AS DECIMAL(5, 2))) AS AverageScore,
        COUNT(*) AS ReviewCount
      FROM dbo.SingleReviews
      WHERE SingleUserID = @SingleUserID;
    `);
    const averageScore = typeof statsResult.recordset?.[0]?.AverageScore === 'number'
        ? Number(statsResult.recordset[0].AverageScore)
        : null;
    const reviewCount = Number(statsResult.recordset?.[0]?.ReviewCount ?? 0);
    return { averageScore, reviewCount };
}
async function ensureSingleProfileContactColumns() {
    if (!ensureSingleProfileContactColumnsPromise) {
        ensureSingleProfileContactColumnsPromise = (0, db_1.withSqlRetry)(async (pool) => {
            const result = await pool
                .request()
                .query(`
          SELECT c.name
          FROM sys.columns c
          WHERE c.object_id = OBJECT_ID(N'dbo.SingleProfiles')
            AND c.name IN (N'PreferredNickname', N'ContactEmail', N'Country', N'City');
        `);
            const existing = new Set((result.recordset ?? []).map((row) => String(row.name)));
            if (!existing.has('PreferredNickname')) {
                await pool
                    .request()
                    .query(`
            ALTER TABLE dbo.SingleProfiles
              ADD PreferredNickname NVARCHAR(120) NULL;
          `);
            }
            if (!existing.has('ContactEmail')) {
                await pool
                    .request()
                    .query(`
            ALTER TABLE dbo.SingleProfiles
              ADD ContactEmail NVARCHAR(320) NULL;
          `);
            }
            if (!existing.has('Country')) {
                await pool
                    .request()
                    .query(`
            ALTER TABLE dbo.SingleProfiles
              ADD Country NVARCHAR(120) NULL;
          `);
            }
            if (!existing.has('City')) {
                await pool
                    .request()
                    .query(`
            ALTER TABLE dbo.SingleProfiles
              ADD City NVARCHAR(120) NULL;
          `);
            }
        }).catch((error) => {
            ensureSingleProfileContactColumnsPromise = null;
            console.error('[singleMember] Failed to ensure SingleProfiles contact columns', error);
            throw error;
        });
    }
    await ensureSingleProfileContactColumnsPromise;
}
async function generateUniqueSingleUsername(pool, email) {
    const localPart = email.split('@')[0]?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'single';
    const base = `single_${localPart}`.slice(0, 20) || `single_${(0, crypto_1.randomUUID)().slice(0, 6)}`;
    let candidate = base;
    for (let attempt = 0; attempt < 6; attempt += 1) {
        const check = await pool
            .request()
            .input('Username', db_1.sql.NVarChar(255), candidate)
            .query(`
        SELECT TOP 1 1
        FROM (
          SELECT Username FROM dbo.Users
          UNION ALL
          SELECT Username FROM dbo.SingleUsers
        ) AS allUsernames
        WHERE LOWER(allUsernames.Username) = LOWER(@Username);
      `);
        if (!check.recordset?.length) {
            return candidate;
        }
        const suffix = Math.floor(Math.random() * 10000)
            .toString()
            .padStart(4, '0');
        const baseTrimmed = base.slice(0, Math.max(4, 16));
        candidate = `${baseTrimmed}${suffix}`;
    }
    return `single_${(0, crypto_1.randomUUID)().replace(/-/g, '').slice(0, 10)}`;
}
function generateTokenArtifacts(inviteId) {
    const rawTokenBytes = (0, crypto_1.randomBytes)(INVITE_TOKEN_BYTES);
    const rawToken = rawTokenBytes.toString('base64url');
    const salt = (0, crypto_1.randomBytes)(TOKEN_SALT_BYTES);
    const hash = (0, crypto_1.createHash)(HASH_ALGORITHM).update(rawToken).update(salt).digest();
    const combinedToken = `${inviteId}.${rawToken}`;
    return { combinedToken, rawToken, salt, hash };
}
function hashTokenWithSalt(rawToken, salt) {
    return (0, crypto_1.createHash)(HASH_ALGORITHM).update(rawToken).update(salt).digest();
}
function buffersEqual(a, b) {
    if (a.length !== b.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(a, b);
}
function coerceInviteStatus(value) {
    const normalized = String(value ?? '').toLowerCase();
    if (ALL_STATUS_SET.has(normalized)) {
        return normalized;
    }
    return 'pending';
}
async function fetchUserSnapshot(userId) {
    const result = await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('UserID', db_1.sql.UniqueIdentifier, userId)
        .query(`
        SELECT TOP 1
          UserID,
          AccountKind,
          IsEmailVerified,
          IsPartnerEmailVerified,
          MembershipType,
          MembershipExpiryDate,
          Username,
          Email
        FROM dbo.Users
        WHERE UserID = @UserID;
      `));
    return result.recordset?.[0] ?? null;
}
async function getInviterEmailContext(userId) {
    const snapshot = await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('UserID', db_1.sql.UniqueIdentifier, userId)
        .query(`
        SELECT TOP 1
          Username,
          Partner1Nickname,
          Partner2Nickname,
          Email,
          PartnerEmail
        FROM dbo.Users
        WHERE UserID = @UserID;
      `));
    const row = snapshot.recordset?.[0] ?? null;
    if (!row) {
        return {
            displayName: 'A DateAstrum couple',
            primaryEmail: null,
            partnerEmail: null,
        };
    }
    const partner1 = row.Partner1Nickname ?? null;
    const partner2 = row.Partner2Nickname ?? null;
    let displayName;
    if (partner1 && partner2) {
        displayName = `${partner1} & ${partner2}`;
    }
    else if (partner1 || partner2) {
        displayName = partner1 || partner2;
    }
    else if (row.Username) {
        displayName = String(row.Username);
    }
    else if (row.Email) {
        displayName = String(row.Email);
    }
    else {
        displayName = 'A DateAstrum couple';
    }
    return {
        displayName,
        primaryEmail: row.Email ?? null,
        partnerEmail: row.PartnerEmail ?? null,
    };
}
async function ensureCoupleEligible(userId) {
    const record = await fetchUserSnapshot(userId);
    if (!record) {
        throw new errorHandler_1.OperationalError('Inviter not found.', 404);
    }
    const accountKind = String(record.AccountKind ?? 'couple').toLowerCase();
    if (accountKind !== 'couple') {
        throw new errorHandler_1.OperationalError('Only coupled accounts can create invites.', 403);
    }
    const isEmailVerified = Boolean(record.IsEmailVerified);
    const isPartnerEmailVerified = Boolean(record.IsPartnerEmailVerified);
    if (!isEmailVerified || !isPartnerEmailVerified) {
        throw new errorHandler_1.OperationalError('Verify both partner emails before inviting singles.', 409);
    }
    const membershipType = String(record.MembershipType ?? '').trim().toLowerCase();
    const hasPaidMembership = membershipType.length > 0 && membershipType !== 'free';
    const expiryRaw = record.MembershipExpiryDate ?? null;
    const expiryDate = expiryRaw instanceof Date
        ? expiryRaw
        : expiryRaw
            ? new Date(expiryRaw)
            : null;
    const membershipExpired = expiryDate ? expiryDate.getTime() <= Date.now() : false;
    if (!hasPaidMembership || membershipExpired) {
        throw new errorHandler_1.OperationalError('An active paid membership is required to invite singles.', 402);
    }
    return record;
}
async function getActiveInviteCount(inviterUserId) {
    const result = await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('InviterUserID', db_1.sql.VarChar(255), inviterUserId)
        .query(`
        SELECT COUNT_BIG(*) AS ActiveCount
        FROM dbo.SingleInvites
        WHERE InviterUserID = @InviterUserID
          AND Status IN ('pending', 'awaiting_verification', 'awaiting_activation', 'awaiting_couple');
      `));
    return Number(result.recordset?.[0]?.ActiveCount ?? 0);
}
async function recordInviteEvent(inviteId, eventType, actorUserId, metadata) {
    await (0, db_1.withSqlRetry)((pool) => {
        const request = pool
            .request()
            .input('EventID', db_1.sql.UniqueIdentifier, (0, crypto_1.randomUUID)())
            .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
            .input('EventType', db_1.sql.NVarChar(40), eventType)
            .input('ActorUserID', db_1.sql.VarChar(255), actorUserId ?? null)
            .input('ActorType', db_1.sql.NVarChar(20), actorUserId ? 'user' : 'system')
            .input('EventMetadata', db_1.sql.NVarChar(db_1.sql.MAX), metadata ? JSON.stringify(metadata) : null);
        return request.query(`
      INSERT INTO dbo.SingleInviteEvents (EventID, InviteID, EventType, ActorUserID, ActorType, EventMetadata)
      VALUES (@EventID, @InviteID, @EventType, @ActorUserID, @ActorType, @EventMetadata);
    `);
    });
}
async function createSingleInvite(payload) {
    const { inviterUserId, inviteeEmail, requestedRole, expiresAt, ipAddress, userAgent } = payload;
    const normalizedRole = requestedRole.toLowerCase();
    if (!ROLE_SET.has(normalizedRole)) {
        throw new errorHandler_1.OperationalError('Invalid role specified.', 400);
    }
    const normalizedEmail = normalizeEmail(inviteeEmail);
    await ensureCoupleEligible(inviterUserId);
    const activeCount = await getActiveInviteCount(inviterUserId);
    const maxPendingInvites = Number(process.env.SINGLE_INVITES_MAX_ACTIVE ?? 3);
    if (activeCount >= maxPendingInvites) {
        throw new errorHandler_1.OperationalError(`You already have ${activeCount} active invites. Please revoke one before creating another.`, 429);
    }
    const inviteId = (0, crypto_1.randomUUID)();
    const { combinedToken, rawToken, salt, hash } = generateTokenArtifacts(inviteId);
    await (0, db_1.withSqlRetry)((pool) => {
        const request = pool
            .request()
            .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
            .input('InviterUserID', db_1.sql.VarChar(255), inviterUserId)
            .input('InviteeEmail', db_1.sql.NVarChar(320), inviteeEmail)
            .input('TokenHash', db_1.sql.VarBinary(64), hash)
            .input('TokenSalt', db_1.sql.VarBinary(32), salt)
            .input('RequestedRole', db_1.sql.NVarChar(20), normalizedRole)
            .input('Status', db_1.sql.NVarChar(30), 'pending')
            .input('ExpiresAt', db_1.sql.DateTime2, expiresAt)
            .input('CreatedIpAddress', db_1.sql.NVarChar(45), ipAddress ?? null)
            .input('CreatedUserAgent', db_1.sql.NVarChar(400), userAgent ?? null);
        return request.query(`
      INSERT INTO dbo.SingleInvites (
        InviteID,
        InviterUserID,
        InviteeEmail,
        TokenHash,
        TokenSalt,
        RequestedRole,
        Status,
        ExpiresAt,
        CreatedIpAddress,
        CreatedUserAgent
      )
      VALUES (
        @InviteID,
        @InviterUserID,
        @InviteeEmail,
        @TokenHash,
        @TokenSalt,
        @RequestedRole,
        @Status,
        @ExpiresAt,
        @CreatedIpAddress,
        @CreatedUserAgent
      );
    `);
    });
    await recordInviteEvent(inviteId, 'invite.created', inviterUserId, {
        inviteeEmail: normalizedEmail,
        requestedRole: normalizedRole,
        expiresAt,
        plan: SINGLE_PLAN_PRODUCT,
    });
    const inviteUrl = `${FRONTEND_URL}/join/singles?token=${encodeURIComponent(combinedToken)}`;
    return {
        inviteId,
        inviteUrl,
        rawToken: combinedToken,
        expiresAt,
    };
}
async function listSingleInvites(inviterUserId) {
    const result = await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('InviterUserID', db_1.sql.VarChar(255), inviterUserId)
        .query(`
        SELECT
          InviteID,
          InviterUserID,
          InviteeEmail,
          RequestedRole,
          Status,
          ExpiresAt,
          ConsumedAt,
          InviteeUserID,
          CreatedAt,
          UpdatedAt
        FROM dbo.SingleInvites
        WHERE InviterUserID = @InviterUserID
        ORDER BY CreatedAt DESC;
      `));
    return (result.recordset ?? []).map((row) => ({
        inviteId: String(row.InviteID),
        inviterUserId: String(row.InviterUserID),
        inviteeEmail: row.InviteeEmail,
        requestedRole: row.RequestedRole,
        status: row.Status,
        expiresAt: row.ExpiresAt,
        consumedAt: row.ConsumedAt ?? null,
        inviteeUserId: row.InviteeUserID ?? null,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt,
    }));
}
async function listAdminSingleInvites(statusFilter) {
    const normalizedStatuses = statusFilter?.map((status) => String(status).toLowerCase()).filter((status) => ALL_STATUS_SET.has(status)) ?? [];
    const statusesToUse = normalizedStatuses.length ? normalizedStatuses : ['awaiting_verification'];
    const placeholders = statusesToUse.map((_, idx) => `@Status${idx}`);
    const result = await (0, db_1.withSqlRetry)((pool) => {
        const request = pool.request();
        statusesToUse.forEach((status, idx) => {
            request.input(`Status${idx}`, db_1.sql.NVarChar(30), status);
        });
        return request.query(`
      SELECT
        inv.InviteID,
        inv.InviterUserID,
        inv.InviteeEmail,
        inv.RequestedRole,
        inv.Status,
        inv.ExpiresAt,
        inv.InviteeUserID,
        inv.CreatedAt,
        inv.UpdatedAt,
        inviter.Username AS InviterUsername,
        inviter.Email AS InviterEmail,
        inviter.Partner1Nickname,
        inviter.Partner2Nickname,
        inviter.City AS InviterCity,
        inviter.Country AS InviterCountry,
        svs.SessionID,
        svs.Status AS VerificationStatus,
        svs.SubmittedProfile,
        svs.SubmittedMedia,
        svs.ModerationNotes,
        svs.DecisionUserID,
        svs.DecisionAt,
        svs.RejectionReason,
        svs.UpdatedAt AS VerificationUpdatedAt
      FROM dbo.SingleInvites inv
      LEFT JOIN dbo.Users inviter ON inviter.UserID = inv.InviterUserID
      LEFT JOIN dbo.SingleVerificationSessions svs ON svs.InviteID = inv.InviteID
      WHERE inv.Status IN (${placeholders.join(', ')})
      ORDER BY inv.UpdatedAt DESC;
    `);
    });
    const rows = result.recordset ?? [];
    return rows.map((row) => {
        const safeParse = (value) => {
            if (typeof value === 'string') {
                if (!value.length)
                    return null;
                try {
                    return JSON.parse(value);
                }
                catch {
                    return value;
                }
            }
            return value ?? null;
        };
        const partner1 = typeof row.Partner1Nickname === 'string' ? row.Partner1Nickname : null;
        const partner2 = typeof row.Partner2Nickname === 'string' ? row.Partner2Nickname : null;
        let inviterDisplayName = null;
        if (partner1 && partner2) {
            inviterDisplayName = `${partner1} & ${partner2}`;
        }
        else {
            inviterDisplayName = partner1 ?? partner2 ?? (row.InviterUsername ?? null);
        }
        return {
            inviteId: String(row.InviteID),
            inviterUserId: String(row.InviterUserID),
            inviterUsername: row.InviterUsername ?? null,
            inviterEmail: row.InviterEmail ?? null,
            inviterDisplayName,
            inviterCity: row.InviterCity ?? null,
            inviterCountry: row.InviterCountry ?? null,
            inviteeEmail: row.InviteeEmail,
            requestedRole: row.RequestedRole,
            status: coerceInviteStatus(row.Status),
            verificationSessionId: row.SessionID ? String(row.SessionID) : null,
            verificationStatus: row.VerificationStatus ?? null,
            submittedProfile: safeParse(row.SubmittedProfile),
            submittedMedia: safeParse(row.SubmittedMedia),
            moderationNotes: row.ModerationNotes ?? null,
            rejectionReason: row.RejectionReason ?? null,
            decisionUserId: row.DecisionUserID ?? null,
            decisionAt: row.DecisionAt ?? null,
            createdAt: row.CreatedAt,
            updatedAt: row.UpdatedAt,
            verificationUpdatedAt: row.VerificationUpdatedAt ?? null,
            expiresAt: row.ExpiresAt,
            inviteeUserId: row.InviteeUserID ?? null,
        };
    });
}
async function issueSingleActivationToken(invite, actorUserId) {
    const expiresAt = new Date(Date.now() + SINGLE_ACTIVATION_TTL_HOURS * 60 * 60 * 1000);
    const { combinedToken, salt, hash } = generateTokenArtifacts(invite.inviteId);
    await (0, db_1.withSqlRetry)(async (pool) => {
        await pool
            .request()
            .input('InviteID', db_1.sql.UniqueIdentifier, invite.inviteId)
            .query(`
        UPDATE dbo.SingleInviteActivations
        SET ConsumedAt = COALESCE(ConsumedAt, SYSUTCDATETIME())
        WHERE InviteID = @InviteID
          AND ConsumedAt IS NULL;
      `);
        const insert = pool.request();
        insert.input('InviteID', db_1.sql.UniqueIdentifier, invite.inviteId);
        insert.input('TokenHash', db_1.sql.VarBinary(64), hash);
        insert.input('TokenSalt', db_1.sql.VarBinary(32), salt);
        insert.input('ExpiresAt', db_1.sql.DateTime2(7), expiresAt);
        insert.input('CreatedBy', db_1.sql.VarChar(255), actorUserId ?? null);
        await insert.query(`
      INSERT INTO dbo.SingleInviteActivations (
        InviteID,
        TokenHash,
        TokenSalt,
        ExpiresAt,
        CreatedByUserID
      )
      VALUES (
        @InviteID,
        @TokenHash,
        @TokenSalt,
        @ExpiresAt,
        @CreatedBy
      );
    `);
    });
    await recordInviteEvent(invite.inviteId, 'invite.activation_token_created', actorUserId, {
        expiresAt,
    });
    const activationLink = `${FRONTEND_URL}${SINGLE_ACTIVATION_PATH}?token=${encodeURIComponent(combinedToken)}`;
    return { activationLink, expiresAt };
}
async function verifySingleActivationToken(rawCombinedToken) {
    if (!rawCombinedToken || typeof rawCombinedToken !== 'string') {
        return { status: 'invalid' };
    }
    const [inviteIdPart, tokenPart] = rawCombinedToken.split('.');
    if (!inviteIdPart || !tokenPart) {
        return { status: 'invalid' };
    }
    let activationRows = [];
    try {
        const result = await (0, db_1.withSqlRetry)((pool) => pool
            .request()
            .input('InviteID', db_1.sql.UniqueIdentifier, inviteIdPart)
            .query(`
          SELECT
            ActivationID,
            TokenHash,
            TokenSalt,
            ExpiresAt,
            ConsumedAt
          FROM dbo.SingleInviteActivations
          WHERE InviteID = @InviteID
          ORDER BY CreatedAt DESC;
        `));
        activationRows = result.recordset ?? [];
    }
    catch {
        return { status: 'invalid' };
    }
    if (!activationRows.length) {
        return { status: 'invalid' };
    }
    let activationMatch = null;
    for (const row of activationRows) {
        const saltBuffer = Buffer.isBuffer(row.TokenSalt)
            ? row.TokenSalt
            : Buffer.from(row.TokenSalt ?? [], 'binary');
        const storedHash = Buffer.isBuffer(row.TokenHash)
            ? row.TokenHash
            : Buffer.from(row.TokenHash ?? [], 'binary');
        const computedHash = hashTokenWithSalt(tokenPart, saltBuffer);
        if (buffersEqual(storedHash, computedHash)) {
            activationMatch = row;
            break;
        }
    }
    if (!activationMatch) {
        return { status: 'invalid' };
    }
    if (activationMatch.ConsumedAt) {
        return { status: 'consumed' };
    }
    const expiresAt = activationMatch.ExpiresAt ? new Date(activationMatch.ExpiresAt) : null;
    if (!expiresAt || expiresAt.getTime() < Date.now()) {
        return { status: 'expired' };
    }
    const inviteResult = await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('InviteID', db_1.sql.UniqueIdentifier, inviteIdPart)
        .query(`
        SELECT TOP 1
          InviteID,
          InviterUserID,
          InviteeEmail,
          RequestedRole,
          Status,
          ExpiresAt,
          ConsumedAt,
          InviteeUserID,
          CreatedAt,
          UpdatedAt
        FROM dbo.SingleInvites
        WHERE InviteID = @InviteID;
      `));
    const inviteRow = inviteResult.recordset?.[0];
    if (!inviteRow) {
        return { status: 'invalid' };
    }
    const invite = {
        inviteId: String(inviteRow.InviteID),
        inviterUserId: String(inviteRow.InviterUserID),
        inviteeEmail: inviteRow.InviteeEmail,
        requestedRole: inviteRow.RequestedRole,
        status: coerceInviteStatus(inviteRow.Status),
        expiresAt: inviteRow.ExpiresAt,
        consumedAt: inviteRow.ConsumedAt ?? null,
        inviteeUserId: inviteRow.InviteeUserID ?? null,
        createdAt: inviteRow.CreatedAt,
        updatedAt: inviteRow.UpdatedAt,
    };
    return {
        status: 'valid',
        invite,
        activationId: String(activationMatch.ActivationID),
        expiresAt,
    };
}
async function createInviteeUserAccount(invite, passwordHash) {
    const normalizedEmail = normalizeEmail(invite.inviteeEmail);
    const userId = await (0, db_1.withSqlRetry)(async (pool) => {
        const coupleConflict = await pool
            .request()
            .input('Email', db_1.sql.NVarChar(320), normalizedEmail)
            .query(`
        SELECT TOP 1
          UserID,
          AccountKind
        FROM dbo.Users
        WHERE LOWER(Email) = @Email;
      `);
        if (coupleConflict.recordset?.length) {
            throw new errorHandler_1.OperationalError('This email is already associated with a couple account.', 409);
        }
        const existingSingleResult = await pool
            .request()
            .input('Email', db_1.sql.NVarChar(320), normalizedEmail)
            .query(`
        SELECT TOP 1
          UserID
        FROM dbo.SingleUsers
        WHERE LOWER(Email) = @Email;
      `);
        const existingSingle = existingSingleResult.recordset?.[0];
        let userIdToLink;
        if (existingSingle) {
            userIdToLink = String(existingSingle.UserID);
            await pool
                .request()
                .input('UserID', db_1.sql.UniqueIdentifier, userIdToLink)
                .input('PasswordHash', db_1.sql.NVarChar(255), passwordHash)
                .input('InviteSource', db_1.sql.VarChar(255), invite.inviterUserId ?? null)
                .query(`
          UPDATE dbo.SingleUsers
          SET PasswordHash = @PasswordHash,
              InviteSourceUserID = COALESCE(InviteSourceUserID, @InviteSource),
              IsEmailVerified = 1,
              UpdatedAt = SYSUTCDATETIME()
          WHERE UserID = @UserID;
        `);
        }
        else {
            const username = await generateUniqueSingleUsername(pool, normalizedEmail);
            userIdToLink = (0, crypto_1.randomUUID)();
            const insertRequest = pool.request();
            insertRequest.input('UserID', db_1.sql.UniqueIdentifier, userIdToLink);
            insertRequest.input('InviteSource', db_1.sql.VarChar(255), invite.inviterUserId ?? null);
            insertRequest.input('Email', db_1.sql.NVarChar(320), invite.inviteeEmail);
            insertRequest.input('Username', db_1.sql.NVarChar(255), username);
            insertRequest.input('PasswordHash', db_1.sql.NVarChar(255), passwordHash);
            await insertRequest.query(`
        INSERT INTO dbo.SingleUsers (
          UserID,
          InviteSourceUserID,
          Email,
          Username,
          PasswordHash,
          CreatedAt,
          UpdatedAt,
          IsEmailVerified
        )
        VALUES (
          @UserID,
          @InviteSource,
          @Email,
          @Username,
          @PasswordHash,
          SYSUTCDATETIME(),
          SYSUTCDATETIME(),
          1
        );
      `);
        }
        await pool
            .request()
            .input('InviteID', db_1.sql.UniqueIdentifier, invite.inviteId)
            .input('InviteeUserID', db_1.sql.UniqueIdentifier, userIdToLink)
            .query(`
        UPDATE dbo.SingleInvites
        SET InviteeUserID = @InviteeUserID,
            UpdatedAt = SYSUTCDATETIME()
        WHERE InviteID = @InviteID;
      `);
        return userIdToLink;
    });
    return userId;
}
async function approveSingleInvite(inviteId, moderatorUserId) {
    const inviteResult = await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
        .query(`
        SELECT TOP 1
          InviteID,
          InviterUserID,
          InviteeEmail,
          RequestedRole,
          Status,
          ExpiresAt,
          ConsumedAt,
          InviteeUserID,
          CreatedAt,
          UpdatedAt
        FROM dbo.SingleInvites
        WHERE InviteID = @InviteID;
      `));
    const row = inviteResult.recordset?.[0];
    if (!row) {
        throw new errorHandler_1.OperationalError('Invite not found.', 404);
    }
    const invite = {
        inviteId: String(row.InviteID),
        inviterUserId: String(row.InviterUserID),
        inviteeEmail: row.InviteeEmail,
        requestedRole: row.RequestedRole,
        status: coerceInviteStatus(row.Status),
        expiresAt: row.ExpiresAt,
        consumedAt: row.ConsumedAt ?? null,
        inviteeUserId: row.InviteeUserID ?? null,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt,
    };
    if (invite.status === 'revoked' || invite.status === 'declined') {
        throw new errorHandler_1.OperationalError('Cannot approve an invite that has been revoked or declined.', 409);
    }
    const { activationLink, expiresAt } = await issueSingleActivationToken(invite, moderatorUserId);
    await updateInviteStatus(invite.inviteId, 'awaiting_activation', { moderator: moderatorUserId });
    const inviterContext = await getInviterEmailContext(invite.inviterUserId);
    return {
        status: 'awaiting_activation',
        activationLink,
        activationExpiresAt: expiresAt,
        inviteeEmail: invite.inviteeEmail,
        inviterDisplayName: inviterContext.displayName,
        roleLabel: getRoleLabel(invite.requestedRole),
    };
}
async function completeSingleActivation(rawToken, password) {
    const outcome = await verifySingleActivationToken(rawToken);
    if (outcome.status !== 'valid') {
        return { status: outcome.status };
    }
    const { invite, activationId } = outcome;
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    const userId = await createInviteeUserAccount(invite, passwordHash);
    await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('ActivationID', db_1.sql.UniqueIdentifier, activationId)
        .query(`
        UPDATE dbo.SingleInviteActivations
        SET ConsumedAt = SYSUTCDATETIME()
        WHERE ActivationID = @ActivationID;
      `));
    await recordInviteEvent(invite.inviteId, 'invite.user_linked', userId);
    await hydrateSingleProfileFromInvite(invite.inviteId, userId);
    await recordInviteEvent(invite.inviteId, 'invite.activation_completed', userId);
    await updateInviteStatus(invite.inviteId, 'awaiting_couple', { stage: 'activation_complete' });
    try {
        await (0, emailService_1.sendAdminNewMemberNotificationEmail)({
            accountType: 'single',
            primaryEmail: invite.inviteeEmail,
            role: invite.requestedRole,
            inviterUserId: invite.inviterUserId,
            inviteId: invite.inviteId,
            userId,
        });
    }
    catch (notifyError) {
        console.error('[singleActivation] Failed to notify admin about new single activation', notifyError);
    }
    return { status: 'activated', inviteId: invite.inviteId, userId };
}
async function hydrateSingleProfileFromInvite(inviteId, userId) {
    const result = await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
        .query(`
        SELECT TOP 1
          inv.InviterUserID,
          svs.SubmittedProfile
        FROM dbo.SingleInvites inv
        LEFT JOIN dbo.SingleVerificationSessions svs
          ON svs.InviteID = inv.InviteID
        WHERE inv.InviteID = @InviteID;
      `));
    const row = result.recordset?.[0];
    if (!row) {
        return;
    }
    let parsedProfile = null;
    if (row.SubmittedProfile) {
        try {
            parsedProfile = JSON.parse(row.SubmittedProfile);
        }
        catch {
            parsedProfile = row.SubmittedProfile;
        }
    }
    const sanitized = sanitizeSingleProfilePayload(parsedProfile);
    if (!sanitized || Object.keys(sanitized).length === 0) {
        return;
    }
    let availability = null;
    if (sanitized.availability !== undefined && sanitized.availability !== null) {
        availability = sanitized.availability;
    }
    await upsertSingleProfile(userId, row.InviterUserID ? String(row.InviterUserID) : null, {
        preferredNickname: typeof sanitized.nickname === 'string' && sanitized.nickname.length ? sanitized.nickname : null,
        contactEmail: typeof sanitized.contactEmail === 'string' && sanitized.contactEmail.length
            ? sanitized.contactEmail
            : null,
        country: sanitized.country ?? null,
        city: sanitized.city ?? null,
        shortBio: typeof sanitized.shortBio === 'string' && sanitized.shortBio.length ? sanitized.shortBio : null,
        interests: typeof sanitized.interests === 'string' && sanitized.interests.length ? sanitized.interests : null,
        playPreferences: typeof sanitized.playPreferences === 'string' && sanitized.playPreferences.length
            ? sanitized.playPreferences
            : null,
        boundaries: typeof sanitized.boundaries === 'string' && sanitized.boundaries.length ? sanitized.boundaries : null,
        availabilityJson: availability,
    });
}
async function revokeSingleInvite(inviteId, actorUserId) {
    const result = await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
        .query(`
        SELECT TOP 1 Status, InviterUserID
        FROM dbo.SingleInvites
        WHERE InviteID = @InviteID;
      `));
    const invite = result.recordset?.[0];
    if (!invite) {
        throw new errorHandler_1.OperationalError('Invite not found.', 404);
    }
    const status = String(invite.Status);
    const inviter = String(invite.InviterUserID);
    if (inviter !== actorUserId) {
        throw new errorHandler_1.OperationalError('You are not allowed to revoke this invite.', 403);
    }
    if (status === 'completed' || status === 'revoked' || status === 'declined') {
        return;
    }
    await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
        .input('Status', db_1.sql.NVarChar(30), 'revoked')
        .query(`
        UPDATE dbo.SingleInvites
        SET Status = @Status,
            ConsumedAt = COALESCE(ConsumedAt, SYSUTCDATETIME())
        WHERE InviteID = @InviteID;
      `));
    await recordInviteEvent(inviteId, 'invite.revoked', actorUserId, { statusBefore: status });
}
async function verifyInviteToken(rawCombinedToken) {
    if (!rawCombinedToken || typeof rawCombinedToken !== 'string') {
        return { status: 'invalid' };
    }
    const [inviteIdPart, tokenPart] = rawCombinedToken.split('.');
    if (!inviteIdPart || !tokenPart) {
        return { status: 'invalid' };
    }
    let inviteRow;
    try {
        const result = await (0, db_1.withSqlRetry)((pool) => pool
            .request()
            .input('InviteID', db_1.sql.UniqueIdentifier, inviteIdPart)
            .query(`
          SELECT TOP 1
            InviteID,
            InviterUserID,
            InviteeEmail,
            TokenHash,
            TokenSalt,
            RequestedRole,
            Status,
            ExpiresAt,
            ConsumedAt,
            InviteeUserID,
            CreatedAt,
            UpdatedAt
          FROM dbo.SingleInvites
          WHERE InviteID = @InviteID;
        `));
        inviteRow = result.recordset?.[0];
    }
    catch {
        return { status: 'invalid' };
    }
    if (!inviteRow) {
        return { status: 'invalid' };
    }
    const saltBuffer = Buffer.from(inviteRow.TokenSalt ?? [], 'binary');
    const storedHash = Buffer.from(inviteRow.TokenHash ?? [], 'binary');
    const computedHash = hashTokenWithSalt(tokenPart, saltBuffer);
    if (!buffersEqual(storedHash, computedHash)) {
        return { status: 'invalid' };
    }
    const status = coerceInviteStatus(inviteRow.Status);
    if (status === 'completed') {
        return { status: 'consumed' };
    }
    const now = new Date();
    if (inviteRow.ExpiresAt && new Date(inviteRow.ExpiresAt) < now) {
        return { status: 'expired' };
    }
    return {
        status: 'valid',
        invite: {
            inviteId: String(inviteRow.InviteID),
            inviterUserId: String(inviteRow.InviterUserID),
            inviteeEmail: inviteRow.InviteeEmail,
            requestedRole: inviteRow.RequestedRole,
            status,
            expiresAt: inviteRow.ExpiresAt,
            consumedAt: inviteRow.ConsumedAt ?? null,
            inviteeUserId: inviteRow.InviteeUserID ?? null,
            createdAt: inviteRow.CreatedAt,
            updatedAt: inviteRow.UpdatedAt,
        },
    };
}
async function updateInviteStatus(inviteId, status, metadata) {
    await ensureInviteStatusColumnSize();
    await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
        .input('Status', db_1.sql.NVarChar(30), status)
        .query(`
        UPDATE dbo.SingleInvites
        SET Status = @Status,
            UpdatedAt = SYSUTCDATETIME()
        WHERE InviteID = @InviteID;
      `));
    await recordInviteEvent(inviteId, 'invite.status_changed', null, { status });
    if (metadata) {
        await recordInviteEvent(inviteId, 'invite.status_meta', null, metadata);
    }
}
async function associateInviteWithUser(inviteId, userId) {
    await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
        .input('InviteeUserID', db_1.sql.UniqueIdentifier, userId)
        .query(`
        UPDATE dbo.SingleInvites
        SET InviteeUserID = @InviteeUserID,
            ConsumedAt = COALESCE(ConsumedAt, SYSUTCDATETIME()),
            UpdatedAt = SYSUTCDATETIME()
        WHERE InviteID = @InviteID;
      `));
    await recordInviteEvent(inviteId, 'invite.associated_user', userId);
}
async function logVerificationDecision(sessionId, actorUserId, decision, reason) {
    await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('SessionID', db_1.sql.UniqueIdentifier, sessionId)
        .input('Status', db_1.sql.NVarChar(30), decision)
        .input('DecisionUserID', db_1.sql.VarChar(255), actorUserId ?? null)
        .input('RejectionReason', db_1.sql.NVarChar(500), reason ?? null)
        .query(`
        UPDATE dbo.SingleVerificationSessions
        SET Status = @Status,
            DecisionUserID = @DecisionUserID,
            DecisionAt = SYSUTCDATETIME(),
            RejectionReason = @RejectionReason
        WHERE SessionID = @SessionID;
      `));
}
async function createVerificationSession(inviteId, inviteeEmail, submittedProfile) {
    const sessionId = (0, crypto_1.randomUUID)();
    await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('SessionID', db_1.sql.UniqueIdentifier, sessionId)
        .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
        .input('InviteeEmail', db_1.sql.NVarChar(320), inviteeEmail)
        .input('Status', db_1.sql.NVarChar(30), submittedProfile ? 'awaiting_uploads' : 'awaiting_profile')
        .input('SubmittedProfile', db_1.sql.NVarChar(db_1.sql.MAX), submittedProfile ? JSON.stringify(submittedProfile) : null)
        .query(`
        INSERT INTO dbo.SingleVerificationSessions (
          SessionID,
          InviteID,
          InviteeEmail,
          Status,
          SubmittedProfile
        )
        VALUES (
          @SessionID,
          @InviteID,
          @InviteeEmail,
          @Status,
          @SubmittedProfile
        );
      `));
    await recordInviteEvent(inviteId, 'verification.session_created', null, { sessionId });
    return sessionId;
}
function sanitizeSingleProfilePayload(raw) {
    if (!raw || typeof raw !== 'object') {
        return {};
    }
    const sanitized = { ...raw };
    if (typeof raw.nickname === 'string') {
        const trimmed = raw.nickname.trim();
        if (trimmed.length) {
            sanitized.nickname = trimmed;
        }
        else {
            delete sanitized.nickname;
        }
    }
    if (typeof raw.contactEmail === 'string') {
        const trimmedEmail = raw.contactEmail.trim().toLowerCase();
        if (trimmedEmail.length) {
            sanitized.contactEmail = trimmedEmail;
        }
        else {
            delete sanitized.contactEmail;
        }
    }
    if (typeof raw.country === 'string') {
        const trimmedCountry = raw.country.trim();
        sanitized.country = trimmedCountry.length ? trimmedCountry : null;
    }
    else if (raw.country !== undefined) {
        delete sanitized.country;
    }
    if (typeof raw.city === 'string') {
        const trimmedCity = raw.city.trim();
        sanitized.city = trimmedCity.length ? trimmedCity : null;
    }
    else if (raw.city !== undefined) {
        delete sanitized.city;
    }
    ['shortBio', 'interests', 'playPreferences', 'boundaries', 'availability'].forEach((field) => {
        if (typeof raw[field] === 'string') {
            const trimmed = raw[field].trim();
            sanitized[field] = trimmed.length ? trimmed : null;
        }
    });
    return sanitized;
}
async function saveVerificationProfile(inviteId, inviteeEmail, profilePayload, nextStatus) {
    const sanitizedPayload = sanitizeSingleProfilePayload(profilePayload);
    const serializedProfile = JSON.stringify(sanitizedPayload ?? {});
    await (0, db_1.withSqlRetry)(async (pool) => {
        const existing = await pool
            .request()
            .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
            .query(`
        SELECT TOP 1 SessionID
        FROM dbo.SingleVerificationSessions
        WHERE InviteID = @InviteID;
      `);
        if (existing.recordset?.length) {
            await pool
                .request()
                .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
                .input('InviteeEmail', db_1.sql.NVarChar(320), inviteeEmail)
                .input('Status', db_1.sql.NVarChar(30), nextStatus)
                .input('SubmittedProfile', db_1.sql.NVarChar(db_1.sql.MAX), serializedProfile)
                .query(`
          UPDATE dbo.SingleVerificationSessions
          SET InviteeEmail = @InviteeEmail,
              Status = @Status,
              SubmittedProfile = @SubmittedProfile,
              UpdatedAt = SYSUTCDATETIME()
          WHERE InviteID = @InviteID;
        `);
        }
        else {
            await pool
                .request()
                .input('SessionID', db_1.sql.UniqueIdentifier, (0, crypto_1.randomUUID)())
                .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
                .input('InviteeEmail', db_1.sql.NVarChar(320), inviteeEmail)
                .input('Status', db_1.sql.NVarChar(30), nextStatus)
                .input('SubmittedProfile', db_1.sql.NVarChar(db_1.sql.MAX), serializedProfile)
                .query(`
          INSERT INTO dbo.SingleVerificationSessions
            (SessionID, InviteID, InviteeEmail, Status, SubmittedProfile, CreatedAt, UpdatedAt)
          VALUES
            (@SessionID, @InviteID, @InviteeEmail, @Status, @SubmittedProfile, SYSUTCDATETIME(), SYSUTCDATETIME());
        `);
        }
    });
    await recordInviteEvent(inviteId, 'verification.profile_saved', null, { status: nextStatus });
}
async function saveVerificationMedia(inviteId, inviteeEmail, mediaPayload, nextStatus) {
    await (0, db_1.withSqlRetry)(async (pool) => {
        const submittedMedia = JSON.stringify(mediaPayload ?? {});
        const update = await pool
            .request()
            .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
            .input('InviteeEmail', db_1.sql.NVarChar(320), inviteeEmail ?? null)
            .input('Status', db_1.sql.NVarChar(30), nextStatus)
            .input('SubmittedMedia', db_1.sql.NVarChar(db_1.sql.MAX), submittedMedia)
            .query(`
        UPDATE dbo.SingleVerificationSessions
        SET InviteeEmail = COALESCE(@InviteeEmail, InviteeEmail),
            SubmittedMedia = @SubmittedMedia,
            Status = @Status,
            UpdatedAt = SYSUTCDATETIME()
        WHERE InviteID = @InviteID;
      `);
        if (!update.rowsAffected?.[0]) {
            await pool
                .request()
                .input('SessionID', db_1.sql.UniqueIdentifier, (0, crypto_1.randomUUID)())
                .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
                .input('InviteeEmail', db_1.sql.NVarChar(320), inviteeEmail)
                .input('Status', db_1.sql.NVarChar(30), nextStatus)
                .input('SubmittedMedia', db_1.sql.NVarChar(db_1.sql.MAX), submittedMedia)
                .query(`
          INSERT INTO dbo.SingleVerificationSessions
            (SessionID, InviteID, InviteeEmail, Status, SubmittedMedia, CreatedAt, UpdatedAt)
          VALUES
            (@SessionID, @InviteID, @InviteeEmail, @Status, @SubmittedMedia, SYSUTCDATETIME(), SYSUTCDATETIME());
        `);
        }
    });
    await recordInviteEvent(inviteId, 'verification.media_saved', null, { status: nextStatus });
}
async function upsertSingleProfile(userId, inviteSourceUserId, profileData) {
    await ensureSingleProfileContactColumns();
    await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('UserID', db_1.sql.VarChar(255), userId)
        .input('InviteSourceUserID', db_1.sql.VarChar(255), inviteSourceUserId ?? null)
        .input('PreferredNickname', db_1.sql.NVarChar(120), profileData.preferredNickname ?? null)
        .input('ContactEmail', db_1.sql.NVarChar(320), profileData.contactEmail ?? null)
        .input('Country', db_1.sql.NVarChar(120), profileData.country ?? null)
        .input('City', db_1.sql.NVarChar(120), profileData.city ?? null)
        .input('ShortBio', db_1.sql.NVarChar(600), profileData.shortBio ?? null)
        .input('Interests', db_1.sql.NVarChar(500), profileData.interests ?? null)
        .input('PlayPreferences', db_1.sql.NVarChar(500), profileData.playPreferences ?? null)
        .input('Boundaries', db_1.sql.NVarChar(500), profileData.boundaries ?? null)
        .input('AvailabilityJson', db_1.sql.NVarChar(db_1.sql.MAX), profileData.availabilityJson ? JSON.stringify(profileData.availabilityJson) : null)
        .input('ReputationSummary', db_1.sql.NVarChar(500), profileData.reputationSummary ?? null)
        .input('ComplianceSummary', db_1.sql.NVarChar(500), profileData.complianceSummary ?? null)
        .query(`
        MERGE dbo.SingleProfiles AS target
        USING (SELECT
          @UserID AS UserID,
          @InviteSourceUserID AS InviteSourceUserID,
          @ShortBio AS ShortBio,
          @Interests AS Interests,
          @PlayPreferences AS PlayPreferences,
          @Boundaries AS Boundaries,
          @PreferredNickname AS PreferredNickname,
          @ContactEmail AS ContactEmail,
          @Country AS Country,
          @City AS City,
          @AvailabilityJson AS AvailabilityJson,
          @ReputationSummary AS ReputationSummary,
          @ComplianceSummary AS ComplianceSummary
        ) AS source
        ON target.UserID = source.UserID
        WHEN MATCHED THEN
          UPDATE SET
            InviteSourceUserID = source.InviteSourceUserID,
            ShortBio = source.ShortBio,
            Interests = source.Interests,
            PlayPreferences = source.PlayPreferences,
            Boundaries = source.Boundaries,
            PreferredNickname = source.PreferredNickname,
            ContactEmail = source.ContactEmail,
            Country = source.Country,
            City = source.City,
            AvailabilityJson = source.AvailabilityJson,
            ReputationSummary = source.ReputationSummary,
            ComplianceSummary = source.ComplianceSummary,
            UpdatedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            UserID,
            InviteSourceUserID,
            ShortBio,
            Interests,
            PlayPreferences,
            Boundaries,
            PreferredNickname,
            ContactEmail,
            Country,
            City,
            AvailabilityJson,
            ReputationSummary,
            ComplianceSummary
          )
          VALUES (
            source.UserID,
            source.InviteSourceUserID,
            source.ShortBio,
            source.Interests,
            source.PlayPreferences,
            source.Boundaries,
            source.PreferredNickname,
            source.ContactEmail,
            source.Country,
            source.City,
            source.AvailabilityJson,
            source.ReputationSummary,
            source.ComplianceSummary
          );
      `));
}
async function fetchSingleProfile(userId) {
    await ensureSingleProfileContactColumns();
    const result = await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('UserID', db_1.sql.VarChar(255), userId)
        .query(`
        SELECT TOP 1
          sp.UserID,
          sp.InviteSourceUserID,
          sp.PreferredNickname,
          sp.ContactEmail,
          sp.Country,
          sp.City,
          sp.ShortBio,
          sp.Interests,
          sp.PlayPreferences,
          sp.Boundaries,
          sp.AvailabilityJson,
          sp.ReputationSummary,
          sp.ReputationScore,
          sp.TrustedCount,
          sp.ComplianceSummary,
          sp.CreatedAt,
          sp.UpdatedAt,
          inv.Username AS InviterUsername,
          inv.Partner1Nickname,
          inv.Partner2Nickname,
          inv.City AS InviterCity,
          inv.Country AS InviterCountry
        FROM dbo.SingleProfiles sp
        LEFT JOIN dbo.Users inv ON sp.InviteSourceUserID = inv.UserID
        WHERE sp.UserID = @UserID;
      `));
    const row = result.recordset?.[0];
    if (!row) {
        return null;
    }
    let availabilityJson = null;
    if (row.AvailabilityJson) {
        try {
            availabilityJson = JSON.parse(row.AvailabilityJson);
        }
        catch {
            availabilityJson = row.AvailabilityJson;
        }
    }
    const inviterDisplayName = row.Partner1Nickname && row.Partner2Nickname
        ? `${row.Partner1Nickname} & ${row.Partner2Nickname}`
        : row.Partner1Nickname || row.Partner2Nickname || row.InviterUsername || null;
    return {
        userId: String(row.UserID),
        inviteSourceUserId: row.InviteSourceUserID ? String(row.InviteSourceUserID) : null,
        preferredNickname: row.PreferredNickname ?? null,
        contactEmail: row.ContactEmail ?? null,
        country: row.Country ?? null,
        city: row.City ?? null,
        shortBio: row.ShortBio ?? null,
        interests: row.Interests ?? null,
        playPreferences: row.PlayPreferences ?? null,
        boundaries: row.Boundaries ?? null,
        availabilityJson,
        reputationSummary: row.ReputationSummary ?? null,
        reputationScore: typeof row.ReputationScore === 'number' ? Number(row.ReputationScore) : null,
        trustedCount: Number(row.TrustedCount ?? 0),
        complianceSummary: row.ComplianceSummary ?? null,
        createdAt: row.CreatedAt,
        updatedAt: row.UpdatedAt,
        inviterUsername: row.InviterUsername ?? null,
        inviterDisplayName,
        inviterCity: row.InviterCity ?? null,
        inviterCountry: row.InviterCountry ?? null,
    };
}
async function listActiveSinglesByCountry(country) {
    const rawCountry = typeof country === 'string' ? country.trim() : '';
    const normalizedCountry = rawCountry.toUpperCase();
    const result = await (0, db_1.withSqlRetry)((pool) => {
        const request = pool.request();
        if (normalizedCountry.length) {
            request.input('CountryUpper', db_1.sql.NVarChar(120), normalizedCountry);
            request.input('CountryPattern', db_1.sql.NVarChar(240), `%${normalizedCountry}%`);
        }
        else {
            request.input('CountryUpper', db_1.sql.NVarChar(120), null);
            request.input('CountryPattern', db_1.sql.NVarChar(240), null);
        }
        return request.query(`
      WITH Singles AS (
        SELECT
          u.UserID,
          u.Username,
          u.Partner1Nickname,
          u.City,
          u.Country,
          u.Gender,
          u.CreatedAt,
          u.UpdatedAt
        FROM dbo.Users u
        WHERE u.AccountKind = 'single'
      )
      SELECT
        s.UserID,
        s.Username,
        s.Partner1Nickname,
        s.City,
        s.Country,
        s.Gender,
        s.CreatedAt,
        photo.DataUrl AS PhotoDataUrl
      FROM Singles s
      OUTER APPLY (
        SELECT TOP 1 DataUrl
        FROM dbo.Photos p
        WHERE p.UserID = s.UserID
        ORDER BY COALESCE(p.IsPrimary, 0) DESC, p.UploadedAt DESC
      ) AS photo
      WHERE (
        @CountryUpper IS NULL
        OR @CountryUpper = ''
        OR UPPER(LTRIM(RTRIM(COALESCE(s.Country, '')))) = @CountryUpper
        OR (
          @CountryPattern IS NOT NULL
          AND UPPER(LTRIM(RTRIM(COALESCE(s.Country, '')))) LIKE @CountryPattern
        )
      );
    `);
    });
    const mapGenderToRole = (value) => {
        if (!value)
            return null;
        const normalized = value.trim().toLowerCase();
        if (!normalized.length)
            return null;
        if (normalized.startsWith('m'))
            return 'single_male';
        if (normalized.startsWith('f'))
            return 'single_female';
        return null;
    };
    return (result.recordset ?? []).map((row) => {
        const nickname = row.Partner1Nickname ?? row.Username ?? null;
        return {
            userId: String(row.UserID),
            username: row.Username ?? null,
            nickname,
            role: mapGenderToRole(row.Gender ?? null),
            inviterDisplayName: null,
            profileCountry: row.Country ?? null,
            profileCity: row.City ?? null,
            inviterCity: null,
            inviterCountry: null,
            invitedAt: row.CreatedAt ?? null,
            reputationScore: null,
            photoDataUrl: row.PhotoDataUrl ?? null,
        };
    });
}
async function updateSingleProfileForUser(userId, updates) {
    if (!userId) {
        throw new errorHandler_1.OperationalError('User ID is required.', 400);
    }
    const sanitized = sanitizeSingleProfilePayload(updates);
    const existing = await fetchSingleProfile(userId);
    if (!existing) {
        throw new errorHandler_1.OperationalError('Single profile not found.', 404);
    }
    const has = (key) => Object.prototype.hasOwnProperty.call(sanitized, key);
    let availabilityValue = existing.availabilityJson ?? null;
    if (has('availability')) {
        availabilityValue = sanitized.availability ?? null;
        if (typeof availabilityValue === 'string') {
            const trimmed = availabilityValue.trim();
            if (!trimmed.length) {
                availabilityValue = null;
            }
            else {
                try {
                    availabilityValue = JSON.parse(trimmed);
                }
                catch {
                    availabilityValue = trimmed;
                }
            }
        }
    }
    await upsertSingleProfile(userId, existing.inviteSourceUserId ?? null, {
        preferredNickname: has('nickname') ? sanitized.nickname ?? null : existing.preferredNickname ?? null,
        contactEmail: has('contactEmail') ? sanitized.contactEmail ?? null : existing.contactEmail ?? null,
        country: existing.country ?? null,
        city: existing.city ?? null,
        shortBio: has('shortBio') ? (sanitized.shortBio ?? null) : existing.shortBio ?? null,
        interests: has('interests') ? (sanitized.interests ?? null) : existing.interests ?? null,
        playPreferences: has('playPreferences') ? (sanitized.playPreferences ?? null) : existing.playPreferences ?? null,
        boundaries: has('boundaries') ? (sanitized.boundaries ?? null) : existing.boundaries ?? null,
        availabilityJson: availabilityValue ?? null,
        reputationSummary: existing.reputationSummary ?? null,
        complianceSummary: existing.complianceSummary ?? null,
    });
    const refreshed = await fetchSingleProfile(userId);
    if (!refreshed) {
        throw new errorHandler_1.OperationalError('Failed to load updated single profile.', 500);
    }
    return refreshed;
}
function mapReviewRow(row) {
    return {
        reviewId: String(row.ReviewID),
        singleUserId: String(row.SingleUserID),
        coupleUserId: String(row.CoupleUserID),
        coupleDisplayName: buildCoupleDisplayName(row),
        score: Number(row.Score),
        comment: typeof row.Comment === 'string' ? row.Comment : null,
        createdAt: row.CreatedAt,
    };
}
const SLOT_STATUS_SET = new Set(['open', 'pending', 'booked', 'blocked']);
const REQUEST_STATUS_SET = new Set(['pending', 'accepted', 'declined', 'cancelled']);
function normalizeSlotStatus(value) {
    const normalized = String(value ?? 'open').toLowerCase().trim();
    if (SLOT_STATUS_SET.has(normalized)) {
        return normalized;
    }
    throw new errorHandler_1.OperationalError('Unsupported availability slot status.', 400);
}
function coerceDateInput(value, label) {
    const candidate = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
    if (Number.isNaN(candidate.getTime())) {
        throw new errorHandler_1.OperationalError(`${label} must be a valid date.`, 400);
    }
    return candidate;
}
function trimOrNull(value, maxLength) {
    if (typeof value !== 'string')
        return null;
    const trimmed = value.trim();
    if (!trimmed.length)
        return null;
    if (trimmed.length > maxLength) {
        return trimmed.slice(0, maxLength);
    }
    return trimmed;
}
const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
function normalizeSingleUserId(raw) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!GUID_REGEX.test(value)) {
        throw new errorHandler_1.OperationalError('Single profile not found.', 404);
    }
    return value.toLowerCase();
}
async function ensureSingleExists(pool, singleUserId) {
    const normalizedId = normalizeSingleUserId(singleUserId);
    const check = await pool
        .request()
        .input('SingleUserID', db_1.sql.UniqueIdentifier, normalizedId)
        .query(`
      SELECT TOP 1 UserID
      FROM dbo.SingleUsers
      WHERE UserID = @SingleUserID;
    `);
    if (!check.recordset?.length) {
        throw new errorHandler_1.OperationalError('Single profile not found.', 404);
    }
}
function mapAvailabilitySlotRow(row) {
    return {
        slotId: String(row.SlotID),
        singleUserId: String(row.SingleUserID),
        startAt: row.StartAt instanceof Date ? row.StartAt : new Date(row.StartAt),
        endAt: row.EndAt instanceof Date ? row.EndAt : new Date(row.EndAt),
        status: normalizeSlotStatus(row.Status),
        title: row.Title ?? null,
        notes: row.Notes ?? null,
        createdAt: row.CreatedAt instanceof Date ? row.CreatedAt : new Date(row.CreatedAt),
        updatedAt: row.UpdatedAt instanceof Date ? row.UpdatedAt : new Date(row.UpdatedAt),
        pendingRequestCount: Number(row.PendingRequestCount ?? 0),
    };
}
function buildCoupleSummary(row) {
    if (!row) {
        return {
            userId: '',
            username: null,
            displayName: null,
            city: null,
            country: null,
            membershipType: null,
            relationshipStatus: null,
            yearsTogether: null,
            coupleType: null,
            profilePictureUrl: null,
        };
    }
    const partner1 = row.Partner1Nickname ?? null;
    const partner2 = row.Partner2Nickname ?? null;
    let displayName = null;
    if (partner1 && partner2) {
        displayName = `${partner1} & ${partner2}`;
    }
    else if (partner1 || partner2) {
        displayName = partner1 ?? partner2;
    }
    else if (row.Username) {
        displayName = String(row.Username);
    }
    return {
        userId: row.UserID ? String(row.UserID) : '',
        username: row.Username ? String(row.Username) : null,
        displayName,
        city: row.City ?? null,
        country: row.Country ?? null,
        membershipType: row.MembershipType ? String(row.MembershipType) : null,
        relationshipStatus: row.RelationshipStatus ? String(row.RelationshipStatus) : null,
        yearsTogether: row.YearsTogether != null && !Number.isNaN(Number(row.YearsTogether))
            ? Number(row.YearsTogether)
            : null,
        coupleType: row.CoupleType ? String(row.CoupleType) : null,
        profilePictureUrl: row.ProfilePictureUrl ?? null,
    };
}
function parseCoupleSummarySnapshot(snapshot, fallbackRow) {
    if (!snapshot && !fallbackRow) {
        return null;
    }
    if (snapshot) {
        try {
            const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
            if (parsed && typeof parsed === 'object') {
                return {
                    userId: parsed.userId ? String(parsed.userId) : fallbackRow?.UserID ? String(fallbackRow.UserID) : '',
                    username: parsed.username ?? (fallbackRow?.Username ? String(fallbackRow.Username) : null),
                    displayName: parsed.displayName ??
                        (fallbackRow ? buildCoupleSummary(fallbackRow).displayName : null),
                    city: parsed.city ?? (fallbackRow?.City ?? null),
                    country: parsed.country ?? (fallbackRow?.Country ?? null),
                    membershipType: parsed.membershipType ?? (fallbackRow?.MembershipType ?? null),
                    relationshipStatus: parsed.relationshipStatus ?? (fallbackRow?.RelationshipStatus ?? null),
                    yearsTogether: parsed.yearsTogether != null
                        ? Number(parsed.yearsTogether)
                        : fallbackRow?.YearsTogether != null
                            ? Number(fallbackRow.YearsTogether)
                            : null,
                    coupleType: parsed.coupleType ?? (fallbackRow?.CoupleType ?? null),
                    profilePictureUrl: parsed.profilePictureUrl ?? (fallbackRow?.ProfilePictureUrl ?? null),
                };
            }
        }
        catch {
            // ignore JSON parse issues and fallback below
        }
    }
    if (fallbackRow) {
        return buildCoupleSummary(fallbackRow);
    }
    return null;
}
function mapAvailabilityRequestRow(row, fallbackSummary) {
    const requestedStartAt = row.RequestedStartAt instanceof Date
        ? row.RequestedStartAt
        : new Date(row.RequestedStartAt);
    const requestedEndAt = row.RequestedEndAt instanceof Date
        ? row.RequestedEndAt
        : new Date(row.RequestedEndAt);
    const coupleSummary = fallbackSummary ?? parseCoupleSummarySnapshot(row.CoupleSnapshotJson, row);
    return {
        requestId: String(row.RequestID),
        singleUserId: String(row.SingleUserID),
        coupleUserId: String(row.CoupleUserID),
        slotId: row.SlotID ? String(row.SlotID) : null,
        requestedStartAt,
        requestedEndAt,
        status: REQUEST_STATUS_SET.has(String(row.Status ?? '').toLowerCase())
            ? String(row.Status).toLowerCase()
            : 'pending',
        message: row.Message ?? null,
        createdAt: row.CreatedAt instanceof Date ? row.CreatedAt : new Date(row.CreatedAt),
        updatedAt: row.UpdatedAt instanceof Date ? row.UpdatedAt : new Date(row.UpdatedAt),
        decisionAt: row.DecisionAt instanceof Date
            ? row.DecisionAt
            : row.DecisionAt
                ? new Date(row.DecisionAt)
                : null,
        decisionNotes: row.DecisionNotes ?? null,
        coupleSummary,
    };
}
async function listSingleAvailabilitySlots(singleUserId, options = {}) {
    throw new errorHandler_1.OperationalError('Single availability scheduling has been retired.', 410);
}
async function createSingleAvailabilitySlot(singleUserId, payload) {
    throw new errorHandler_1.OperationalError('Single availability scheduling has been retired.', 410);
}
async function deleteSingleAvailabilitySlot(singleUserId, slotId) {
    throw new errorHandler_1.OperationalError('Single availability scheduling has been retired.', 410);
}
async function createSingleAvailabilityRequest(singleUserId, coupleUserId, payload) {
    throw new errorHandler_1.OperationalError('Single availability scheduling has been retired.', 410);
}
async function listAvailabilityRequestsForSingle(singleUserId) {
    throw new errorHandler_1.OperationalError('Single availability scheduling has been retired.', 410);
}
async function fetchActiveSingleDetail(singleUserId, viewerUserId) {
    if (!singleUserId) {
        throw new errorHandler_1.OperationalError('Single user ID is required.', 400);
    }
    const normalizedSingleUserId = normalizeSingleUserId(singleUserId);
    const profile = await fetchSingleProfile(normalizedSingleUserId);
    return (0, db_1.withSqlRetry)(async (pool) => {
        const detailResult = await pool
            .request()
            .input('SingleUserID', db_1.sql.UniqueIdentifier, normalizedSingleUserId)
            .query(`
        WITH RankedInvites AS (
          SELECT
            inv.InviteeUserID,
            inv.RequestedRole,
            inv.CreatedAt AS InvitedAt,
            inv.Status,
            inviter.UserID AS InviterUserID,
            inviter.Username,
            inviter.Partner1Nickname,
            inviter.Partner2Nickname,
            inviter.Country AS InviterCountry,
            ROW_NUMBER() OVER (PARTITION BY inv.InviteeUserID ORDER BY inv.CreatedAt DESC) AS RowRank
          FROM dbo.SingleInvites inv
          LEFT JOIN dbo.Users inviter ON inviter.UserID = inv.InviterUserID
          WHERE inv.InviteeUserID = @SingleUserID
        )
        SELECT TOP 1
          su.UserID,
          su.Username,
          ranked.RequestedRole,
          ranked.InvitedAt,
          ranked.Username AS InviterUsername,
          ranked.Partner1Nickname,
          ranked.Partner2Nickname,
          ranked.InviterCountry
        FROM dbo.SingleUsers su
        LEFT JOIN RankedInvites ranked
          ON ranked.InviteeUserID = su.UserID
          AND ranked.RowRank = 1
        WHERE su.UserID = @SingleUserID;
      `);
        const baseRow = detailResult.recordset?.[0];
        if (!baseRow) {
            return null;
        }
        const photosResult = await pool
            .request()
            .input('SingleUserID', db_1.sql.UniqueIdentifier, normalizedSingleUserId)
            .query(`
        SELECT TOP 6
          sp.PhotoID,
          sp.DataUrl,
          sp.UploadedAt
        FROM dbo.SinglePhotos sp
        WHERE sp.UserID = @SingleUserID
        ORDER BY sp.UploadedAt ASC;
      `);
        const reviewsResult = await pool
            .request()
            .input('SingleUserID', db_1.sql.UniqueIdentifier, normalizedSingleUserId)
            .query(`
        SELECT
          r.ReviewID,
          r.SingleUserID,
          r.CoupleUserID,
          r.Score,
          r.Comment,
          r.CreatedAt,
          u.Username,
          u.Partner1Nickname,
          u.Partner2Nickname
        FROM dbo.SingleReviews r
        LEFT JOIN dbo.Users u ON u.UserID = r.CoupleUserID
        WHERE r.SingleUserID = @SingleUserID
        ORDER BY r.CreatedAt DESC;
      `);
        const stats = await computeSingleReviewStats(pool, normalizedSingleUserId);
        const reviews = (reviewsResult.recordset ?? []).map(mapReviewRow);
        let viewerReview = null;
        if (viewerUserId) {
            viewerReview =
                reviews.find((review) => review.coupleUserId === viewerUserId) ?? null;
            if (!viewerReview) {
                const viewerReviewResult = await pool
                    .request()
                    .input('SingleUserID', db_1.sql.UniqueIdentifier, normalizedSingleUserId)
                    .input('CoupleUserID', db_1.sql.VarChar(255), viewerUserId)
                    .query(`
            SELECT
              r.ReviewID,
              r.SingleUserID,
              r.CoupleUserID,
              r.Score,
              r.Comment,
              r.CreatedAt,
              u.Username,
              u.Partner1Nickname,
              u.Partner2Nickname
            FROM dbo.SingleReviews r
            LEFT JOIN dbo.Users u ON u.UserID = r.CoupleUserID
            WHERE r.SingleUserID = @SingleUserID
              AND r.CoupleUserID = @CoupleUserID;
          `);
                if (viewerReviewResult.recordset?.[0]) {
                    viewerReview = mapReviewRow(viewerReviewResult.recordset[0]);
                }
            }
        }
        const inviterDisplayName = buildCoupleDisplayName(baseRow);
        return {
            profile,
            role: baseRow.RequestedRole ?? null,
            invitedAt: baseRow.InvitedAt ?? null,
            inviterDisplayName,
            inviterCountry: baseRow.InviterCountry ?? null,
            photos: (photosResult.recordset ?? []).map((photo) => ({
                photoId: String(photo.PhotoID),
                dataUrl: typeof photo.DataUrl === 'string'
                    ? photo.DataUrl
                    : photo.DataUrl != null
                        ? String(photo.DataUrl)
                        : null,
            })),
            reviews,
            reviewStats: stats,
            viewerReview,
        };
    });
}
async function createSingleReview(singleUserId, coupleUserId, score, comment) {
    if (!singleUserId) {
        throw new errorHandler_1.OperationalError('Single user ID is required.', 400);
    }
    if (!coupleUserId) {
        throw new errorHandler_1.OperationalError('Couple user ID is required.', 400);
    }
    if (!Number.isFinite(score) || score < 1 || score > 5) {
        throw new errorHandler_1.OperationalError('Score must be between 1 and 5.', 400);
    }
    const normalizedSingleUserId = normalizeSingleUserId(singleUserId);
    const sanitizedComment = typeof comment === 'string' && comment.trim().length
        ? comment.trim().slice(0, 1000)
        : null;
    return (0, db_1.withSqlRetry)(async (pool) => {
        const existingResult = await pool
            .request()
            .input('SingleUserID', db_1.sql.UniqueIdentifier, normalizedSingleUserId)
            .input('CoupleUserID', db_1.sql.VarChar(255), coupleUserId)
            .query(`
        SELECT TOP 1 ReviewID
        FROM dbo.SingleReviews
        WHERE SingleUserID = @SingleUserID
          AND CoupleUserID = @CoupleUserID;
      `);
        if (existingResult.recordset?.length) {
            throw new errorHandler_1.OperationalError('You have already shared feedback for this single.', 409);
        }
        const insertResult = await pool
            .request()
            .input('SingleUserID', db_1.sql.UniqueIdentifier, normalizedSingleUserId)
            .input('CoupleUserID', db_1.sql.VarChar(255), coupleUserId)
            .input('Score', db_1.sql.TinyInt, Math.round(score))
            .input('Comment', db_1.sql.NVarChar(1000), sanitizedComment)
            .query(`
        INSERT INTO dbo.SingleReviews (SingleUserID, CoupleUserID, Score, Comment)
        OUTPUT
          inserted.ReviewID,
          inserted.SingleUserID,
          inserted.CoupleUserID,
          inserted.Score,
          inserted.Comment,
          inserted.CreatedAt
        VALUES (@SingleUserID, @CoupleUserID, @Score, @Comment);
      `);
        const insertedRow = insertResult.recordset?.[0];
        if (!insertedRow) {
            throw new errorHandler_1.OperationalError('Failed to record review. Please try again.', 500);
        }
        const coupleResult = await pool
            .request()
            .input('CoupleUserID', db_1.sql.VarChar(255), coupleUserId)
            .query(`
        SELECT
          UserID,
          Username,
          Partner1Nickname,
          Partner2Nickname
        FROM dbo.Users
        WHERE UserID = @CoupleUserID;
      `);
        const coupleRow = coupleResult.recordset?.[0] ?? null;
        const review = {
            reviewId: String(insertedRow.ReviewID),
            singleUserId: String(insertedRow.SingleUserID),
            coupleUserId: String(insertedRow.CoupleUserID),
            coupleDisplayName: buildCoupleDisplayName(coupleRow),
            score: Number(insertedRow.Score),
            comment: typeof insertedRow.Comment === 'string' ? insertedRow.Comment : null,
            createdAt: insertedRow.CreatedAt,
        };
        const stats = await computeSingleReviewStats(pool, normalizedSingleUserId);
        return { review, stats };
    });
}
async function markInviteAsDeclined(inviteId, actorUserId, reason) {
    await (0, db_1.withSqlRetry)((pool) => pool
        .request()
        .input('InviteID', db_1.sql.UniqueIdentifier, inviteId)
        .input('Status', db_1.sql.NVarChar(30), 'declined')
        .input('Reason', db_1.sql.NVarChar(500), reason ?? null)
        .query(`
        UPDATE dbo.SingleInvites
        SET Status = @Status,
            UpdatedAt = SYSUTCDATETIME()
        WHERE InviteID = @InviteID;
      `));
    await recordInviteEvent(inviteId, 'invite.declined', actorUserId, { reason });
}
function getRoleLabel(role) {
    return SINGLE_ROLE_TO_LABEL[role] ?? role;
}
function getSinglePlanProductCode() {
    return SINGLE_PLAN_PRODUCT;
}
function isActiveStatus(status) {
    return ACTIVE_STATUS_SET.has(status);
}
