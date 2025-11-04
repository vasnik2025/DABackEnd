"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.viewPasswordShare = void 0;
const db_1 = require("../config/db");
const errorHandler_1 = require("../utils/errorHandler");
const passwordShare_1 = require("../utils/passwordShare");
const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const viewPasswordShare = async (req, res, next) => {
    const { token } = req.params;
    if (!token || !GUID_REGEX.test(token)) {
        return next(new errorHandler_1.OperationalError('Invalid or missing token.', 400));
    }
    try {
        const pool = await (0, db_1.getPool)();
        const record = await (0, passwordShare_1.getPasswordShareRecord)(pool, token);
        if (!record) {
            return next(new errorHandler_1.OperationalError('This link is no longer available.', 404));
        }
        if (record.usedAt) {
            return next(new errorHandler_1.OperationalError('This password has already been viewed.', 410));
        }
        const expiresAt = new Date(record.expiresAt);
        if (Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
            await (0, passwordShare_1.markPasswordShareUsed)(pool, token);
            return next(new errorHandler_1.OperationalError('This password link has expired.', 410));
        }
        const password = (0, passwordShare_1.decryptPasswordFromShare)(record.encryptedPayload);
        await (0, passwordShare_1.markPasswordShareUsed)(pool, token);
        res.status(200).json({ password });
    }
    catch (error) {
        next(error);
    }
};
exports.viewPasswordShare = viewPasswordShare;
