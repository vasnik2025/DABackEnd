import type { Request, Response, NextFunction } from 'express';
import {
  fetchSplashSurveyStats,
  normalizeInterest,
  recordSplashPageView,
  recordSplashSurveySubmission,
  recordSplashVisitorEmail,
  fetchSplashVisitorEmails,
  fetchSplashVisitorEmailCount,
  type SplashSurveySubmission,
} from '../services/splashSurveyService';
import { sendContactFormEmail } from '../utils/emailService';
import { OperationalError } from '../utils/errorHandler';
import type { AuthedRequest } from '../middleware/auth';

const CONTACT_NAME = 'SwingerUnion Splash Visitor';
const CONTACT_EMAIL = 'noreply@swingerunion.com';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function extractIpAddress(req: Request): string | null {
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

function extractCountry(req: Request): string | null {
  const headerCandidates: Array<string | string[] | undefined> = [
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

function buildContactEmailPayload(submission: SplashSurveySubmission, idea: string | null): {
  subject: string;
  message: string;
} {
  const subject =
    submission.interest === 'yes'
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

export const submitSplashSurvey = async (req: Request, res: Response, next: NextFunction) => {
  const rawInterest = typeof req.body?.interest === 'string' ? req.body.interest : null;
  const rawIdea = typeof req.body?.idea === 'string' ? req.body.idea : null;

  if (!rawInterest) {
    return next(new OperationalError('Interest selection is required.', 400));
  }

  let normalizedInterest: SplashSurveySubmission['interest'];
  try {
    normalizedInterest = normalizeInterest(rawInterest);
  } catch (error) {
    return next(new OperationalError('Invalid interest value provided.', 400));
  }

  try {
    const sanitizedIdea = rawIdea?.trim() ? rawIdea.trim() : null;
    const submission: SplashSurveySubmission = {
      interest: normalizedInterest,
      idea: sanitizedIdea ?? undefined,
      userAgent: req.get('user-agent') ?? null,
      ipAddress: extractIpAddress(req),
      country: extractCountry(req),
    };

    const stats = await recordSplashSurveySubmission(submission);

    if (process.env.SPLASH_SURVEY_EMAIL_DISABLED !== 'true') {
      try {
        const { subject, message } = buildContactEmailPayload(submission, sanitizedIdea);
        await sendContactFormEmail(CONTACT_NAME, CONTACT_EMAIL, subject, message);
      } catch (emailError) {
        console.error('[splashSurvey] Failed to send guide notification email.', emailError);
      }
    }

    res.status(201).json({
      message: 'Your feedback reached the guide desk. Thank you for sharing your vibe!',
      stats,
    });
  } catch (error) {
    next(error as Error);
  }
};

export const getSplashSurveyStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const stats = await fetchSplashSurveyStats();
    res.json({ stats });
  } catch (error) {
    next(error as Error);
  }
};

export const recordSplashSurveyView = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await recordSplashPageView({
      userAgent: req.get('user-agent') ?? null,
      ipAddress: extractIpAddress(req),
      country: extractCountry(req),
    });
    res.status(204).send();
  } catch (error) {
    next(error as Error);
  }
};

export const submitSplashVisitorEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    if (!emailRaw || !EMAIL_REGEX.test(emailRaw)) {
      return next(new OperationalError('A valid email address is required.', 400));
    }

    await recordSplashVisitorEmail({
      email: emailRaw,
      ipAddress: extractIpAddress(req),
      userAgent: req.get('user-agent') ?? null,
    });

    const waitlistCount = await fetchSplashVisitorEmailCount();
    return res.status(201).json({
      message: 'Thanks for joining the guide waitlist. We will whisper when the doors open.',
      waitlistCount,
    });
  } catch (error) {
    next(error as Error);
  }
};

export const adminListSplashVisitorEmails = async (req: AuthedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ message: 'Authentication required.' });
    }
    const records = await fetchSplashVisitorEmails();
    return res.status(200).json({ emails: records });
  } catch (error) {
    next(error as Error);
  }
};

