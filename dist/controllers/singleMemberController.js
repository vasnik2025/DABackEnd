"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCreateInvite = handleCreateInvite;
exports.handleListInvites = handleListInvites;
exports.handleAdminListSingleInvites = handleAdminListSingleInvites;
exports.handleRevokeInvite = handleRevokeInvite;
exports.handleValidateToken = handleValidateToken;
exports.handleSubmitProfile = handleSubmitProfile;
exports.handleSubmitMedia = handleSubmitMedia;
exports.handleCompleteActivation = handleCompleteActivation;
exports.handleDeclineInvite = handleDeclineInvite;
exports.handleAdminApprove = handleAdminApprove;
exports.handleAdminReject = handleAdminReject;
exports.notImplemented = notImplemented;
exports.handleGetOwnSingleProfile = handleGetOwnSingleProfile;
exports.handleUpdateOwnSingleProfile = handleUpdateOwnSingleProfile;
exports.handleListActiveSingles = handleListActiveSingles;
exports.handleGetActiveSingleDetail = handleGetActiveSingleDetail;
exports.handleCreateSingleReview = handleCreateSingleReview;
const singleMemberService_1 = require("../services/singleMemberService");
const emailService_1 = require("../utils/emailService");
const DEFAULT_INVITE_TTL_HOURS = Number(process.env.SINGLE_INVITE_TTL_HOURS ?? 168); // 7 days
const MAX_INVITE_TTL_HOURS = Number(process.env.SINGLE_INVITE_MAX_TTL_HOURS ?? 720); // 30 days
async function handleCreateInvite(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const payload = req.body;
        const email = String(payload.email ?? '').trim();
        const role = String(payload.role ?? '').toLowerCase();
        if (!email || !role) {
            return res.status(400).json({ message: 'Invite email and role are required.' });
        }
        const sanitizedTtl = Math.max(1, Math.min(MAX_INVITE_TTL_HOURS, Number(payload.ttlHours ?? DEFAULT_INVITE_TTL_HOURS)));
        const expiresAt = new Date(Date.now() + sanitizedTtl * 60 * 60 * 1000);
        const invite = await (0, singleMemberService_1.createSingleInvite)({
            inviterUserId: req.user.id,
            inviteeEmail: email,
            requestedRole: role,
            expiresAt,
            ipAddress: req.ip ?? null,
            userAgent: req.headers['user-agent'] ?? null,
        });
        let emailSent = false;
        try {
            const inviterContext = await (0, singleMemberService_1.getInviterEmailContext)(req.user.id);
            await (0, emailService_1.sendSingleInviteEmail)(email, {
                inviteLink: invite.inviteUrl,
                inviterDisplayName: inviterContext.displayName,
                roleLabel: (0, singleMemberService_1.getRoleLabel)(role),
                expiresAt,
            });
            emailSent = true;
        }
        catch (emailError) {
            console.error('[singleInvite] Failed to email single invite', emailError);
        }
        return res.status(201).json({
            inviteId: invite.inviteId,
            inviteUrl: invite.inviteUrl,
            expiresAt: invite.expiresAt,
            emailSent,
            roleLabel: (0, singleMemberService_1.getRoleLabel)(role),
            planCode: (0, singleMemberService_1.getSinglePlanProductCode)(),
        });
    }
    catch (error) {
        next(error);
    }
}
async function handleListInvites(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const invites = await (0, singleMemberService_1.listSingleInvites)(req.user.id);
        const response = invites.map((invite) => ({
            inviteId: invite.inviteId,
            email: invite.inviteeEmail,
            role: invite.requestedRole,
            status: invite.status,
            expiresAt: invite.expiresAt,
            consumedAt: invite.consumedAt,
            inviteeUserId: invite.inviteeUserId,
            createdAt: invite.createdAt,
        }));
        return res.status(200).json(response);
    }
    catch (error) {
        next(error);
    }
}
async function handleAdminListSingleInvites(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const rawStatus = req.query?.status;
        let statuses;
        if (typeof rawStatus === 'string') {
            statuses = rawStatus
                .split(',')
                .map((value) => value.trim())
                .filter((value) => value.length);
        }
        else if (Array.isArray(rawStatus)) {
            statuses = rawStatus
                .map((value) => (typeof value === 'string' ? value.trim() : ''))
                .filter((value) => value.length);
        }
        const invites = await (0, singleMemberService_1.listAdminSingleInvites)(statuses);
        return res.status(200).json({ invites });
    }
    catch (error) {
        next(error);
    }
}
async function handleRevokeInvite(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const inviteId = String(req.params.inviteId ?? '');
        if (!inviteId) {
            return res.status(400).json({ message: 'Invite ID is required.' });
        }
        await (0, singleMemberService_1.revokeSingleInvite)(inviteId, req.user.id);
        return res.status(204).send();
    }
    catch (error) {
        next(error);
    }
}
async function handleValidateToken(req, res, next) {
    try {
        const token = String((req.body?.token ?? req.query?.token ?? '') || '');
        if (!token) {
            return res.status(400).json({ message: 'Token is required.' });
        }
        const outcome = await (0, singleMemberService_1.verifyInviteToken)(token);
        if (outcome.status !== 'valid') {
            return res.status(200).json({ status: outcome.status });
        }
        const invite = outcome.invite;
        return res.status(200).json({
            status: 'valid',
            invite: {
                inviteId: invite.inviteId,
                role: invite.requestedRole,
                inviterUserId: invite.inviterUserId,
                email: invite.inviteeEmail,
                expiresAt: invite.expiresAt,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
async function handleSubmitProfile(req, res, next) {
    try {
        const body = req.body;
        const token = String(body.token ?? '');
        if (!token) {
            return res.status(400).json({ message: 'Token is required.' });
        }
        const outcome = await (0, singleMemberService_1.verifyInviteToken)(token);
        if (outcome.status !== 'valid') {
            return res.status(200).json({ status: outcome.status });
        }
        const invite = outcome.invite;
        if (new Date(invite.expiresAt).getTime() < Date.now()) {
            return res.status(200).json({ status: 'expired' });
        }
        if (!body.profile) {
            return res.status(400).json({ message: 'Profile payload is required.' });
        }
        if (!body.profile?.consentAcknowledged) {
            return res.status(400).json({ message: 'Consent acknowledgement is required.' });
        }
        const nickname = typeof body.profile.nickname === 'string' ? body.profile.nickname.trim() : '';
        const contactEmail = typeof body.profile.contactEmail === 'string' ? body.profile.contactEmail.trim().toLowerCase() : '';
        const country = typeof body.profile.country === 'string' ? body.profile.country.trim() : '';
        const city = typeof body.profile.city === 'string' ? body.profile.city.trim() : '';
        if (!nickname) {
            return res.status(400).json({ message: 'Nickname is required.' });
        }
        if (!contactEmail) {
            return res.status(400).json({ message: 'Email is required.' });
        }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contactEmail)) {
            return res.status(400).json({ message: 'Please provide a valid email address.' });
        }
        if (!country) {
            return res.status(400).json({ message: 'Country is required.' });
        }
        if (!city) {
            return res.status(400).json({ message: 'City is required.' });
        }
        const profilePayload = {
            ...body.profile,
            nickname,
            contactEmail,
            country,
            city,
        };
        await (0, singleMemberService_1.saveVerificationProfile)(invite.inviteId, invite.inviteeEmail, profilePayload, 'awaiting_uploads');
        await (0, singleMemberService_1.updateInviteStatus)(invite.inviteId, 'awaiting_verification', { stage: 'profile_submitted' });
        return res.status(200).json({ status: 'profile_saved' });
    }
    catch (error) {
        next(error);
    }
}
async function handleSubmitMedia(req, res, next) {
    try {
        const body = req.body;
        const token = String(body.token ?? '');
        if (!token) {
            return res.status(400).json({ message: 'Token is required.' });
        }
        const outcome = await (0, singleMemberService_1.verifyInviteToken)(token);
        if (outcome.status !== 'valid') {
            return res.status(200).json({ status: outcome.status });
        }
        const invite = outcome.invite;
        await (0, singleMemberService_1.saveVerificationMedia)(invite.inviteId, invite.inviteeEmail ?? null, body.media ?? {}, 'under_review');
        await (0, singleMemberService_1.updateInviteStatus)(invite.inviteId, 'awaiting_verification', { stage: 'media_uploaded' });
        return res.status(200).json({ status: 'media_saved' });
    }
    catch (error) {
        next(error);
    }
}
async function handleCompleteActivation(req, res, next) {
    try {
        const body = req.body;
        const token = String(body.token ?? '');
        const password = String(body.password ?? '');
        if (!token) {
            return res.status(400).json({ message: 'Token is required.' });
        }
        if (!password || password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters.' });
        }
        const outcome = await (0, singleMemberService_1.completeSingleActivation)(token, password);
        return res.status(200).json(outcome);
    }
    catch (error) {
        next(error);
    }
}
async function handleDeclineInvite(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const inviteId = String(req.params.inviteId ?? '');
        if (!inviteId) {
            return res.status(400).json({ message: 'Invite ID is required.' });
        }
        const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
        await (0, singleMemberService_1.markInviteAsDeclined)(inviteId, req.user.id, reason);
        return res.status(200).json({ status: 'declined' });
    }
    catch (error) {
        next(error);
    }
}
async function handleAdminApprove(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const inviteId = String(req.params.inviteId ?? '');
        if (!inviteId) {
            return res.status(400).json({ message: 'Invite ID is required.' });
        }
        const outcome = await (0, singleMemberService_1.approveSingleInvite)(inviteId, req.user.id);
        let emailSent = false;
        try {
            await (0, emailService_1.sendSingleActivationEmail)(outcome.inviteeEmail, {
                activationLink: outcome.activationLink,
                inviterDisplayName: outcome.inviterDisplayName,
                roleLabel: outcome.roleLabel,
                expiresAt: outcome.activationExpiresAt,
            });
            emailSent = true;
        }
        catch (emailError) {
            console.error('[singleInvite] Failed to send activation email', emailError);
        }
        return res.status(200).json({
            status: outcome.status,
            activationLink: outcome.activationLink,
            activationExpiresAt: outcome.activationExpiresAt,
            inviteeEmail: outcome.inviteeEmail,
            roleLabel: outcome.roleLabel,
            emailSent,
        });
    }
    catch (error) {
        next(error);
    }
}
// TODO: require admin authorization once role system is implemented.
async function handleAdminReject(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const inviteId = String(req.params.inviteId ?? '');
        const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
        if (!inviteId) {
            return res.status(400).json({ message: 'Invite ID is required.' });
        }
        await (0, singleMemberService_1.updateInviteStatus)(inviteId, 'revoked', { moderator: req.user.id, reason });
        return res.status(200).json({ status: 'revoked' });
    }
    catch (error) {
        next(error);
    }
}
function notImplemented(_, res) {
    res.status(501).json({ message: 'Endpoint not implemented yet.' });
}
async function handleGetOwnSingleProfile(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const profile = await (0, singleMemberService_1.fetchSingleProfile)(req.user.id);
        return res.status(200).json({ profile });
    }
    catch (error) {
        next(error);
    }
}
async function handleUpdateOwnSingleProfile(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const payload = (req.body ?? {});
        const updatedProfile = await (0, singleMemberService_1.updateSingleProfileForUser)(req.user.id, payload);
        return res.status(200).json({ profile: updatedProfile });
    }
    catch (error) {
        next(error);
    }
}
async function handleListActiveSingles(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const rawCountry = typeof req.query?.country === 'string' && req.query.country.trim().length
            ? req.query.country.trim()
            : null;
        const resolvedCountry = rawCountry ?? (req.user?.country ?? null);
        const singles = await (0, singleMemberService_1.listActiveSinglesByCountry)(resolvedCountry);
        const bulls = singles.filter((single) => single.role === 'single_male');
        const unicorns = singles.filter((single) => single.role === 'single_female');
        return res.status(200).json({
            bulls,
            unicorns,
            meta: {
                country: resolvedCountry ?? null,
                total: singles.length,
            },
        });
    }
    catch (error) {
        next(error);
    }
}
async function handleGetActiveSingleDetail(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const singleUserId = String(req.params.singleUserId ?? '').trim();
        if (!singleUserId) {
            return res.status(400).json({ message: 'Single user ID is required.' });
        }
        const detail = await (0, singleMemberService_1.fetchActiveSingleDetail)(singleUserId, req.user.id);
        if (!detail) {
            return res.status(404).json({ message: 'Single profile not found.' });
        }
        return res.status(200).json({ detail });
    }
    catch (error) {
        next(error);
    }
}
async function handleCreateSingleReview(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const singleUserId = String(req.params.singleUserId ?? '').trim();
        if (!singleUserId) {
            return res.status(400).json({ message: 'Single user ID is required.' });
        }
        const { score, comment } = (req.body ?? {});
        const numericScore = Number(score);
        if (!Number.isFinite(numericScore) || numericScore < 1 || numericScore > 5) {
            return res.status(400).json({ message: 'Score must be between 1 and 5.' });
        }
        const result = await (0, singleMemberService_1.createSingleReview)(singleUserId, req.user.id, numericScore, comment ?? null);
        return res.status(201).json(result);
    }
    catch (error) {
        next(error);
    }
}
