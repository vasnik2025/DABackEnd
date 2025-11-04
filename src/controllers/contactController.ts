// FIX: Changed type-only import to standard import to fix type resolution.
import type { Request, Response, NextFunction } from 'express';
import { sendContactFormEmail } from '../utils/emailService';
import { OperationalError } from '../utils/errorHandler';

export const handleSendContactForm = async (req: Request, res: Response, next: NextFunction) => {
    const { name, email, subject, message } = req.body;

    if (!email || !subject || !message) {
        return next(new OperationalError('Email, subject, and message are required fields.', 400));
    }

    try {
        await sendContactFormEmail(name, email, subject, message);
        res.status(200).json({ message: 'Your message has been sent successfully! We will get back to you shortly.' });
    } catch (error) {
        next(error as Error);
    }
};