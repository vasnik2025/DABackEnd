"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
exports.resendVerificationEmails = resendVerificationEmails;
exports.login = login;
exports.me = me;
exports.logout = logout;
exports.initiatePasswordReset = initiatePasswordReset;
exports.verifyPasswordResetCode = verifyPasswordResetCode;
exports.resetPasswordWithToken = resetPasswordWithToken;
exports.verifyEmail = verifyEmail;
exports.verifyPartnerEmail = verifyPartnerEmail;
exports.verifyEmailApi = verifyEmailApi;
exports.verifyPartnerEmailApi = verifyPartnerEmailApi;
const crypto_1 = require("crypto");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authSchemas_1 = require("../validators/authSchemas");
const db_1 = require("../config/db");
const userService_1 = require("../services/userService");
const passwordResetService_1 = require("../services/passwordResetService");
const singleMemberService_1 = require("../services/singleMemberService");
const emailService_1 = require("../utils/emailService");
const passwordShare_1 = require("../utils/passwordShare");
const passwordPolicy_1 = require("../utils/passwordPolicy");
const COOKIE_NAME = 'sua';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://dateastrum.com').replace(/\/$/, '');
const shouldExposeVerificationTokens = () => (process.env.EXPOSE_VERIFICATION_TOKENS ?? '').toLowerCase() === 'true' ||
    (process.env.NODE_ENV ?? '').toLowerCase() === 'development';
const PASSWORD_RESET_CODE_EXPIRATION_MINUTES = Math.max(1, Number(process.env.PASSWORD_RESET_CODE_EXPIRATION_MINUTES ?? 10));
const PASSWORD_RESET_LINK_EXPIRATION_MINUTES = Math.max(5, Number(process.env.PASSWORD_RESET_LINK_EXPIRATION_MINUTES ?? 60));
const MFA_CODE_LENGTH = 6;
const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const normalizeEmail = (value) => value.trim().toLowerCase();
const maskEmailAddress = (email) => {
    const [local, domain] = email.split('@');
    if (!domain)
        return email;
    if (local.length <= 2) {
        return `${local.charAt(0) || '*'}***@${domain}`;
    }
    return `${local.slice(0, 2)}***@${domain}`;
};
class VerificationError extends Error {
}
const PRIMARY_SUCCESS_MESSAGES = {
    awaiting: "Your email is verified. We've notified your partner. Once they confirm their link, your suite unlocks.",
    complete: "Both of you are now verified. Welcome in; you can sign in together right away.",
};
const PARTNER_SUCCESS_MESSAGES = {
    awaiting: "Your email is confirmed. The primary partner still needs to complete their link before the suite unlocks.",
    complete: "Both of you are verified. Welcome inside and sign in together to explore DateAstrum.",
};
async function processVerificationToken(token, expectedType) {
    const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== expectedType) {
        throw new VerificationError('This verification link does not match this account.');
    }
    if (expectedType === 'primary') {
        await (0, userService_1.setUserEmailVerified)(decoded.userId);
    }
    else {
        await (0, userService_1.setPartnerEmailVerified)(decoded.userId);
    }
    const verification = await (0, userService_1.getUserVerificationStatus)(decoded.userId);
    const partnerStatus = expectedType === 'primary'
        ? verification.isPartnerEmailVerified
            ? 'complete'
            : 'awaiting'
        : verification.isEmailVerified
            ? 'complete'
            : 'awaiting';
    const message = expectedType === 'primary'
        ? PRIMARY_SUCCESS_MESSAGES[partnerStatus]
        : PARTNER_SUCCESS_MESSAGES[partnerStatus];
    return { partnerStatus, message };
}
// Accept aliases your UI sometimes uses
function normalizeAuthBody(body) {
    const email = String(body?.email ?? body?.usernameOrEmail ?? body?.identifier ?? body?.username ?? '')
        .trim().toLowerCase();
    const password = typeof body?.password === 'string' ? body.password : '';
    return { email, password };
}
async function register(req, res) {
    try {
        const parsed = authSchemas_1.registerSchema.safeParse({ body: req.body });
        if (!parsed.success) {
            return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues });
        }
        const { accountType, email, password, partnerEmail, username, coupleType, country, city, partner1Nickname, partner2Nickname, } = parsed.data.body;
        const normalizedAccountType = accountType === 'single' ? 'single' : 'couple';
        if (!(0, passwordPolicy_1.isPasswordStrong)(password)) {
            return res.status(400).json({ message: passwordPolicy_1.PASSWORD_REQUIREMENTS_MESSAGE });
        }
        const normalizedEmail = normalizeEmail(email);
        const normalizedPartnerEmail = partnerEmail ? normalizeEmail(partnerEmail) : null;
        const trimmedUsername = username.trim();
        const trimmedPartner1Nickname = partner1Nickname.trim();
        const trimmedPartner2Nickname = partner2Nickname?.trim() ?? '';
        const trimmedCountry = country.trim();
        const trimmedCity = city.trim();
        const existingByEmail = await (0, userService_1.findUserByEmail)(normalizedEmail);
        if (existingByEmail)
            return res.status(409).json({ message: 'Email already in use' });
        const existingUsername = await (0, userService_1.findUserByUsernameOrEmail)(trimmedUsername.toLowerCase());
        if (existingUsername)
            return res.status(409).json({ message: 'Username already in use' });
        const hash = await bcryptjs_1.default.hash(password, 10);
        if (normalizedAccountType === 'single') {
            if (!trimmedPartner1Nickname.length) {
                return res.status(400).json({ message: 'Nickname is required.' });
            }
            const singleUser = await (0, userService_1.createSingleUser)({
                email: normalizedEmail,
                passwordHash: hash,
                username: trimmedUsername,
            });
            const manualVerificationHints = [];
            const exposeVerificationTokens = shouldExposeVerificationTokens();
            try {
                await (0, singleMemberService_1.upsertSingleProfile)(singleUser.id, null, {
                    preferredNickname: trimmedPartner1Nickname,
                    contactEmail: normalizedEmail,
                    country: trimmedCountry || null,
                    city: trimmedCity || null,
                    shortBio: null,
                    interests: null,
                    playPreferences: null,
                    boundaries: null,
                    availabilityJson: null,
                });
            }
            catch (profileError) {
                console.error('[auth/register] Failed to upsert single profile', profileError);
            }
            let singleVerification = null;
            try {
                singleVerification = await (0, emailService_1.sendVerificationEmail)(singleUser.id, normalizedEmail);
            }
            catch (verificationError) {
                console.error('[auth/register] Failed to send verification email for single account', verificationError);
            }
            if (singleVerification && !singleVerification.emailSent) {
                console.warn(`[auth/register] Verification email not automatically delivered for single account ${singleUser.id}. Manual link: ${singleVerification.frontendLink}`);
                manualVerificationHints.push({
                    type: 'primary',
                    email: normalizedEmail,
                    frontendUrl: singleVerification.frontendLink,
                    backendUrl: singleVerification.backendLink,
                    token: singleVerification.token,
                });
            }
            try {
                await (0, emailService_1.sendAdminNewMemberNotificationEmail)({
                    accountType: 'single',
                    primaryEmail: normalizedEmail,
                    username: trimmedUsername,
                    country: trimmedCountry || null,
                    city: trimmedCity || null,
                    userId: String(singleUser.id ?? ''),
                });
            }
            catch (notifyError) {
                console.error('[auth/register] Failed to notify admin about new single registration', notifyError);
            }
            const responsePayload = {
                message: 'Registration successful! Please check your email to verify your account.',
            };
            if (singleVerification && !singleVerification.emailSent) {
                responsePayload.message =
                    'Registration successful. Verification email delivery failed; please use the manual link or try again later.';
            }
            if (manualVerificationHints.length && exposeVerificationTokens) {
                responsePayload.manualVerification = manualVerificationHints;
            }
            return res.status(201).json(responsePayload);
        }
        const exists = existingByEmail;
        if (exists)
            return res.status(409).json({ message: 'Email already in use' });
        if (normalizedPartnerEmail) {
            const partnerExists = await (0, userService_1.findUserByEmail)(normalizedPartnerEmail);
            if (partnerExists)
                return res.status(409).json({ message: 'Partner email already in use' });
        }
        const userPayload = {
            email: normalizedEmail,
            passwordHash: hash,
            username: trimmedUsername,
            partnerEmail: normalizedPartnerEmail,
            coupleType: coupleType ?? null,
            country: trimmedCountry,
            city: trimmedCity,
            partner1Nickname: trimmedPartner1Nickname,
            partner2Nickname: trimmedPartner2Nickname,
        };
        const user = await (0, userService_1.createUser)(userPayload);
        const manualVerificationHints = [];
        const exposeVerificationTokens = shouldExposeVerificationTokens();
        let countryRecipientList = [];
        if (trimmedCountry) {
            try {
                const existingCouples = await (0, userService_1.listCoupleEmailsByCountry)(trimmedCountry, {
                    excludeUserId: String(user.id ?? ''),
                });
                const recipientLookup = new Map();
                for (const entry of existingCouples) {
                    const primaryEmail = entry.primaryEmail?.trim();
                    if (primaryEmail?.length) {
                        const normalized = primaryEmail.toLowerCase();
                        if (!recipientLookup.has(normalized)) {
                            recipientLookup.set(normalized, primaryEmail);
                        }
                    }
                    const partnerEmail = entry.partnerEmail?.trim();
                    if (partnerEmail?.length && entry.isPartnerEmailVerified) {
                        const normalized = partnerEmail.toLowerCase();
                        if (!recipientLookup.has(normalized)) {
                            recipientLookup.set(normalized, partnerEmail);
                        }
                    }
                }
                countryRecipientList = Array.from(recipientLookup.values());
            }
            catch (listError) {
                console.error(`[auth/register] Failed to fetch existing couples for country ${country}`, listError);
            }
        }
        // Send verification emails
        let primaryVerification = null;
        try {
            primaryVerification = await (0, emailService_1.sendVerificationEmail)(user.id, normalizedEmail);
        }
        catch (verificationError) {
            console.error('[auth/register] Failed to send primary verification email for couple account', verificationError);
        }
        if (primaryVerification && !primaryVerification.emailSent) {
            console.warn(`[auth/register] Primary verification email not automatically delivered for couple account ${user.id}. Manual link: ${primaryVerification.frontendLink}`);
            manualVerificationHints.push({
                type: 'primary',
                email: normalizedEmail,
                frontendUrl: primaryVerification.frontendLink,
                backendUrl: primaryVerification.backendLink,
                token: primaryVerification.token,
            });
        }
        if (normalizedPartnerEmail) {
            try {
                await (0, emailService_1.sendPartnerVerificationEmail)(user.id, normalizedPartnerEmail, trimmedUsername);
            }
            catch (verificationError) {
                console.error('[auth/register] Failed to send partner verification email for couple account', verificationError);
            }
        }
        try {
            await (0, emailService_1.sendAdminNewMemberNotificationEmail)({
                accountType: 'couple',
                primaryEmail: normalizedEmail,
                username: trimmedUsername ?? null,
                partnerEmail: normalizedPartnerEmail ?? null,
                coupleType: coupleType ?? null,
                city: trimmedCity ?? null,
                country: trimmedCountry ?? null,
                userId: String(user.id ?? ''),
                additionalRecipients: countryRecipientList,
            });
        }
        catch (notifyError) {
            console.error('[auth/register] Failed to notify admin about new couple registration', notifyError);
        }
        const responsePayload = {
            message: "Registration successful! Please check your and your partner's email inboxes to verify your account.",
        };
        if (primaryVerification && !primaryVerification.emailSent) {
            responsePayload.message =
                'Registration successful. Verification email delivery failed; please use the manual link or try again later.';
        }
        if (manualVerificationHints.length && exposeVerificationTokens) {
            responsePayload.manualVerification = manualVerificationHints;
        }
        return res.status(201).json(responsePayload);
    }
    catch (e) {
        console.error('[auth/register]', e);
        return res.status(500).json({ message: 'Internal Server Error' });
    }
}
async function resendVerificationEmails(req, res) {
    const parsed = authSchemas_1.resendVerificationSchema.safeParse({ body: req.body });
    if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues });
    }
    const primaryEmail = parsed.data.body.primaryEmail.trim().toLowerCase();
    const partnerEmail = parsed.data.body.partnerEmail.trim().toLowerCase();
    try {
        const account = await (0, userService_1.findCoupleByEmails)(primaryEmail, partnerEmail);
        if (!account) {
            return res.status(404).json({
                message: 'We could not find a couple account with those email addresses.',
            });
        }
        const allowedEmails = new Set([primaryEmail, partnerEmail]);
        const pendingTargets = [];
        if (!account.isEmailVerified && account.primaryEmail && allowedEmails.has(account.primaryEmail)) {
            pendingTargets.push({ type: 'primary', email: account.primaryEmail });
        }
        if (!account.isPartnerEmailVerified &&
            account.partnerEmail &&
            allowedEmails.has(account.partnerEmail)) {
            pendingTargets.push({ type: 'partner', email: account.partnerEmail });
        }
        if (!pendingTargets.length) {
            return res.status(200).json({
                message: 'Both email addresses are already verified.',
                sentTo: [],
            });
        }
        const partnerDisplayName = account.username ??
            account.partner1Nickname ??
            account.partner2Nickname ??
            maskEmailAddress(account.primaryEmail);
        const exposeVerificationTokens = shouldExposeVerificationTokens();
        const manualVerificationHints = [];
        const failedRecipients = [];
        for (const target of pendingTargets) {
            if (target.type === 'primary') {
                let verificationResult = null;
                try {
                    verificationResult = await (0, emailService_1.sendVerificationEmail)(account.id, target.email);
                }
                catch (verificationError) {
                    console.error('[auth/resend-verification] Failed to send primary verification email', verificationError);
                }
                if (!verificationResult || !verificationResult.emailSent) {
                    failedRecipients.push({ type: 'primary', email: target.email, reason: 'email_service_unavailable' });
                    if (verificationResult && exposeVerificationTokens) {
                        manualVerificationHints.push({
                            type: 'primary',
                            email: target.email,
                            frontendUrl: verificationResult.frontendLink,
                            backendUrl: verificationResult.backendLink,
                            token: verificationResult.token,
                        });
                    }
                }
            }
            else {
                try {
                    await (0, emailService_1.sendPartnerVerificationEmail)(account.id, target.email, partnerDisplayName);
                }
                catch (verificationError) {
                    console.error('[auth/resend-verification] Failed to send partner verification email', verificationError);
                    failedRecipients.push({ type: 'partner', email: target.email, reason: 'email_service_unavailable' });
                }
            }
        }
        const maskedRecipients = pendingTargets.map((target) => maskEmailAddress(target.email));
        let message = 'We re-sent your verification links.';
        if (pendingTargets.length === 1) {
            message =
                pendingTargets[0].type === 'primary'
                    ? 'We just re-sent the verification email to your address.'
                    : "We just re-sent the verification email to your partner.";
        }
        const responsePayload = {
            message,
            sentTo: maskedRecipients,
        };
        if (failedRecipients.length) {
            responsePayload.message =
                failedRecipients.length === pendingTargets.length
                    ? 'We could not deliver the verification emails. Please use the manual link or try again later.'
                    : 'We re-sent your verification links, but a few could not be delivered.';
            responsePayload.undelivered = failedRecipients.map((entry) => ({
                type: entry.type,
                email: maskEmailAddress(entry.email),
                reason: entry.reason,
            }));
            if (manualVerificationHints.length && exposeVerificationTokens) {
                responsePayload.manualVerification = manualVerificationHints;
            }
            return res.status(202).json(responsePayload);
        }
        if (manualVerificationHints.length && exposeVerificationTokens) {
            responsePayload.manualVerification = manualVerificationHints;
        }
        return res.status(200).json(responsePayload);
    }
    catch (error) {
        console.error('[auth/resend-verification]', error);
        return res.status(500).json({
            message: 'We could not resend the verification email right now. Please try again shortly.',
        });
    }
}
async function login(req, res) {
    const body = normalizeAuthBody(req.body);
    const parsed = authSchemas_1.loginSchema.safeParse({ body });
    if (!parsed.success) {
        return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues });
    }
    const { email, password } = parsed.data.body;
    const normalizedEmail = email.toLowerCase();
    const user = await (0, userService_1.findUserByUsernameOrEmail)(normalizedEmail);
    if (!user || !user.passwordHash)
        return res.status(401).json({ message: 'Invalid credentials' });
    const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!ok)
        return res.status(401).json({ message: 'Invalid credentials' });
    if (user.kind === 'couple') {
        if (!user.isEmailVerified || !user.isPartnerEmailVerified) {
            return res.status(403).json({
                message: 'Account not fully verified. Please check your emails for verification links.',
                code: 'EMAIL_VERIFICATION_PENDING',
                unverifiedUser: { id: user.id, email: user.email },
            });
        }
        const membershipStatus = await (0, userService_1.refreshCoupleMembershipStatus)(String(user.id));
        const token = jsonwebtoken_1.default.sign({ id: String(user.id) }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
        const partnerEmailLower = typeof user.partnerEmail === 'string' ? user.partnerEmail.toLowerCase() : null;
        const activePartnerKey = partnerEmailLower && normalizedEmail === partnerEmailLower ? 'partner2' : 'partner1';
        const partner1Name = user.partner1Nickname ?? null;
        const partner2Name = user.partner2Nickname ?? null;
        const activePartnerName = activePartnerKey === 'partner2' ? partner2Name : partner1Name;
        const activePartnerEmail = activePartnerKey === 'partner2' ? user.partnerEmail ?? null : user.email ?? null;
        return res.status(200).json({
            id: String(user.id),
            email: user.email,
            username: user.username ?? null,
            partnerEmail: user.partnerEmail ?? null,
            partner1Nickname: user.partner1Nickname ?? null,
            partner2Nickname: user.partner2Nickname ?? null,
            partner1Name,
            partner2Name,
            isEmailVerified: user.isEmailVerified,
            isPartnerEmailVerified: user.isPartnerEmailVerified,
            activePartnerKey,
            activePartnerName,
            activePartnerEmail,
            accountKind: 'couple',
            membershipType: membershipStatus.membershipType ?? null,
            membershipExpiryDate: membershipStatus.membershipExpiryDate
                ? membershipStatus.membershipExpiryDate.toISOString()
                : null,
            membershipDowngraded: membershipStatus.downgraded,
        });
    }
    // Single-member login
    if (!user.isEmailVerified) {
        return res.status(403).json({
            message: 'Please confirm your email before signing in.',
            code: 'EMAIL_VERIFICATION_PENDING',
            unverifiedUser: { id: user.id, email: user.email },
        });
    }
    const token = jsonwebtoken_1.default.sign({ id: String(user.id), kind: 'single' }, process.env.JWT_SECRET, {
        expiresIn: '7d',
    });
    res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    const displayName = user.username ?? user.email ?? null;
    return res.status(200).json({
        id: String(user.id),
        email: user.email,
        username: user.username ?? null,
        partnerEmail: null,
        partner1Nickname: displayName,
        partner2Nickname: null,
        partner1Name: displayName,
        partner2Name: null,
        isEmailVerified: user.isEmailVerified ?? true,
        isPartnerEmailVerified: true,
        activePartnerKey: 'partner1',
        activePartnerName: displayName,
        activePartnerEmail: user.email ?? null,
        accountKind: 'single',
    });
}
async function me(req, res) {
    if (!req.user)
        return res.status(401).json({ message: 'Unauthorized' });
    return res.status(200).json({ id: req.user.id });
}
async function logout(_req, res) {
    res.cookie(COOKIE_NAME, '', { httpOnly: true, secure: true, sameSite: 'lax', expires: new Date(0) });
    return res.status(200).json({ ok: true });
}
async function initiatePasswordReset(req, res) {
    const value = typeof req.body?.email === 'string' ? req.body.email : '';
    const normalizedEmail = normalizeEmail(value);
    if (!normalizedEmail) {
        return res.status(400).json({ message: 'Email address is required.' });
    }
    if (!normalizedEmail.includes('@')) {
        return res.status(400).json({ message: 'Please enter a valid email address.' });
    }
    try {
        const user = await (0, userService_1.findUserByUsernameOrEmail)(normalizedEmail);
        if (!user) {
            return res.status(404).json({ message: 'We could not find an account for that email.' });
        }
        if (user.kind === 'single') {
            return res.status(400).json({
                message: 'Single member accounts should use their guide activation link to manage passwords. Please contact support if you need assistance.',
            });
        }
        const primaryEmail = typeof user.email === 'string' ? normalizeEmail(user.email) : '';
        const partnerEmail = typeof user.partnerEmail === 'string' ? normalizeEmail(user.partnerEmail) : '';
        const isPrimaryInitiator = normalizedEmail === primaryEmail;
        const isPartnerInitiator = normalizedEmail === partnerEmail;
        if (!isPrimaryInitiator && !isPartnerInitiator) {
            return res.status(400).json({
                message: 'Please enter the exact email associated with your shared account.',
            });
        }
        const counterpartyEmail = isPrimaryInitiator ? partnerEmail : primaryEmail;
        if (!counterpartyEmail) {
            return res.status(400).json({
                message: 'A partner email is required for this reset flow. Contact support for help.',
            });
        }
        const initiatingPartnerName = (isPrimaryInitiator ? user.partner1Nickname : user.partner2Nickname) ?? null;
        const partnerDisplayName = (isPrimaryInitiator ? user.partner2Nickname : user.partner1Nickname) ?? null;
        const pool = await (0, db_1.getPool)();
        const code = (0, crypto_1.randomInt)(0, 10 ** MFA_CODE_LENGTH)
            .toString()
            .padStart(MFA_CODE_LENGTH, '0');
        const codeExpiresAt = new Date(Date.now() + PASSWORD_RESET_CODE_EXPIRATION_MINUTES * 60 * 1000);
        const { requestId, mfaExpiresAt } = await (0, passwordResetService_1.createPasswordResetRequest)(pool, {
            userId: String(user.id),
            initiatingEmail: normalizedEmail,
            partnerEmail: counterpartyEmail,
            initiatingPartnerKey: isPrimaryInitiator ? 'primary' : 'partner',
            initiatingPartnerName,
            partnerDisplayName,
            plainCode: code,
            codeExpiresAt,
        });
        try {
            await (0, emailService_1.sendPasswordResetPartnerCodeEmail)(counterpartyEmail, {
                code,
                initiatorName: (initiatingPartnerName && initiatingPartnerName.trim()) ||
                    (user.username ?? null) ||
                    normalizedEmail,
                initiatorEmail: normalizedEmail,
                partnerDisplayName,
                expiresAt: codeExpiresAt,
            });
        }
        catch (emailError) {
            console.error('[auth/forgot-password:initiate/email]', emailError);
            return res.status(500).json({
                message: 'Unable to email the verification code. Please try again shortly.',
            });
        }
        return res.status(200).json({
            requestId,
            message: 'We emailed your partner a one-time verification code.',
            codeExpiresAt: mfaExpiresAt.toISOString(),
            partnerEmailHint: maskEmailAddress(counterpartyEmail),
        });
    }
    catch (error) {
        console.error('[auth/forgot-password:initiate]', error);
        return res
            .status(500)
            .json({ message: 'Unable to start the password reset flow. Please try again shortly.' });
    }
}
async function verifyPasswordResetCode(req, res) {
    const requestId = typeof req.body?.requestId === 'string' ? req.body.requestId.trim() : '';
    const rawCode = typeof req.body?.code === 'string' ? req.body.code : '';
    const sanitizedCode = rawCode.replace(/\D/g, '');
    if (!GUID_REGEX.test(requestId)) {
        return res.status(400).json({ message: 'This reset session is invalid. Start again.' });
    }
    if (sanitizedCode.length !== MFA_CODE_LENGTH) {
        return res.status(400).json({
            message: 'Enter the full verification code from your partner.',
        });
    }
    try {
        const pool = await (0, db_1.getPool)();
        const result = await (0, passwordResetService_1.verifyRequestAndIssueResetToken)(pool, {
            requestId,
            plainCode: sanitizedCode,
            resetTokenTtlMs: PASSWORD_RESET_LINK_EXPIRATION_MINUTES * 60 * 1000,
        });
        if (result.ok === false) {
            switch (result.reason) {
                case 'not_found':
                    return res
                        .status(404)
                        .json({ message: 'We could not find that reset request. Please start again.' });
                case 'already_used':
                    return res
                        .status(410)
                        .json({ message: 'This reset request has already been completed.' });
                case 'code_expired':
                    return res
                        .status(410)
                        .json({ message: 'That verification code expired. Start a new reset request.' });
                case 'code_invalid':
                default:
                    return res
                        .status(400)
                        .json({ message: 'That code is incorrect. Please double-check and try again.' });
            }
        }
        const record = result.record;
        if (!record.resetToken || !record.resetTokenExpiresAt) {
            console.error('[auth/forgot-password:verify] Missing reset token after verification', record);
            return res
                .status(500)
                .json({ message: 'Unable to issue a reset link right now. Please try again.' });
        }
        try {
            await (0, emailService_1.sendPasswordResetLinkEmail)(record.initiatingEmail, {
                token: record.resetToken,
                expiresAt: record.resetTokenExpiresAt,
                requesterName: record.initiatingPartnerName ?? record.initiatingEmail,
                approvingPartnerName: record.partnerDisplayName ?? null,
            });
        }
        catch (emailError) {
            console.error('[auth/forgot-password:verify/email]', emailError);
            return res.status(500).json({
                message: 'The code was accepted, but we could not email the reset link. Please try again.',
            });
        }
        return res.status(200).json({
            message: 'Code accepted. Check your inbox for the secure reset link.',
            resetTokenExpiresAt: record.resetTokenExpiresAt.toISOString(),
        });
    }
    catch (error) {
        console.error('[auth/forgot-password:verify]', error);
        return res
            .status(500)
            .json({ message: 'Unable to verify the code right now. Please try again shortly.' });
    }
}
async function resetPasswordWithToken(req, res) {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (!GUID_REGEX.test(token)) {
        return res.status(400).json({ message: 'This reset link is invalid.' });
    }
    if (!(0, passwordPolicy_1.isPasswordStrong)(newPassword)) {
        return res.status(400).json({
            message: passwordPolicy_1.PASSWORD_REQUIREMENTS_MESSAGE,
        });
    }
    try {
        const pool = await (0, db_1.getPool)();
        const requestRecord = await (0, passwordResetService_1.getRequestByResetToken)(pool, token);
        if (!requestRecord) {
            return res
                .status(404)
                .json({ message: 'This reset link is invalid or has already been used.' });
        }
        if (!requestRecord.mfaVerifiedAt) {
            return res.status(400).json({
                message: 'This reset link has not been approved yet. Ask your partner to share a code.',
            });
        }
        if (requestRecord.usedAt) {
            return res.status(410).json({ message: 'This reset link has already been used.' });
        }
        if (!requestRecord.resetTokenExpiresAt ||
            requestRecord.resetTokenExpiresAt.getTime() < Date.now()) {
            return res.status(410).json({
                message: 'This reset link has expired. Start the password reset process again.',
            });
        }
        const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
        const transaction = new db_1.sql.Transaction(pool);
        try {
            await transaction.begin();
            const updateUser = await new db_1.sql.Request(transaction)
                .input('UserID', db_1.sql.VarChar(255), requestRecord.userId)
                .input('PasswordHash', db_1.sql.NVarChar(255), passwordHash)
                .query(`
          UPDATE Users
          SET PasswordHash = @PasswordHash,
              UpdatedAt = GETUTCDATE()
          WHERE UserID = @UserID;
        `);
            if (!updateUser.rowsAffected?.[0]) {
                await transaction.rollback();
                return res.status(404).json({ message: 'We could not find that account anymore.' });
            }
            await new db_1.sql.Request(transaction)
                .input('RequestID', db_1.sql.UniqueIdentifier, requestRecord.requestId)
                .query(`
          UPDATE dbo.PasswordResetRequests
          SET UsedAt = SYSUTCDATETIME(),
              UpdatedAt = SYSUTCDATETIME()
          WHERE RequestID = @RequestID;
        `);
            await transaction.commit();
        }
        catch (txError) {
            try {
                await transaction.rollback();
            }
            catch (rollbackError) {
                console.error('[auth/reset-password] Rollback failed', rollbackError);
            }
            throw txError;
        }
        if (requestRecord.partnerEmail) {
            try {
                const { token: shareToken, expiresAt } = await (0, passwordShare_1.insertPasswordShareRecord)(pool, {
                    userId: requestRecord.userId,
                    partnerEmail: requestRecord.partnerEmail,
                    password: newPassword,
                });
                await (0, emailService_1.sendPasswordShareEmail)(requestRecord.partnerEmail, {
                    partnerName: requestRecord.partnerDisplayName ?? requestRecord.partnerEmail,
                    initiatorName: requestRecord.initiatingPartnerName ??
                        requestRecord.initiatingEmail ??
                        'Your partner',
                    token: shareToken,
                    expiresAt,
                });
            }
            catch (notificationError) {
                console.error('[auth/reset-password] Failed to dispatch password share email', notificationError);
            }
        }
        return res.status(200).json({
            message: 'Password updated. Your partner will receive a one-time link with the new password.',
        });
    }
    catch (error) {
        console.error('[auth/reset-password]', error);
        return res
            .status(500)
            .json({ message: 'Unable to reset the password right now. Please try again soon.' });
    }
}
async function verifyEmail(req, res) {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
        return res.status(400).send('Invalid verification link.');
    }
    try {
        const outcome = await processVerificationToken(token, 'primary');
        return res.redirect(`${FRONTEND_URL}/verify-email-link?status=success&partner=${encodeURIComponent(outcome.partnerStatus)}`);
    }
    catch (err) {
        console.error('Email verification error:', err);
        return res.redirect(`${FRONTEND_URL}/verify-email-link?status=error`);
    }
}
async function verifyPartnerEmail(req, res) {
    const { token } = req.query;
    if (!token || typeof token !== 'string') {
        return res.status(400).send('Invalid verification link.');
    }
    try {
        const outcome = await processVerificationToken(token, 'partner');
        return res.redirect(`${FRONTEND_URL}/verify-partner-email?status=success&partner=${encodeURIComponent(outcome.partnerStatus)}`);
    }
    catch (err) {
        console.error('Partner email verification error:', err);
        return res.redirect(`${FRONTEND_URL}/verify-partner-email?status=error`);
    }
}
async function verifyEmailApi(req, res) {
    const token = req.body?.token;
    if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: 'Verification token is required.' });
    }
    try {
        const outcome = await processVerificationToken(token, 'primary');
        return res.status(200).json({
            message: outcome.message,
            partnerStatus: outcome.partnerStatus,
        });
    }
    catch (error) {
        console.error('Email verification error:', error);
        const message = error instanceof VerificationError
            ? error.message
            : 'We couldnοΏ½t validate this link. It may be expired or already used.';
        return res.status(400).json({ message });
    }
}
async function verifyPartnerEmailApi(req, res) {
    const token = req.body?.token;
    if (!token || typeof token !== 'string') {
        return res.status(400).json({ message: 'Verification token is required.' });
    }
    try {
        const outcome = await processVerificationToken(token, 'partner');
        return res.status(200).json({
            message: outcome.message,
            partnerStatus: outcome.partnerStatus,
        });
    }
    catch (error) {
        console.error('Partner email verification error:', error);
        const message = error instanceof VerificationError
            ? error.message
            : 'We couldnοΏ½t validate this link. It may be expired or already used.';
        return res.status(400).json({ message });
    }
}
