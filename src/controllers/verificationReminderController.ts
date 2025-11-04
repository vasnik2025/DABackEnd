import type { Request, Response, NextFunction } from 'express';
import type { AuthedRequest } from '../middleware/auth';
import {
  createVerificationPreferencesToken,
  getVerificationPreferencesContext,
  getVerificationReminderSummary,
  listVerificationReminderRecipients,
  markVerificationOptOut,
  verifyVerificationPreferencesToken,
} from '../services/verificationReminderService';
import { OperationalError } from '../utils/errorHandler';
import { sendVerificationReminderEmail } from '../utils/emailService';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://DateAstrum.com').replace(/\/$/, '');

const buildPreferencesUrl = (token: string): string =>
  `${FRONTEND_URL}/preferences/verification?token=${encodeURIComponent(token)}`;

export async function handleSendVerificationReminders(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const recipients = await listVerificationReminderRecipients();
    const results = {
      householdsAttempted: recipients.length,
      householdsEmailed: 0,
      emailsSent: 0,
      failures: [] as Array<{ userId: string; reason: string }>,
    };

    for (const recipient of recipients) {
      const token = createVerificationPreferencesToken(recipient.userId);
      const preferencesUrl = buildPreferencesUrl(token);

      try {
        await sendVerificationReminderEmail({
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
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        results.failures.push({ userId: recipient.userId, reason });
      }
    }

    const summary = await getVerificationReminderSummary();
    return res.status(200).json({ results, summary });
  } catch (error) {
    return next(error as Error);
  }
}

export async function handleListVerificationRecipients(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const recipients = await listVerificationReminderRecipients();
    return res.status(200).json({ recipients });
  } catch (error) {
    return next(error as Error);
  }
}

export async function handleVerificationReminderSummary(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const summary = await getVerificationReminderSummary();
    return res.status(200).json(summary);
  } catch (error) {
    return next(error as Error);
  }
}

export async function handleValidateVerificationPreferences(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token =
    typeof req.query.token === 'string'
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
    const { userId } = verifyVerificationPreferencesToken(token);
    const context = await getVerificationPreferencesContext(userId);
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
  } catch (error) {
    if (error instanceof OperationalError) {
      return res.status(error.statusCode).json({
        status: error.status,
        message: error.message,
      });
    }
    return next(error as Error);
  }
}

export async function handleOptOutVerificationPreferences(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  if (!token) {
    return res.status(400).json({
      status: 'fail',
      message: 'Missing preferences token.',
    });
  }

  try {
    const { userId } = verifyVerificationPreferencesToken(token);
    await markVerificationOptOut(userId);
    const context = await getVerificationPreferencesContext(userId);

    return res.status(200).json({
      status: 'ok',
      optedOut: true,
      coupleName: context?.displayName ?? 'there',
      optOutAt: context?.optOutAt ?? new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof OperationalError) {
      return res.status(error.statusCode).json({
        status: error.status,
        message: error.message,
      });
    }
    return next(error as Error);
  }
}

