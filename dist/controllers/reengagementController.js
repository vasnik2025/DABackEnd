"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSendReengagementReminders = handleSendReengagementReminders;
exports.handleListReengagementRecipients = handleListReengagementRecipients;
exports.handleGetReengagementSummary = handleGetReengagementSummary;
exports.handleValidateReengagementPreferences = handleValidateReengagementPreferences;
exports.handleOptOutReengagementPreferences = handleOptOutReengagementPreferences;
const reengagementService_1 = require("../services/reengagementService");
const errorHandler_1 = require("../utils/errorHandler");
const emailService_1 = require("../utils/emailService");
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://DateAstrum.com').replace(/\/$/, '');
const buildPreferencesUrl = (token) => `${FRONTEND_URL}/preferences/reengagement?token=${encodeURIComponent(token)}`;
const LOGIN_URL = `${FRONTEND_URL}/login`;
async function handleSendReengagementReminders(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const recipients = await (0, reengagementService_1.listEligibleReengagementRecipients)();
        const results = {
            householdsAttempted: recipients.length,
            householdsEmailed: 0,
            emailsSent: 0,
            skippedHouseholds: 0,
            failures: [],
        };
        for (const recipient of recipients) {
            if (recipient.emails.length === 0) {
                results.skippedHouseholds += 1;
                continue;
            }
            const token = (0, reengagementService_1.createReengagementToken)(recipient.userId);
            const preferencesUrl = buildPreferencesUrl(token);
            try {
                await (0, emailService_1.sendReengagementReminderEmail)({
                    to: recipient.emails,
                    coupleNames: recipient.displayName,
                    loginUrl: LOGIN_URL,
                    preferencesUrl,
                });
                results.householdsEmailed += 1;
                results.emailsSent += recipient.emails.length;
            }
            catch (error) {
                const reason = error instanceof Error ? error.message : 'Unknown error';
                results.failures.push({ userId: recipient.userId, reason });
            }
        }
        const summary = await (0, reengagementService_1.getReengagementSummary)();
        return res.status(200).json({ results, summary });
    }
    catch (error) {
        return next(error);
    }
}
async function handleListReengagementRecipients(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const recipients = await (0, reengagementService_1.listEligibleReengagementRecipients)();
        return res.status(200).json({ recipients });
    }
    catch (error) {
        return next(error);
    }
}
async function handleGetReengagementSummary(req, res, next) {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const summary = await (0, reengagementService_1.getReengagementSummary)();
        return res.status(200).json(summary);
    }
    catch (error) {
        return next(error);
    }
}
async function handleValidateReengagementPreferences(req, res, next) {
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
        const { userId } = (0, reengagementService_1.verifyReengagementToken)(token);
        const context = await (0, reengagementService_1.getPreferencesContext)(userId);
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
async function handleOptOutReengagementPreferences(req, res, next) {
    const token = typeof req.body?.token === 'string' ? req.body.token : '';
    if (!token) {
        return res.status(400).json({
            status: 'fail',
            message: 'Missing preferences token.',
        });
    }
    try {
        const { userId } = (0, reengagementService_1.verifyReengagementToken)(token);
        await (0, reengagementService_1.markReengagementOptOut)(userId);
        const context = await (0, reengagementService_1.getPreferencesContext)(userId);
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
