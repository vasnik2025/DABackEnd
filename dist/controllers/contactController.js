"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSendContactForm = void 0;
const emailService_1 = require("../utils/emailService");
const errorHandler_1 = require("../utils/errorHandler");
const handleSendContactForm = async (req, res, next) => {
    const { name, email, subject, message } = req.body;
    if (!email || !subject || !message) {
        return next(new errorHandler_1.OperationalError('Email, subject, and message are required fields.', 400));
    }
    try {
        await (0, emailService_1.sendContactFormEmail)(name, email, subject, message);
        res.status(200).json({ message: 'Your message has been sent successfully! We will get back to you shortly.' });
    }
    catch (error) {
        next(error);
    }
};
exports.handleSendContactForm = handleSendContactForm;
