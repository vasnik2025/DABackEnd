"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSendVerificationReminders = handleSendVerificationReminders;
exports.handleListVerificationRecipients = handleListVerificationRecipients;
exports.handleVerificationReminderSummary = handleVerificationReminderSummary;
exports.handleValidateVerificationPreferences = handleValidateVerificationPreferences;
exports.handleOptOutVerificationPreferences = handleOptOutVerificationPreferences;
const verificationReminderService_1 = require("../services/verificationReminderService");
const errorHandler_1 = require("../utils/errorHandler");
const emailService_1 = require("../utils/emailService");
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://DateAstrum.com').replace(/\/$/, '');
const buildPreferencesUrl = (token) => `${FRONTEND_URL}/preferences/verification?token=${encodeURIComponent(token)}`;
async function handleSendVerificationReminders(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const recipients = await (0, verificationReminderService_1.listVerificationReminderRecipients)();
        const results = {
            householdsAttempted: recipients.length,
            householdsEmailed: 0,
            emailsSent: 0,
            failures: [],
        };
        for (const recipient of recipients) {
            const token = (0, verificationReminderService_1.createVerificationPreferencesToken)(recipient.userId);
            const preferencesUrl = buildPreferencesUrl(token);
            try {
                await (0, emailService_1.sendVerificationReminderEmail)({
                    to: recipient.emails,
                    coupleNames: recipient.displayName,
                    preferencesUrl,
                    loginUrl: `${FRONTEND_URL}/login`,
                    resendUrl: `${FRONTEND_URL}/register`,
                    primaryVerified: recipient.primaryVerified,
                    partnerVerified: recipient.partnerVerified,
                });
                results.householdsEmailed += 1;
                results.emailsSent += recipient.emails.length;
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : 'Unknown error';
                results.failures.push({ userId: recipient.userId, reason });
            }
        }
        const summary = await (0, verificationReminderService_1.getVerificationReminderSummary)();
        return res.status(200).json({ results, summary });
    }
    catch (error) {
        return next(error);
    }
}
async function handleListVerificationRecipients(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const recipients = await (0, verificationReminderService_1.listVerificationReminderRecipients)();
        return res.status(200).json({ recipients });
    }
    catch (error) {
        return next(error);
    }
}
async function handleVerificationReminderSummary(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const summary = await (0, verificationReminderService_1.getVerificationReminderSummary)();
        return res.status(200).json(summary);
    }
    catch (error) {
        return next(error);
    }
}
async function handleValidateVerificationPreferences(req, res, next) {
    const token = typeof req.query.token === 'string'
        ? req.query.token
        : typeof req.body?.token === 'string'
            ? req.body.token
            : '';
    if (!token) {
        return res.status(400).json({
            status: 'fail',
            message: 'Missing preferences token.',
        });
    }
    try {
        const { userId } = (0, verificationReminderService_1.verifyVerificationPreferencesToken)(token);
        const context = await (0, verificationReminderService_1.getVerificationPreferencesContext)(userId);
        if (!context) {
            return res.status(404).json({
                status: 'fail',
                message: 'Account not found.',
            });
        }
        return res.status(200).json({
            status: 'ok',
            token,
            coupleName: context.displayName,
            optedOut: context.optedOut,
            optOutAt: context.optOutAt,
        });
    }
    catch (error) {
        if (error instanceof errorHandler_1.OperationalError) {
            return res.status(error.statusCode).json({
                status: error.status,
                message: error.message,
            });
        }
        return next(error);
    }
}
async function handleOptOutVerificationPreferences(req, res, next) {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (!token) {
        return res.status(400).json({
            status: 'fail',
            message: 'Missing preferences token.',
        });
    }
    try {
        const { userId } = (0, verificationReminderService_1.verifyVerificationPreferencesToken)(token);
        await (0, verificationReminderService_1.markVerificationOptOut)(userId);
        const context = await (0, verificationReminderService_1.getVerificationPreferencesContext)(userId);
        return res.status(200).json({
            status: 'ok',
            optedOut: true,
            coupleName: context?.displayName ?? 'there',
            optOutAt: context?.optOutAt ?? new Date().toISOString(),
        });
    }
    catch (error) {
        if (error instanceof errorHandler_1.OperationalError) {
            return res.status(error.statusCode).json({
                status: error.status,
                message: error.message,
            });
        }
        return next(error);
    }
}
