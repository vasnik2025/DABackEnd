import type { Request, Response, NextFunction } from 'express';
import type { AuthedRequest } from '../middleware/auth';
import {
  createReengagementToken,
  getPreferencesContext,
  getReengagementSummary,
  listEligibleReengagementRecipients,
  markReengagementOptOut,
  verifyReengagementToken,
} from '../services/reengagementService';
import { OperationalError } from '../utils/errorHandler';
import { sendReengagementReminderEmail } from '../utils/emailService';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://swingerunion.com').replace(/\/$/, '');

const buildPreferencesUrl = (token: string): string =>
  `${FRONTEND_URL}/preferences/reengagement?token=${encodeURIComponent(token)}`;

const LOGIN_URL = `${FRONTEND_URL}/login`;

export async function handleSendReengagementReminders(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    const recipients = await listEligibleReengagementRecipients();
    const results = {
      householdsAttempted: recipients.length,
      householdsEmailed: 0,
      emailsSent: 0,
      skippedHouseholds: 0,
      failures: [] as Array<{ userId: string; reason: string }>,
    };

    for (const recipient of recipients) {
      if (recipient.emails.length === 0) {
        results.skippedHouseholds += 1;
        continue;
      }

      const token = createReengagementToken(recipient.userId);
      const preferencesUrl = buildPreferencesUrl(token);

      try {
        await sendReengagementReminderEmail({
          to: recipient.emails,
          coupleNames: recipient.displayName,
          loginUrl: LOGIN_URL,
          preferencesUrl,
        });
        results.householdsEmailed += 1;
        results.emailsSent += recipient.emails.length;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown error';
        results.failures.push({ userId: recipient.userId, reason });
      }
    }

    const summary = await getReengagementSummary();
    return res.status(200).json({ results, summary });
  } catch (error) {
    return next(error as Error);
  }
}

export async function handleListReengagementRecipients(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const recipients = await listEligibleReengagementRecipients();
    return res.status(200).json({ recipients });
  } catch (error) {
    return next(error as Error);
  }
}

export async function handleGetReengagementSummary(
  req: AuthedRequest,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const summary = await getReengagementSummary();
    return res.status(200).json(summary);
  } catch (error) {
    return next(error as Error);
  }
}

export async function handleValidateReengagementPreferences(
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
    const { userId } = verifyReengagementToken(token);
    const context = await getPreferencesContext(userId);
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

export async function handleOptOutReengagementPreferences(
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
    const { userId } = verifyReengagementToken(token);
    await markReengagementOptOut(userId);
    const context = await getPreferencesContext(userId);

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
