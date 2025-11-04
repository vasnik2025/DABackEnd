"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminListSplashVisitorEmails = exports.submitSplashVisitorEmail = exports.recordSplashSurveyView = exports.getSplashSurveyStats = exports.submitSplashSurvey = void 0;
const splashSurveyService_1 = require("../services/splashSurveyService");
const emailService_1 = require("../utils/emailService");
const errorHandler_1 = require("../utils/errorHandler");
const CONTACT_NAME = 'DateAstrum Splash Visitor';
const CONTACT_EMAIL = 'noreply@DateAstrum.com';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function extractIpAddress(req) {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        const first = forwardedFor.split(',')[0]?.trim();
        if (first) {
            return first;
        }
    }
    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
        const first = forwardedFor[0]?.trim();
        if (first) {
            return first;
        }
    }
    return req.ip ?? null;
}
function extractCountry(req) {
    const headerCandidates = [
        req.headers['cf-ipcountry'],
        req.headers['cloudfront-viewer-country'],
        req.headers['x-vercel-ip-country'],
        req.headers['x-geo-country'],
        req.headers['x-country'],
        req.headers['x-country-code'],
    ];
    for (const candidate of headerCandidates) {
        if (Array.isArray(candidate)) {
            const first = candidate.find((value) => value && value.trim());
            if (first) {
                return first.trim();
            }
            continue;
        }
        if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
        }
    }
    const bodyCountry = typeof req.body?.country === 'string' ? req.body.country.trim() : null;
    if (bodyCountry) {
        return bodyCountry;
    }
    const queryCountry = typeof req.query?.country === 'string' ? req.query.country.trim() : null;
    if (queryCountry) {
        return queryCountry;
    }
    return null;
}
function buildContactEmailPayload(submission, idea) {
    const subject = submission.interest === 'yes'
        ? '[Splash Interest] Enthusiastic couple awaiting launch'
        : submission.interest === 'no'
            ? '[Splash Interest] Curious but cautious'
            : '[Splash Interest] Curious visitor';
    const messageLines = [
        `Interest selection: ${submission.interest.toUpperCase()}`,
        '',
        'Visitor idea / note:',
        idea ?? '(no idea submitted)',
        '',
        'Please route this splash feedback to vasnik2025@gmail.com.',
    ];
    return { subject, message: messageLines.join('\n') };
}
const submitSplashSurvey = async (req, res, next) => {
    const rawInterest = typeof req.body?.interest === 'string' ? req.body.interest : null;
    const rawIdea = typeof req.body?.idea === 'string' ? req.body.idea : null;
    if (!rawInterest) {
        return next(new errorHandler_1.OperationalError('Interest selection is required.', 400));
    }
    let normalizedInterest;
    try {
        normalizedInterest = (0, splashSurveyService_1.normalizeInterest)(rawInterest);
    }
    catch (error) {
        return next(new errorHandler_1.OperationalError('Invalid interest value provided.', 400));
    }
    try {
        const sanitizedIdea = rawIdea?.trim() ? rawIdea.trim() : null;
        const submission = {
            interest: normalizedInterest,
            idea: sanitizedIdea ?? undefined,
            userAgent: req.get('user-agent') ?? null,
            ipAddress: extractIpAddress(req),
            country: extractCountry(req),
        };
        const stats = await (0, splashSurveyService_1.recordSplashSurveySubmission)(submission);
        if (process.env.SPLASH_SURVEY_EMAIL_DISABLED !== 'true') {
            try {
                const { subject, message } = buildContactEmailPayload(submission, sanitizedIdea);
                await (0, emailService_1.sendContactFormEmail)(CONTACT_NAME, CONTACT_EMAIL, subject, message);
            }
            catch (emailError) {
                console.error('[splashSurvey] Failed to send guide notification email.', emailError);
            }
        }
        res.status(201).json({
            message: 'Your feedback reached the guide desk. Thank you for sharing your vibe!',
            stats,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.submitSplashSurvey = submitSplashSurvey;
const getSplashSurveyStats = async (req, res, next) => {
    try {
        const stats = await (0, splashSurveyService_1.fetchSplashSurveyStats)();
        res.json({ stats });
    }
    catch (error) {
        next(error);
    }
};
exports.getSplashSurveyStats = getSplashSurveyStats;
const recordSplashSurveyView = async (req, res, next) => {
    try {
        await (0, splashSurveyService_1.recordSplashPageView)({
            userAgent: req.get('user-agent') ?? null,
            ipAddress: extractIpAddress(req),
            country: extractCountry(req),
        });
        res.status(204).send();
    }
    catch (error) {
        next(error);
    }
};
exports.recordSplashSurveyView = recordSplashSurveyView;
const submitSplashVisitorEmail = async (req, res, next) => {
    try {
        const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
        if (!emailRaw || !EMAIL_REGEX.test(emailRaw)) {
            return next(new errorHandler_1.OperationalError('A valid email address is required.', 400));
        }
        await (0, splashSurveyService_1.recordSplashVisitorEmail)({
            email: emailRaw,
            ipAddress: extractIpAddress(req),
            userAgent: req.get('user-agent') ?? null,
        });
        const waitlistCount = await (0, splashSurveyService_1.fetchSplashVisitorEmailCount)();
        return res.status(201).json({
            message: 'Thanks for joining the guide waitlist. We will whisper when the doors open.',
            waitlistCount,
        });
    }
    catch (error) {
        next(error);
    }
};
exports.submitSplashVisitorEmail = submitSplashVisitorEmail;
const adminListSplashVisitorEmails = async (req, res, next) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ message: 'Authentication required.' });
        }
        const records = await (0, splashSurveyService_1.fetchSplashVisitorEmails)();
        return res.status(200).json({ emails: records });
    }
    catch (error) {
        next(error);
    }
};
exports.adminListSplashVisitorEmails = adminListSplashVisitorEmails;
