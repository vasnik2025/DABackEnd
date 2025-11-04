// FIX: Use `import type` for type-only imports to resolve conflicts.
import type { Request, Response } from 'express';
import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loginSchema, registerSchema, resendVerificationSchema } from '../validators/authSchemas';
// FIX: Use `import type` for type-only imports to resolve conflicts.
import type { AuthedRequest } from '../middleware/auth';
import { getPool, sql } from '../config/db';
import {
  findUserByEmail,
  createUser,
  createSingleUser,
  findUserByUsernameOrEmail,
  setUserEmailVerified,
  setPartnerEmailVerified,
  getUserVerificationStatus,
  refreshCoupleMembershipStatus,
  listCoupleEmailsByCountry,
  findCoupleByEmails,
} from '../services/userService';
import {
  createPasswordResetRequest,
  verifyRequestAndIssueResetToken,
  getRequestByResetToken,
} from '../services/passwordResetService';
import { upsertSingleProfile } from '../services/singleMemberService';
import {
  sendVerificationEmail,
  sendPartnerVerificationEmail,
  sendPasswordShareEmail,
  sendPasswordResetPartnerCodeEmail,
  sendPasswordResetLinkEmail,
  sendAdminNewMemberNotificationEmail,
} from '../utils/emailService';
import { insertPasswordShareRecord } from '../utils/passwordShare';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_REQUIREMENTS_MESSAGE,
  isPasswordStrong,
} from '../utils/passwordPolicy';

const COOKIE_NAME = 'sua';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://dateastrum.com').replace(/\/$/, '');

const PASSWORD_RESET_CODE_EXPIRATION_MINUTES = Math.max(
  1,
  Number(process.env.PASSWORD_RESET_CODE_EXPIRATION_MINUTES ?? 10),
);
const PASSWORD_RESET_LINK_EXPIRATION_MINUTES = Math.max(
  5,
  Number(process.env.PASSWORD_RESET_LINK_EXPIRATION_MINUTES ?? 60),
);
const MFA_CODE_LENGTH = 6;
const GUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const normalizeEmail = (value: string): string => value.trim().toLowerCase();

const maskEmailAddress = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) {
    return `${local.charAt(0) || '*'}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
};

class VerificationError extends Error {}

type VerificationOutcome = {
  partnerStatus: 'awaiting' | 'complete';
  message: string;
};

const PRIMARY_SUCCESS_MESSAGES: Record<'awaiting' | 'complete', string> = {
  awaiting:
    "Your email is verified. We've notified your partner. Once they confirm their link, your suite unlocks.",
  complete:
    "Both of you are now verified. Welcome in; you can sign in together right away.",
};

const PARTNER_SUCCESS_MESSAGES: Record<'awaiting' | 'complete', string> = {
  awaiting:
    "Your email is confirmed. The primary partner still needs to complete their link before the suite unlocks.",
  complete:
    "Both of you are verified. Welcome inside and sign in together to explore DateAstrum.",
};
async function processVerificationToken(
  token: string,
  expectedType: 'primary' | 'partner',
): Promise<VerificationOutcome> {
  const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
    userId: string;
    type: string;
  };

  if (decoded.type !== expectedType) {
    throw new VerificationError('This verification link does not match this account.');
  }

  if (expectedType === 'primary') {
    await setUserEmailVerified(decoded.userId);
  } else {
    await setPartnerEmailVerified(decoded.userId);
  }

  const verification = await getUserVerificationStatus(decoded.userId);

  const partnerStatus =
    expectedType === 'primary'
      ? verification.isPartnerEmailVerified
        ? 'complete'
        : 'awaiting'
      : verification.isEmailVerified
      ? 'complete'
      : 'awaiting';

  const message =
    expectedType === 'primary'
      ? PRIMARY_SUCCESS_MESSAGES[partnerStatus]
      : PARTNER_SUCCESS_MESSAGES[partnerStatus];

  return { partnerStatus, message };
}

// Accept aliases your UI sometimes uses
function normalizeAuthBody(body: any) {
  const email = String(body?.email ?? body?.usernameOrEmail ?? body?.identifier ?? body?.username ?? '')
    .trim().toLowerCase();
  const password = typeof body?.password === 'string' ? body.password : '';
  return { email, password };
}

export async function register(req: Request, res: Response) {
  try {
    const parsed = registerSchema.safeParse({ body: req.body });
    if (!parsed.success) {
      return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues });
    }

    const {
      accountType,
      email,
      password,
      partnerEmail,
      username,
      coupleType,
      country,
      city,
      partner1Nickname,
      partner2Nickname,
    } = parsed.data.body;

    const normalizedAccountType = accountType === 'single' ? 'single' : 'couple';

    if (!isPasswordStrong(password)) {
      return res.status(400).json({ message: PASSWORD_REQUIREMENTS_MESSAGE });
    }

    const normalizedEmail = normalizeEmail(email);
    const normalizedPartnerEmail = partnerEmail ? normalizeEmail(partnerEmail) : null;
    const trimmedUsername = username.trim();
    const trimmedPartner1Nickname = partner1Nickname.trim();
    const trimmedPartner2Nickname = partner2Nickname?.trim() ?? '';
    const trimmedCountry = country.trim();
    const trimmedCity = city.trim();

    const existingByEmail = await findUserByEmail(normalizedEmail);
    if (existingByEmail) return res.status(409).json({ message: 'Email already in use' });

    const existingUsername = await findUserByUsernameOrEmail(trimmedUsername.toLowerCase());
    if (existingUsername) return res.status(409).json({ message: 'Username already in use' });

    const hash = await bcrypt.hash(password, 10);

    if (normalizedAccountType === 'single') {
      if (!trimmedPartner1Nickname.length) {
        return res.status(400).json({ message: 'Nickname is required.' });
      }

      const singleUser = await createSingleUser({
        email: normalizedEmail,
        passwordHash: hash,
        username: trimmedUsername,
      });

      try {
        await upsertSingleProfile(singleUser.id, null, {
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
      } catch (profileError) {
        console.error('[auth/register] Failed to upsert single profile', profileError);
      }

      await sendVerificationEmail(singleUser.id, normalizedEmail);

      try {
        await sendAdminNewMemberNotificationEmail({
          accountType: 'single',
          primaryEmail: normalizedEmail,
          username: trimmedUsername,
          country: trimmedCountry || null,
          city: trimmedCity || null,
          userId: String(singleUser.id ?? ''),
        });
      } catch (notifyError) {
        console.error('[auth/register] Failed to notify admin about new single registration', notifyError);
      }

      return res.status(201).json({
        message: 'Registration successful! Please check your email to verify your account.',
      });
    }

    const exists = existingByEmail;
    if (exists) return res.status(409).json({ message: 'Email already in use' });
    if (normalizedPartnerEmail) {
        const partnerExists = await findUserByEmail(normalizedPartnerEmail);
        if (partnerExists) return res.status(409).json({ message: 'Partner email already in use' });
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
    
    const user = await createUser(userPayload);

    let countryRecipientList: string[] = [];
    if (trimmedCountry) {
      try {
        const existingCouples = await listCoupleEmailsByCountry(trimmedCountry, {
          excludeUserId: String(user.id ?? ''),
        });
        const recipientLookup = new Map<string, string>();

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
      } catch (listError) {
        console.error(
          `[auth/register] Failed to fetch existing couples for country ${country}`,
          listError,
        );
      }
    }

    // Send verification emails
    await sendVerificationEmail(user.id, normalizedEmail);
    if (normalizedPartnerEmail) {
      await sendPartnerVerificationEmail(user.id, normalizedPartnerEmail, trimmedUsername);
    }
    try {
      await sendAdminNewMemberNotificationEmail({
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
    } catch (notifyError) {
      console.error('[auth/register] Failed to notify admin about new couple registration', notifyError);
    }
    
    return res.status(201).json({ message: 'Registration successful! Please check your and your partner\'s email inboxes to verify your account.' });
  } catch (e) {
    console.error('[auth/register]', e);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}

export async function resendVerificationEmails(req: Request, res: Response) {
  const parsed = resendVerificationSchema.safeParse({ body: req.body });
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues });
  }

  const primaryEmail = parsed.data.body.primaryEmail.trim().toLowerCase();
  const partnerEmail = parsed.data.body.partnerEmail.trim().toLowerCase();

  try {
    const account = await findCoupleByEmails(primaryEmail, partnerEmail);
    if (!account) {
      return res.status(404).json({
        message: 'We could not find a couple account with those email addresses.',
      });
    }

    const allowedEmails = new Set([primaryEmail, partnerEmail]);
    const pendingTargets: Array<{ type: 'primary' | 'partner'; email: string }> = [];

    if (!account.isEmailVerified && account.primaryEmail && allowedEmails.has(account.primaryEmail)) {
      pendingTargets.push({ type: 'primary', email: account.primaryEmail });
    }

    if (
      !account.isPartnerEmailVerified &&
      account.partnerEmail &&
      allowedEmails.has(account.partnerEmail)
    ) {
      pendingTargets.push({ type: 'partner', email: account.partnerEmail });
    }

    if (!pendingTargets.length) {
      return res.status(200).json({
        message: 'Both email addresses are already verified.',
        sentTo: [],
      });
    }

    const partnerDisplayName =
      account.username ??
      account.partner1Nickname ??
      account.partner2Nickname ??
      maskEmailAddress(account.primaryEmail);

    for (const target of pendingTargets) {
      if (target.type === 'primary') {
        await sendVerificationEmail(account.id, target.email);
      } else {
        await sendPartnerVerificationEmail(account.id, target.email, partnerDisplayName);
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

    return res.status(200).json({
      message,
      sentTo: maskedRecipients,
    });
  } catch (error) {
    console.error('[auth/resend-verification]', error);
    return res.status(500).json({
      message: 'We could not resend the verification email right now. Please try again shortly.',
    });
  }
}

export async function login(req: Request, res: Response) {
  const body = normalizeAuthBody(req.body);
  const parsed = loginSchema.safeParse({ body });
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid payload', issues: parsed.error.issues });
  }
  const { email, password } = parsed.data.body;
  const normalizedEmail = email.toLowerCase();

  const user = await findUserByUsernameOrEmail(normalizedEmail);
  if (!user || !user.passwordHash) return res.status(401).json({ message: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

  if (user.kind === 'couple') {
    if (!user.isEmailVerified || !user.isPartnerEmailVerified) {
      return res.status(403).json({
        message: 'Account not fully verified. Please check your emails for verification links.',
        code: 'EMAIL_VERIFICATION_PENDING',
        unverifiedUser: { id: user.id, email: user.email },
      });
    }

    const membershipStatus = await refreshCoupleMembershipStatus(String(user.id));

    const token = jwt.sign({ id: String(user.id) }, process.env.JWT_SECRET as string, { expiresIn: '7d' });
    res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });

    const partnerEmailLower = typeof user.partnerEmail === 'string' ? user.partnerEmail.toLowerCase() : null;
    const activePartnerKey =
      partnerEmailLower && normalizedEmail === partnerEmailLower ? 'partner2' : 'partner1';

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

  const token = jwt.sign({ id: String(user.id), kind: 'single' }, process.env.JWT_SECRET as string, {
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

export async function me(req: AuthedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  return res.status(200).json({ id: req.user.id });
}

export async function logout(_req: Request, res: Response) {
  res.cookie(COOKIE_NAME, '', { httpOnly: true, secure: true, sameSite: 'lax', expires: new Date(0) });
  return res.status(200).json({ ok: true });
}

export async function initiatePasswordReset(req: Request, res: Response) {
  const value = typeof req.body?.email === 'string' ? req.body.email : '';
  const normalizedEmail = normalizeEmail(value);

  if (!normalizedEmail) {
    return res.status(400).json({ message: 'Email address is required.' });
  }
  if (!normalizedEmail.includes('@')) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  try {
    const user = await findUserByUsernameOrEmail(normalizedEmail);
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

    const initiatingPartnerName = (
      isPrimaryInitiator ? user.partner1Nickname : user.partner2Nickname
    ) ?? null;
    const partnerDisplayName = (
      isPrimaryInitiator ? user.partner2Nickname : user.partner1Nickname
    ) ?? null;

    const pool = await getPool();
    const code = randomInt(0, 10 ** MFA_CODE_LENGTH)
      .toString()
      .padStart(MFA_CODE_LENGTH, '0');
    const codeExpiresAt = new Date(
      Date.now() + PASSWORD_RESET_CODE_EXPIRATION_MINUTES * 60 * 1000,
    );

    const { requestId, mfaExpiresAt } = await createPasswordResetRequest(pool, {
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
      await sendPasswordResetPartnerCodeEmail(counterpartyEmail, {
        code,
        initiatorName:
          (initiatingPartnerName && initiatingPartnerName.trim()) ||
          (user.username ?? null) ||
          normalizedEmail,
        initiatorEmail: normalizedEmail,
        partnerDisplayName,
        expiresAt: codeExpiresAt,
      });
    } catch (emailError) {
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
  } catch (error) {
    console.error('[auth/forgot-password:initiate]', error);
    return res
      .status(500)
      .json({ message: 'Unable to start the password reset flow. Please try again shortly.' });
  }
}

export async function verifyPasswordResetCode(req: Request, res: Response) {
  const requestId =
    typeof req.body?.requestId === 'string' ? req.body.requestId.trim() : '';
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
    const pool = await getPool();
    const result = await verifyRequestAndIssueResetToken(pool, {
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
      console.error(
        '[auth/forgot-password:verify] Missing reset token after verification',
        record,
      );
      return res
        .status(500)
        .json({ message: 'Unable to issue a reset link right now. Please try again.' });
    }

    try {
      await sendPasswordResetLinkEmail(record.initiatingEmail, {
        token: record.resetToken,
        expiresAt: record.resetTokenExpiresAt,
        requesterName: record.initiatingPartnerName ?? record.initiatingEmail,
        approvingPartnerName: record.partnerDisplayName ?? null,
      });
    } catch (emailError) {
      console.error('[auth/forgot-password:verify/email]', emailError);
      return res.status(500).json({
        message: 'The code was accepted, but we could not email the reset link. Please try again.',
      });
    }

    return res.status(200).json({
      message: 'Code accepted. Check your inbox for the secure reset link.',
      resetTokenExpiresAt: record.resetTokenExpiresAt.toISOString(),
    });
  } catch (error) {
    console.error('[auth/forgot-password:verify]', error);
    return res
      .status(500)
      .json({ message: 'Unable to verify the code right now. Please try again shortly.' });
  }
}

export async function resetPasswordWithToken(req: Request, res: Response) {
  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  if (!GUID_REGEX.test(token)) {
    return res.status(400).json({ message: 'This reset link is invalid.' });
  }

  if (!isPasswordStrong(newPassword)) {
    return res.status(400).json({
      message: PASSWORD_REQUIREMENTS_MESSAGE,
    });
  }

  try {
    const pool = await getPool();
    const requestRecord = await getRequestByResetToken(pool, token);
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

    if (
      !requestRecord.resetTokenExpiresAt ||
      requestRecord.resetTokenExpiresAt.getTime() < Date.now()
    ) {
      return res.status(410).json({
        message: 'This reset link has expired. Start the password reset process again.',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    const transaction = new sql.Transaction(pool);
    try {
      await transaction.begin();

      const updateUser = await new sql.Request(transaction)
        .input('UserID', sql.VarChar(255), requestRecord.userId)
        .input('PasswordHash', sql.NVarChar(255), passwordHash)
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

      await new sql.Request(transaction)
        .input('RequestID', sql.UniqueIdentifier, requestRecord.requestId)
        .query(`
          UPDATE dbo.PasswordResetRequests
          SET UsedAt = SYSUTCDATETIME(),
              UpdatedAt = SYSUTCDATETIME()
          WHERE RequestID = @RequestID;
        `);

      await transaction.commit();
    } catch (txError) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error('[auth/reset-password] Rollback failed', rollbackError);
      }
      throw txError;
    }

    if (requestRecord.partnerEmail) {
      try {
        const { token: shareToken, expiresAt } = await insertPasswordShareRecord(pool, {
          userId: requestRecord.userId,
          partnerEmail: requestRecord.partnerEmail,
          password: newPassword,
        });

        await sendPasswordShareEmail(requestRecord.partnerEmail, {
          partnerName: requestRecord.partnerDisplayName ?? requestRecord.partnerEmail,
          initiatorName:
            requestRecord.initiatingPartnerName ??
            requestRecord.initiatingEmail ??
            'Your partner',
          token: shareToken,
          expiresAt,
        });
      } catch (notificationError) {
        console.error(
          '[auth/reset-password] Failed to dispatch password share email',
          notificationError,
        );
      }
    }

    return res.status(200).json({
      message:
        'Password updated. Your partner will receive a one-time link with the new password.',
    });
  } catch (error) {
    console.error('[auth/reset-password]', error);
    return res
      .status(500)
      .json({ message: 'Unable to reset the password right now. Please try again soon.' });
  }
}

export async function verifyEmail(req: Request, res: Response) {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
        return res.status(400).send('Invalid verification link.');
    }

    try {
        const outcome = await processVerificationToken(token, 'primary');

        return res.redirect(
          `${FRONTEND_URL}/verify-email-link?status=success&partner=${encodeURIComponent(outcome.partnerStatus)}`,
        );
    } catch (err) {
        console.error('Email verification error:', err);
        return res.redirect(`${FRONTEND_URL}/verify-email-link?status=error`);
    }
}

export async function verifyPartnerEmail(req: Request, res: Response) {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
        return res.status(400).send('Invalid verification link.');
    }

    try {
        const outcome = await processVerificationToken(token, 'partner');

        return res.redirect(
          `${FRONTEND_URL}/verify-partner-email?status=success&partner=${encodeURIComponent(outcome.partnerStatus)}`,
        );
    } catch (err) {
        console.error('Partner email verification error:', err);
        return res.redirect(`${FRONTEND_URL}/verify-partner-email?status=error`);
    }
}


export async function verifyEmailApi(req: Request, res: Response) {
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
    } catch (error) {
        console.error('Email verification error:', error);
        const message = error instanceof VerificationError
            ? error.message
            : 'We couldnοΏ½t validate this link. It may be expired or already used.';
        return res.status(400).json({ message });
    }
}

export async function verifyPartnerEmailApi(req: Request, res: Response) {
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
    } catch (error) {
        console.error('Partner email verification error:', error);
        const message = error instanceof VerificationError
            ? error.message
            : 'We couldnοΏ½t validate this link. It may be expired or already used.';
        return res.status(400).json({ message });
    }
}




