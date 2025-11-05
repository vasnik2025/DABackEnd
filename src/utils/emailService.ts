import { EmailClient, EmailMessage } from "@azure/communication-email";
import jwt from 'jsonwebtoken';
import { OperationalError } from "./errorHandler";

let emailClient: EmailClient | null = null;

// Senders must be configured as "MailFrom" addresses in your Azure Communication Resource
const SENDER_INFO = "DoNotReply@dateastrum.com";
const SENDER_SUBSCRIPTION = "DoNotReply@dateastrum.com";
const SUPPORT_EMAIL = "info@dateastrum.com";
// FIX: Changed sender to a valid 'MailFrom' address based on server logs.
const SENDER_NOTIFICATIONS = "DoNotReply@dateastrum.com";
const SENDER_SUPPORT = SENDER_NOTIFICATIONS;
const SENDER_VERIFICATION = "MailVerification@dateastrum.con";

const DEFAULT_ACS_CONNECTION_STRING =
  "endpoint=https://dateastrumms.germany.communication.azure.com/;accesskey=3FwJXB8sYKCkOI2bLFc6jjozcLoHObTpbVhZDpALhutnctTGdwqhJQQJ99BKACULyCpcK8IFAAAAAZCSP0Pd";

const rawConnectionString = process.env.COMMUNICATION_SERVICES_CONNECTION_STRING;
const ACS_CONNECTION_STRING =
  rawConnectionString && rawConnectionString.trim().length > 0
    ? rawConnectionString.trim()
    : DEFAULT_ACS_CONNECTION_STRING;

if (!rawConnectionString || rawConnectionString.trim().length === 0) {
  process.env.COMMUNICATION_SERVICES_CONNECTION_STRING = ACS_CONNECTION_STRING;
}

const ACS_ENDPOINT = (() => {
  const endpointPart = ACS_CONNECTION_STRING.split(';').find((part) =>
    part.toLowerCase().startsWith('endpoint='),
  );
  return endpointPart ? endpointPart.slice(endpointPart.indexOf('=') + 1) : 'unknown-endpoint';
})();

const BACKEND_URL = (process.env.BACKEND_URL || 'https://api.dateastrum.com').replace(/\/$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://dateastrum.com').replace(/\/$/, '');

const BRAND_SIGNATURE_TEXT = `Warm regards,
The DateAstrum Concierge Team
https://dateastrum.com`;

const BRAND_TEMPLATE_MARKER = 'data-su-template="DateAstrum"';

function ensurePlainTextSignature(text?: string | null): string | undefined {
  const base = (text ?? '').trimEnd();
  if (!base.length) {
    return `${BRAND_SIGNATURE_TEXT}`;
  }
  if (base.includes('DateAstrum Concierge Team')) {
    return base;
  }
  return `${base}\n\n${BRAND_SIGNATURE_TEXT}`;
}

function wrapWithBrandTemplate(html?: string | null): string | undefined {
  if (!html) {
    return html ?? undefined;
  }

  const trimmed = html.trim();
  if (!trimmed.length || trimmed.includes(BRAND_TEMPLATE_MARKER)) {
    return trimmed;
  }

  const bodyBlock = `<div style="font-size:16px;line-height:1.7;color:#0f172a;margin:0;padding:0;">
    ${trimmed}
  </div>`;

  return `<!DOCTYPE html>
  <html lang="en" ${BRAND_TEMPLATE_MARKER}>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>DateAstrum</title>
    </head>
    <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:linear-gradient(135deg,#ffe4e6,#fdf2f8);padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:24px;box-shadow:0 24px 48px rgba(15,23,42,0.12);overflow:hidden;">
              <tr>
                <td style="padding:40px;">
                  <div style="text-align:center;margin-bottom:28px;">
                    <img src="https://dateastrum.com/assets/img/logo-email.png" alt="DateAstrum" style="height:48px;display:inline-block;" />
                  </div>
                  ${bodyBlock}
                  <div style="margin-top:36px;border-top:1px solid #e2e8f0;padding-top:20px;font-size:14px;color:#475569;">
                    Warm regards,<br />
                    <strong>The DateAstrum Concierge Team</strong><br />
                    <a href="https://dateastrum.com" style="color:#db2777;text-decoration:none;">https://dateastrum.com</a>
                  </div>
                </td>
              </tr>
            </table>
            <div style="margin-top:24px;font-size:12px;color:#64748b;">
              © ${new Date().getFullYear()} DateAstrum. All rights reserved.
            </div>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}


function acsEnabled(): boolean {
  return ACS_CONNECTION_STRING.length > 0;
}

async function initEmailClient(): Promise<EmailClient | null> {
  if (!acsEnabled()) {
    console.warn('[emailService] Azure Communication Services not configured – email sending is disabled.');
    emailClient = null;
    return null;
  }
  try {
    emailClient = new EmailClient(ACS_CONNECTION_STRING);
    console.info(`[emailService] Azure Communication Services email client connected (endpoint: ${ACS_ENDPOINT}).`);
    return emailClient;
  } catch (e) {
    console.error('[emailService] Failed to create EmailClient.', e);
    emailClient = null;
    return null;
  }
}

export async function verifyMailConnections(): Promise<boolean> {
  if (!acsEnabled()) {
    console.info('[emailService] verifyMailConnections skipped (no connection string).');
    return false;
  }
  // With ACS, we can't truly "verify" without sending. 
  // But we can initialize the client to catch config errors.
  try {
    await initEmailClient();
    return emailClient !== null;
  } catch {
    return false;
  }
}

async function sendEmail(message: EmailMessage): Promise<void> {
  const client = emailClient ?? (await initEmailClient());
  if (!client) {
    const toList = message.recipients.to?.map(r => r.address).join(', ');
    console.info(`[emailService] sendEmail skipped (no client) to: ${toList}`);
    throw new OperationalError('Email service is not available.', 503);
  }

  if (message.content) {
    if (message.content.html) {
      message.content.html = wrapWithBrandTemplate(message.content.html);
    }
    message.content.plainText = ensurePlainTextSignature(message.content.plainText);
  }

  const maxAttempts = 3;
  const baseDelayMs = 1500;
  const shouldRetry = (error: any): boolean => {
    const status = Number(error?.statusCode ?? error?.response?.status ?? 0);
    return status === 502 || status === 503 || status === 504;
  };

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const poller: any = await client.beginSend(message);
        const result: any = await poller.pollUntilDone();

        if (result.status === 'Succeeded') {
          const toList = message.recipients.to?.map(r => r.address).join(', ');
          console.log(`[emailService] Email sent successfully via ACS to ${toList}`);
          return;
        }

        console.error('[emailService] ACS email send failed.', result);
        const errorDetails = result.error?.message || JSON.stringify(result.error);
        throw new Error(`Failed to send email: ${errorDetails}`);
      } catch (err) {
        if (attempt < maxAttempts && shouldRetry(err)) {
          const delay = baseDelayMs * attempt;
          console.warn(`[emailService] ACS send attempt ${attempt} failed with status ${err?.statusCode}; retrying in ${delay} ms.`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        throw err;
      }
    }
  } catch (e: any) {
    console.error('[emailService] Error sending email via ACS:', e);
    const messageText = String(e?.message ?? '');
    if (messageText.includes('EmailDroppedAllRecipientsSuppressed')) {
      const suppressedList = message.recipients.to?.map((recipient) => recipient.address).join(', ') ?? 'unknown recipients';
      console.warn(
        `[emailService] ACS dropped email because all recipients were suppressed. Skipping send. Recipients: ${suppressedList}`,
      );
      return;
    }
    throw new OperationalError(messageText || 'An unexpected error occurred while sending the email.', 500);
  }
}

// FIX: Overloaded function signature to accept either an object or individual arguments
export async function sendContactFormEmail(data: { name?: string; email: string; subject?: string; message: string }): Promise<void>;
export async function sendContactFormEmail(name: string | undefined, email: string, subject: string | undefined, message: string): Promise<void>;
export async function sendContactFormEmail(
  arg1: { name?: string; email: string; subject?: string; message: string } | string | undefined,
  arg2?: string,
  arg3?: string,
  arg4?: string
): Promise<void> {
  let name: string | undefined, email: string, subject: string | undefined, message: string;

  if (typeof arg1 === 'object' && arg1 !== null) {
    ({ name, email, subject, message } = arg1);
  } else {
    name = arg1 as string | undefined;
    email = arg2 as string;
    subject = arg3;
    message = arg4 as string;
  }

  const finalSubject = subject || 'Contact form submission';
  const plainTextContent = `New contact form submission\nName: ${name || '-'}\nReply-To Email: ${email}\nSubject: ${finalSubject}\n\n${message}`;
  const htmlContent = `<html><body><h3>New Contact Form Submission</h3><p><strong>Name:</strong> ${name || '<em>Not provided</em>'}</p><p><strong>Reply-To Email:</strong> <a href="mailto:${email}">${email}</a></p><p><strong>Subject:</strong> ${finalSubject}</p><hr><p>${message.replace(/\n/g, '<br>')}</p></body></html>`;

  const emailMessage: EmailMessage = {
    senderAddress: SENDER_INFO,
    recipients: { to: [{ address: SUPPORT_EMAIL }] },
    content: { subject: `[Contact Form] ${finalSubject}`, plainText: plainTextContent, html: htmlContent },
    replyTo: [{ address: email, displayName: name }]
  };
  await sendEmail(emailMessage);
}

export async function sendSubscriptionConfirmationEmail(
  to: string,
  details?: { planName?: string; price?: string | number; orderId?: string; nextBilling?: string } | any
): Promise<void> {
  const subject = 'Your subscription is active';
  const lines = ['Thanks for subscribing â€” your membership is now active.'];
  if (details?.planName) lines.push(`Plan: ${details.planName}`);
  if (details?.price) lines.push(`Price: ${details.price}`);
  if (details?.orderId) lines.push(`Order ID: ${details.orderId}`);
  if (details?.nextBilling) lines.push(`Next billing: ${details.nextBilling}`);

  const emailMessage: EmailMessage = {
    senderAddress: SENDER_SUBSCRIPTION,
    recipients: { to: [{address: to}] },
    content: { subject, plainText: lines.join('\n'), html: `<p>${lines.join('<br>')}</p>` }
  };
  await sendEmail(emailMessage);
}

export async function sendPlatinumExpiryReminderEmail(
  recipients: string[],
  payload?: { membershipExpiryDate?: Date | string | null },
): Promise<void> {
  const uniqueRecipients = Array.from(
    new Set(
      (recipients ?? [])
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0),
    ),
  );

  if (!uniqueRecipients.length) {
    return;
  }

  const expirySource = payload?.membershipExpiryDate ?? null;
  const expiryDate =
    expirySource instanceof Date
      ? expirySource
      : expirySource
      ? new Date(expirySource)
      : null;

  const expiryText = expiryDate
    ? expiryDate.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'soon';

  const subject = 'Reminder: Your Platinum membership is expiring';
  const plainTextContent = `
Hello lovers,

This is a friendly reminder that your DateAstrum Platinum membership will expire on ${expiryText}.
Renew within the next 5 days to keep every premium perk for just €2.

If you let it lapse, the account will automatically return to the Free tier and Platinum-only features will disappear.

You can renew inside DateAstrum under Settings ? Membership.

Play safe,
The DateAstrum Team
  `.trim();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="color:#db2777;">Your Platinum perks are about to lapse</h2>
      <p>Hello lovers,</p>
      <p>Your DateAstrum Platinum membership is due to expire on <strong>${expiryText}</strong>.</p>
      <p>Renew within the next 5 days to keep your premium tools for just <strong>€2</strong>. After the expiry date we will automatically switch your account back to the Free tier and all Platinum-only features will disappear.</p>
      <p style="margin-top: 24px;">
        Open the <strong>Settings ? Membership</strong> section inside DateAstrum to renew in a few taps.
      </p>
      <p style="margin-top:30px;">Play safe,<br/>The DateAstrum Team</p>
    </div>
  `.trim();

  const message: EmailMessage = {
    senderAddress: SENDER_SUBSCRIPTION,
    recipients: {
      to: uniqueRecipients.map((address) => ({ address })),
    },
    content: { subject, plainText: plainTextContent, html: htmlContent },
  };

  await sendEmail(message);
}

export async function sendVerificationEmail(userId: string, email: string): Promise<void> {
    const token = jwt.sign({ userId, type: 'primary' }, process.env.JWT_SECRET!, { expiresIn: '24h' });
    const verificationLink = `${BACKEND_URL}/api/auth/verify-email?token=${token}`;
    const frontendLink = `${FRONTEND_URL}/verify-email-link?token=${token}`;

    const subject = 'Verify Your Email Address for DateAstrum.com';
    const plainTextContent = `Hello,\n\nThank you for registering. Please verify your email by clicking the link below:\n${verificationLink}\n\nIf you did not create an account, please ignore this email.\n\nFor convenience, you can also use this link: ${frontendLink}`;
    const htmlContent = `<h3>Welcome to DateAstrum.com!</h3><p>Please verify your email address by clicking the button below:</p><a href="${frontendLink}" style="background-color:#db2777;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Verify Email</a><p>If you did not create an account, please ignore this email.</p>`;

    const message: EmailMessage = {
        senderAddress: SENDER_VERIFICATION,
        recipients: { to: [{ address: email }] },
        content: { subject, plainText: plainTextContent, html: htmlContent }
    };
    await sendEmail(message);
}

export async function sendPartnerVerificationEmail(userId: string, partnerEmail: string, primaryUsername: string): Promise<void> {
    const token = jwt.sign({ userId, type: 'partner' }, process.env.JWT_SECRET!, { expiresIn: '24h' });
    const verificationLink = `${BACKEND_URL}/api/auth/verify-partner-email?token=${token}`;
    const frontendLink = `${FRONTEND_URL}/verify-partner-email?token=${token}`;

    const subject = 'Partner Email Verification for DateAstrum.com';
    const plainTextContent = `Hello,\n\nYour partner, ${primaryUsername}, created a couple's account and listed you as their partner. To activate the account, please verify by clicking the link below:\n${verificationLink}\n\nIf you did not agree to this, please ignore this email.\n\nFor convenience, you can also use this link: ${frontendLink}`;
    const htmlContent = `<h3>Welcome to DateAstrum.com!</h3><p>Your partner, <strong>${primaryUsername}</strong>, has created a couple's account and listed you as their partner.</p><p>To activate the account, please verify by clicking the button below:</p><a href="${frontendLink}" style="background-color:#db2777;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Verify Partner Email</a><p>If you did not agree to this, please ignore this email.</p>`;

    const message: EmailMessage = {
        senderAddress: SENDER_VERIFICATION,
        recipients: { to: [{ address: partnerEmail }] },
        content: { subject, plainText: plainTextContent, html: htmlContent }
    };
    await sendEmail(message);
}

export async function sendPhotoShareRequestEmail(recipientEmail: string, recipientUsername: string, senderUsername: string): Promise<void> {
    const subject = `You've received a new photo from ${senderUsername}!`;
    const profileLink = `${FRONTEND_URL}/#/profile`;

    const plainTextContent = `
Hello ${recipientUsername},

${senderUsername} has shared a private photo with you on DateAstrum.com.

To view it, please log in to your account and check your notifications.

View your profile here: ${profileLink}

Thank you,
The DateAstrum.com Team
    `.trim();

    const htmlContent = `
        <div style="font-family: sans-serif; line-height: 1.6;">
            <h3>Hello ${recipientUsername},</h3>
            <p><strong>${senderUsername}</strong> has shared a private photo with you on DateAstrum.com.</p>
            <p>To view the photo, please log in to your account and check your notifications bell.</p>
            <p style="text-align: center; margin: 2em 0;">
                <a href="${profileLink}" style="background-color:#db2777;color:white;padding:12px 25px;text-decoration:none;border-radius:5px;font-size:16px;">
                    Go to My Profile
                </a>
            </p>
            <p>Thank you,<br>The DateAstrum.com Team</p>
        </div>
    `.trim();

    const message: EmailMessage = {
        senderAddress: SENDER_NOTIFICATIONS,
        recipients: { to: [{ address: recipientEmail }] },
        content: { subject, plainText: plainTextContent, html: htmlContent }
    };

    await sendEmail(message);
}

export async function sendAccountDeletionCodeEmail(payload: {
  to: string;
  code: string;
  recipientName?: string | null;
  initiatorName?: string | null;
  initiatorEmail?: string | null;
  requiresSharing?: boolean;
}): Promise<void> {
  const { to, code, recipientName, initiatorName, initiatorEmail, requiresSharing = false } = payload;

  const safeRecipientName = (recipientName ?? '').trim() || 'there';
  const initiatorLabel = (initiatorName ?? '').trim() || (initiatorEmail ?? '').trim() || 'Your partner';
  const formattedCode = code.trim();

  const subject = requiresSharing
    ? 'Share this code to confirm your profile deletion'
    : 'Confirm your DateAstrum profile deletion';

  const plainTextContent = requiresSharing
    ? `
Hello ${safeRecipientName},

${initiatorLabel} asked to permanently delete your shared DateAstrum profile.

Share this one-time verification code with them within the next 30 minutes to approve the deletion:

    ${formattedCode}

If you were not expecting this, please ignore this message or contact support immediately.

With care,
The DateAstrum Team
  `.trim()
    : `
Hello ${safeRecipientName},

We received a request to permanently delete your DateAstrum profile.

Enter the following verification code within the next 30 minutes to continue:

    ${formattedCode}

If you did not request this action, please ignore this message or contact support immediately.

With care,
The DateAstrum Team
  `.trim();

  const htmlContent = requiresSharing
    ? `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="color:#db2777;">Approve the profile deletion</h2>
      <p>Hello <strong>${safeRecipientName}</strong>,</p>
      <p><strong>${initiatorLabel}</strong> asked to permanently delete your shared DateAstrum profile.</p>
      <p>Share this one-time verification code with them within the next 30 minutes to approve the deletion:</p>
      <div style="font-size: 28px; letter-spacing: 8px; font-weight: bold; color: #db2777; margin: 24px 0;">
        ${formattedCode}
      </div>
      <p>If this was unexpected, ignore this email or contact our support team immediately.</p>
      <p style="margin-top: 30px;">With care,<br/>The DateAstrum Team</p>
    </div>
  `.trim()
    : `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Confirm Your Profile Deletion</h2>
      <p>Hello <strong>${safeRecipientName}</strong>,</p>
      <p>We received a request to permanently delete your DateAstrum profile.</p>
      <p>Enter the following verification code within the next 30 minutes to continue:</p>
      <div style="font-size: 24px; letter-spacing: 6px; font-weight: bold; color: #db2777; margin: 20px 0;">
        ${formattedCode}
      </div>
      <p>If you did not request this action, ignore this email or contact our support team immediately.</p>
      <p style="margin-top: 30px;">With care,<br/>The DateAstrum Team</p>
    </div>
  `.trim();

  const message: EmailMessage = {
    senderAddress: SENDER_SUPPORT,
    recipients: { to: [{ address: to }] },
    content: { subject, plainText: plainTextContent, html: htmlContent },
  };

  await sendEmail(message);
}

export async function sendPasswordResetPartnerCodeEmail(
  to: string,
  payload: {
    code: string;
    initiatorName?: string | null;
    initiatorEmail: string;
    partnerDisplayName?: string | null;
    expiresAt: Date;
  },
): Promise<void> {
  const { code, initiatorName, initiatorEmail, partnerDisplayName, expiresAt } = payload;
  const recipientName = partnerDisplayName?.trim() || 'there';
  const initiatorLabel = initiatorName?.trim() || initiatorEmail;
  const expiresText = expiresAt.toUTCString();
  const formattedCode = code.trim();

  const subject = 'Share this code to approve the password reset';
  const plainTextContent = `
Hello ${recipientName},

${initiatorLabel} asked to reset the password on your shared DateAstrum account.

Share this one-time code with them to approve the change:

    ${formattedCode}

The code expires at ${expiresText}. If you weren't expecting this, ignore this email or contact support at ${SUPPORT_EMAIL}.

With care,
The DateAstrum Team
  `.trim();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="color:#db2777;">Approve the password reset</h2>
      <p>Hello <strong>${recipientName}</strong>,</p>
      <p><strong>${initiatorLabel}</strong> asked to reset the password on your shared DateAstrum account.</p>
      <p>Share this one-time code with them to approve the change:</p>
      <div style="font-size: 32px; letter-spacing: 10px; font-weight: 700; color: #db2777; margin: 24px 0;">
        ${formattedCode}
      </div>
      <p>This code expires at <strong>${expiresText}</strong>.</p>
      <p>If you were not expecting this request, please ignore this email or notify <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
      <p style="margin-top: 30px;">With care,<br/>The DateAstrum Team</p>
    </div>
  `.trim();

  const message: EmailMessage = {
    senderAddress: SENDER_NOTIFICATIONS,
    recipients: { to: [{ address: to }] },
    content: { subject, plainText: plainTextContent, html: htmlContent },
  };

  await sendEmail(message);
}

export async function sendPasswordResetLinkEmail(
  to: string,
  payload: {
    token: string;
    expiresAt: Date;
    requesterName?: string | null;
    approvingPartnerName?: string | null;
  },
): Promise<void> {
  const { token, expiresAt, requesterName, approvingPartnerName } = payload;
  const recipientName = requesterName?.trim() || 'there';
  const approver = approvingPartnerName?.trim() || 'Your partner';
  const expiresText = expiresAt.toUTCString();
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;

  const subject = 'Secure link to reset your DateAstrum password';
  const plainTextContent = `
Hello ${recipientName},

${approver} confirmed the password reset for your DateAstrum account.

Use the secure link below to set a new password before ${expiresText}:

${resetUrl}

If you didn't request this, ignore this message or contact support at ${SUPPORT_EMAIL}.

With care,
The DateAstrum Team
  `.trim();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="color:#db2777;">Reset your password securely</h2>
      <p>Hello <strong>${recipientName}</strong>,</p>
      <p><strong>${approver}</strong> confirmed the password reset for your DateAstrum account.</p>
      <p>Use the secure link below to choose a new password before <strong>${expiresText}</strong>:</p>
      <p style="text-align:center;margin:2em 0;">
        <a href="${resetUrl}" style="background-color:#db2777;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-size:16px;font-weight:600;">
          Reset password
        </a>
      </p>
      <p>If you did not request this change, ignore this message or contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
      <p style="margin-top:30px;">With care,<br/>The DateAstrum Team</p>
    </div>
  `.trim();

  const message: EmailMessage = {
    senderAddress: SENDER_NOTIFICATIONS,
    recipients: { to: [{ address: to }] },
    content: { subject, plainText: plainTextContent, html: htmlContent },
  };

  await sendEmail(message);
}

export async function sendPasswordShareEmail(
  to: string,
  payload: { partnerName?: string | null; initiatorName?: string | null; token: string; expiresAt: Date },
): Promise<void> {
  const { partnerName, initiatorName, token, expiresAt } = payload;
  const safePartnerName = partnerName?.trim() || 'there';
  const initiatingName = initiatorName?.trim() || 'Your partner';
  const expiresText = `${expiresAt.toUTCString()}`;
  const link = `${FRONTEND_URL}/password-share/${token}`;

  const subject = `${initiatingName} updated your DateAstrum password`;
  const plainTextContent = `
Hello ${safePartnerName},

${initiatingName} just changed the password for your shared DateAstrum account.

Use the secure, one-time link below to view the new password. The link expires at ${expiresText}.

${link}

If you were not expecting this change, we recommend signing in immediately and updating your password, or contacting support at ${SUPPORT_EMAIL}.

With care,
The DateAstrum Team
  `.trim();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="color:#db2777;">Password updated by ${initiatingName}</h2>
      <p>Hello <strong>${safePartnerName}</strong>,</p>
      <p>${initiatingName} just changed the password for your shared DateAstrum account.</p>
      <p>Use the secure link below to view the new password. This link works once and expires at <strong>${expiresText}</strong>.</p>
      <p style="text-align:center;margin:2em 0;">
        <a href="${link}" style="background-color:#db2777;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-size:16px;font-weight:600;">
          View the new password
        </a>
      </p>
      <p>If this was unexpected, please sign in immediately and update your password or contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
      <p style="margin-top:30px;">With care,<br/>The DateAstrum Team</p>
    </div>
  `.trim();

  const message: EmailMessage = {
    senderAddress: SENDER_NOTIFICATIONS,
    recipients: { to: [{ address: to }] },
    content: { subject, plainText: plainTextContent, html: htmlContent },
  };

  await sendEmail(message);
}

export async function sendAdminNewMemberNotificationEmail(details: {
  accountType: 'couple' | 'single';
  primaryEmail: string;
  username?: string | null;
  partnerEmail?: string | null;
  coupleType?: string | null;
  city?: string | null;
  country?: string | null;
  role?: 'single_male' | 'single_female' | null;
  inviterUserId?: string | null;
  inviteId?: string | null;
  userId?: string | null;
  additionalRecipients?: string[] | null;
}): Promise<void> {
  const {
    accountType,
    primaryEmail,
    username,
    partnerEmail,
    coupleType,
    city,
    country,
    role,
    inviterUserId,
    inviteId,
    userId,
    additionalRecipients,
  } = details;

  const timestamp = new Date().toISOString();
  const accountLabel =
    accountType === 'couple'
      ? 'Couple registration'
      : role
        ? `Single activation (${role === 'single_female' ? 'Unicorn' : 'Bull'})`
        : 'Single registration';

  const infoRows: Array<[string, string]> = [];
  const addRow = (label: string, value?: string | null) => {
    if (typeof value === 'string' && value.trim().length) {
      infoRows.push([label, value]);
    }
  };

  addRow('Account type', accountLabel);
  addRow('Primary email', primaryEmail);
  addRow('Username', username ?? null);
  addRow('Partner email', partnerEmail ?? null);
  addRow('Couple type', coupleType ?? null);
  addRow('City', city ?? null);
  addRow('Country', country ?? null);
  addRow('Single role', role ?? null);
  addRow('Inviter user ID', inviterUserId ?? null);
  addRow('Invite ID', inviteId ?? null);
  addRow('User ID', userId ?? null);
  addRow('Registered at', timestamp);

  const plainDetails = infoRows.map(([label, value]) => `${label}: ${value}`).join('\n');
  const htmlDetails = infoRows
    .map(([label, value]) => `<li><strong>${label}:</strong> ${value}</li>`)
    .join('');

  const subject =
    accountType === 'couple'
      ? 'New couple registration on DateAstrum'
      : role
        ? 'New single member activated on DateAstrum'
        : 'New single registration on DateAstrum';

  const plainTextContent = `
Team,

A new ${
    accountType === 'couple'
      ? 'couple has completed registration'
      : role
        ? 'single member has activated their access'
        : 'single member just registered'
  }.

${plainDetails}
  `.trim();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="color:#db2777;">${subject}</h2>
      <p>Team,</p>
      <p>
        A new ${
          accountType === 'couple'
            ? 'couple'
            : role
              ? 'single member'
              : 'single member'
        } just joined DateAstrum.
      </p>
      <ul style="padding-left:1.2em;margin:1.5em 0;">
        ${htmlDetails}
      </ul>
      <p style="margin-top:24px;">You can review the profile in the admin dashboard for any manual follow-up.</p>
    </div>
  `.trim();

  const message: EmailMessage = {
    senderAddress: SENDER_NOTIFICATIONS,
    recipients: { to: [{ address: SUPPORT_EMAIL }] },
    content: { subject, plainText: plainTextContent, html: htmlContent },
  };

  await sendEmail(message);

  const trimmedCommunityRecipients = Array.isArray(additionalRecipients)
    ? Array.from(
        new Map(
          additionalRecipients
            .map((candidate) => (typeof candidate === 'string' ? candidate.trim() : ''))
            .filter((candidate) => candidate.length > 0)
            .map((candidate) => [candidate.toLowerCase(), candidate] as const),
        ).values(),
      )
    : [];

  if (!trimmedCommunityRecipients.length) {
    return;
  }

  const formatDateForCommunity = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const year = String(date.getUTCFullYear());
    return `${day}/${month}/${year}`;
  };

  const communityRows = infoRows
    .filter(([label]) => label.toLowerCase() !== 'user id')
    .filter(([label]) => {
      const lowerLabel = label.toLowerCase();
      return lowerLabel !== 'primary email' && lowerLabel !== 'partner email';
    })
    .map(([label, value]) => {
      if (label.toLowerCase() === 'registered at') {
        return [label, formatDateForCommunity(value)] as [string, string];
      }
      return [label, value] as [string, string];
    });

  const communityPlainDetails = communityRows.map(([label, value]) => `${label}: ${value}`).join('\n');
  const communityHtmlDetails = communityRows
    .map(([label, value]) => `<li><strong>${label}:</strong> ${value}</li>`)
    .join('');

  const communitySubject =
    accountType === 'couple'
      ? `A new couple joined DateAstrum in ${country ?? 'your region'}`
      : `A new member joined DateAstrum nearby`;
  const communityPlainBody = `
Hello lovers,

A new ${accountType === 'couple' ? 'couple' : 'member'} from ${country ?? 'your region'} just registered on DateAstrum.

${communityPlainDetails}

Welcome them with a warm hello inside the community.
  `.trim();

  const communityHtmlBody = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="color:#db2777;">Welcome a new arrival</h2>
      <p>Hello lovers,</p>
      <p>A new ${accountType === 'couple' ? 'couple' : 'member'} from <strong>${country ?? 'your region'}</strong> just joined DateAstrum.</p>
      <ul style="padding-left:1.2em;margin:1.5em 0;">
        ${communityHtmlDetails}
      </ul>
      <p style="margin-top:24px;">Send them a warm hello and make them feel at home.</p>
    </div>
  `.trim();

  const communityMessage: EmailMessage = {
    senderAddress: SENDER_NOTIFICATIONS,
    recipients: { to: trimmedCommunityRecipients.map((address) => ({ address })) },
    content: {
      subject: communitySubject,
      plainText: communityPlainBody,
      html: communityHtmlBody,
    },
  };

  await sendEmail(communityMessage);
}

export async function sendAdmirerUpdateEmail(
  to: string,
  payload: {
    admirerName: string;
    actorName: string;
    profileUrl: string;
    eventType: 'photo_upload' | 'location_share';
    photoCaption?: string | null;
    locationMessage?: string | null;
  }
): Promise<void> {
  const { admirerName, actorName, profileUrl, eventType, photoCaption, locationMessage } = payload;

  const isPhoto = eventType === 'photo_upload';
  const subject = isPhoto
    ? `${actorName} just added a new photo`
    : `${actorName} shared a fresh location update`;

  const description = isPhoto
    ? `a brand new photo${photoCaption ? ` titled "${photoCaption}"` : ''}`
    : `a live location${locationMessage ? ` saying "${locationMessage}"` : ''}`;

  const plainTextContent = `
Hello ${admirerName},

${actorName} just shared ${description} on DateAstrum.com.

Because you're on their Admirers list, you're the first to know.

See whatâ€™s new: ${profileUrl}

With excitement,
The DateAstrum.com Team
  `.trim();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="color:#db2777;">Hello ${admirerName},</h2>
      <p><strong>${actorName}</strong> just shared ${description} on DateAstrum.com.</p>
      <p>You're receiving this because you're listed as one of their Admirers.</p>
      <p style="text-align:center; margin: 2.5em 0;">
        <a href="${profileUrl}" style="background-color:#db2777;color:white;padding:12px 28px;text-decoration:none;border-radius:999px;font-size:16px;font-weight:600;display:inline-block;">
          Visit their profile
        </a>
      </p>
      <p>With excitement,<br/>The DateAstrum.com Team</p>
    </div>
  `.trim();

  const message: EmailMessage = {
    senderAddress: SENDER_NOTIFICATIONS,
    recipients: { to: [{ address: to }] },
    content: { subject, plainText: plainTextContent, html: htmlContent },
  };

  await sendEmail(message);
}

export async function sendSingleInviteEmail(
  to: string,
  payload: {
    inviteLink: string;
    inviterDisplayName: string;
    roleLabel: string;
    expiresAt: Date;
  },
): Promise<void> {
  const { inviteLink, inviterDisplayName, roleLabel, expiresAt } = payload;
  const expiresText = expiresAt.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' UTC';

  const subject = `${inviterDisplayName} invited you to DateAstrum as a ${roleLabel}`;
  const plainTextContent = `
Hello,

${inviterDisplayName} just invited you to join their DateAstrum experience as their trusted ${roleLabel}.

Use the secure link below to complete your onboarding and share a bit about yourself. This link expires on ${expiresText}.

Secure invite link: ${inviteLink}

Excited to meet you soon,
The DateAstrum Team
`.trim();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="color:#db2777;">${inviterDisplayName} wants you to join DateAstrum</h2>
      <p>Hello,</p>
      <p><strong>${inviterDisplayName}</strong> just invited you to be their trusted ${roleLabel} on DateAstrum.</p>
      <p>Tap the button below to introduce yourself, confirm consent, and securely share how you prefer to connect. The link expires at <strong>${expiresText}</strong>.</p>
      <p style="text-align:center;margin:2.5em 0;">
        <a href="${inviteLink}" style="background-color:#db2777;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-size:16px;font-weight:600;margin:0 auto;display:inline-block;">
          Review Your Invitation
        </a>
      </p>
      <p>If you're not expecting this invitation, you can simply ignore this email.</p>
      <p style="margin-top:30px;">With excitement,<br/>The DateAstrum Team</p>
    </div>
  `.trim();

  const message: EmailMessage = {
    senderAddress: SENDER_NOTIFICATIONS,
    recipients: { to: [{ address: to }] },
    content: { subject, plainText: plainTextContent, html: htmlContent },
  };

  await sendEmail(message);
}

export async function sendSingleActivationEmail(
  to: string,
  payload: {
    activationLink: string;
    inviterDisplayName: string;
    roleLabel: string;
    expiresAt: Date;
  },
): Promise<void> {
  const { activationLink, inviterDisplayName, roleLabel, expiresAt } = payload;
  const expiresText = expiresAt.toLocaleString('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' UTC';

  const subject = 'Create your DateAstrum password';
  const plainTextContent = `
Hello,

Your guide review is complete. ${inviterDisplayName} is ready to welcome you as their ${roleLabel}.

Use the secure link below to create your DateAstrum password within the next step. This link expires on ${expiresText}.

Secure activation link: ${activationLink}

See you inside,
The DateAstrum Team
  `.trim();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
      <h2 style="color:#db2777;">Set your DateAstrum password</h2>
      <p>Hello,</p>
      <p>Your guide review is complete. <strong>${inviterDisplayName}</strong> is ready to welcome you as their trusted ${roleLabel}.</p>
      <p>Tap the button below to create your DateAstrum password. The link expires at <strong>${expiresText}</strong>.</p>
      <p style="text-align:center;margin:2.5em 0;">
        <a href="${activationLink}" style="background-color:#db2777;color:#fff;padding:14px 28px;border-radius:999px;text-decoration:none;font-size:16px;font-weight:600;margin:0 auto;display:inline-block;">
          Create Password
        </a>
      </p>
      <p>If you weren't expecting this invitation, you can safely ignore this email.</p>
      <p style="margin-top:30px;">With excitement,<br/>The DateAstrum Team</p>
    </div>
  `.trim();

  const message: EmailMessage = {
    senderAddress: SENDER_NOTIFICATIONS,
    recipients: { to: [{ address: to }] },
    content: { subject, plainText: plainTextContent, html: htmlContent },
  };

  await sendEmail(message);
}

export async function sendAccountDeletionPartnerNoticeEmail(to: string, initiatorName: string): Promise<void> {
  const subject = 'Partner profile scheduled for deletion';
  const plainTextContent = `
Hello,

${initiatorName} confirmed the permanent deletion of your shared DateAstrum profile. The account and all related content are now being removed from our systems.

If you believe this was a mistake, please contact support immediately at info@dateastrum.com.

Thank you,
The DateAstrum Team
  `.trim();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Profile Deletion In Progress</h2>
      <p>Hello,</p>
      <p><strong>${initiatorName}</strong> confirmed the permanent deletion of your shared DateAstrum profile.</p>
      <p>The account and all related content are now being removed from our systems.</p>
      <p>If this is unexpected, please reach out to <a href="mailto:info@dateastrum.com">info@dateastrum.com</a> immediately.</p>
      <p style="margin-top: 30px;">With care,<br/>The DateAstrum Team</p>
    </div>
  `.trim();

  const message: EmailMessage = {
    senderAddress: SENDER_SUPPORT,
    recipients: { to: [{ address: to }] },
    content: { subject, plainText: plainTextContent, html: htmlContent },
  };

  await sendEmail(message);
}

type ReengagementEmailParams = {
  to: string[];
  coupleNames: string;
  loginUrl?: string;
  preferencesUrl: string;
};

export async function sendReengagementReminderEmail(params: ReengagementEmailParams): Promise<void> {
  const uniqueRecipients = Array.from(
    new Set(
      (params.to ?? [])
        .filter((address) => typeof address === 'string')
        .map((address) => address.trim().toLowerCase())
        .filter((address) => address.length > 0),
    ),
  );

  if (uniqueRecipients.length === 0) {
    throw new OperationalError('No valid recipients for reengagement reminder.', 400);
  }

  const displayName = params.coupleNames?.trim().length ? params.coupleNames.trim() : 'there';
  const loginUrl = params.loginUrl ?? `${FRONTEND_URL}/login`;
  const preferencesUrl = params.preferencesUrl;

  const subject = 'We miss you both at DateAstrum';
  const plainTextContent = ensurePlainTextSignature(`
Hi ${displayName},

We've missed seeing you both around DateAstrum. Couples like you bring energy, curiosity, and warmth to the community, and we'd love to see what you explore next together.

Here's what's waiting as soon as you log back in:
- Fresh profiles curated for adventurous couples
- Invitations to exclusive events and member-hosted evenings
- Private conversation starters to keep things playful

Take a moment for the two of you today - check in, catch up, and set something exciting in motion. You deserve a little sparkle.

Reconnect now: ${loginUrl}

Prefer fewer reminders? Update your preferences: ${preferencesUrl}
  `.trim());

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.65; color: #1f2937;">
      <h1 style="font-size: 28px; margin: 0 0 18px; color: #831843; text-align: center;">You two make the spark</h1>
      <p>Hi <strong>${displayName}</strong>,</p>
      <p>
        We've noticed it's been a little while since you last explored DateAstrum together.
        Couples like you bring the warmth, curiosity, and connection that keep our community thriving.
      </p>
      <div style="background: linear-gradient(135deg, rgba(252, 211, 77, 0.25), rgba(249, 112, 167, 0.3)); padding: 18px 20px; border-radius: 16px; margin: 28px 0;">
        <p style="margin: 0 0 14px;">Here’s what’s waiting the moment you log back in:</p>
        <ul style="margin: 0; padding-left: 20px;">
          <li>Fresh profiles curated for adventurous couples</li>
          <li>Invitations to exclusive events and member-hosted evenings</li>
          <li>Private tips to keep your conversations playful</li>
        </ul>
      </div>
      <p>
        Take a quick moment for the two of you today - check in, catch up, and set something playful in motion.
        Your dynamic duo deserves it.
      </p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${loginUrl}" style="display: inline-block; padding: 14px 28px; background-color: #f43f5e; color: #ffffff; text-decoration: none; border-radius: 999px; font-weight: 600; letter-spacing: 0.08em;">
          Reconnect Now
        </a>
      </p>
      <p>
        Need a refresher? Our concierge team is happy to help you warm things up again.
        Just hit reply or drop us a message any time.
      </p>
      <p style="margin-top: 28px;">With affection,<br/>The DateAstrum Concierge</p>
      <div style="margin-top: 36px; text-align: center;">
        <a href="${preferencesUrl}" style="font-size: 13px; color: #be123c; text-decoration: none;">
          Prefer fewer reminders? Update your preferences.
        </a>
      </div>
    </div>
  `;

  const message: EmailMessage = {
    senderAddress: SENDER_VERIFICATION,
    recipients: { to: uniqueRecipients.map((address) => ({ address })) },
    content: {
      subject,
      plainText: plainTextContent,
      html: wrapWithBrandTemplate(htmlBody),
    },
  };

  await sendEmail(message);
}

type VerificationReminderEmailParams = {
  to: string[];
  coupleNames: string;
  preferencesUrl: string;
  loginUrl?: string;
  resendUrl?: string;
  primaryVerified: boolean;
  partnerVerified: boolean;
};

export async function sendVerificationReminderEmail(params: VerificationReminderEmailParams): Promise<void> {
  const uniqueRecipients = Array.from(
    new Set(
      (params.to ?? [])
        .filter((address) => typeof address === 'string')
        .map((address) => address.trim().toLowerCase())
        .filter((address) => address.length > 0),
    ),
  );

  if (uniqueRecipients.length === 0) {
    throw new OperationalError('No valid recipients for verification reminder.', 400);
  }

  const displayName = params.coupleNames?.trim().length ? params.coupleNames.trim() : 'there';
  const loginUrl = params.loginUrl ?? `${FRONTEND_URL}/login`;
  const resendUrl = params.resendUrl ?? `${FRONTEND_URL}/register`;
  const preferencesUrl = params.preferencesUrl;

  const subject = 'Complete your couple verification and keep the magic unlocked ?';

  const badge = (label: string, complete: boolean) =>
    `<span style="display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600;background:${complete ? '#dcfce7' : '#fee2e2'};color:${complete ? '#047857' : '#b91c1c'};">
        <span style="display:inline-block;width:8px;height:8px;border-radius:999px;background:${complete ? '#10b981' : '#f87171'};"></span>
        ${label}
      </span>`;

  const badgePrimary = badge('Primary email', params.primaryVerified);
  const badgePartner = badge('Partner email', params.partnerVerified);

  const plainTextContent = ensurePlainTextSignature(`
Hi ${displayName},

Thanks for building your profile with us! We noticed we’re still waiting on one (or both) of your email verifications. Once both partners confirm, you’ll unlock:

- Priority placement in searches and invites
- Access to our full couples directory and rendezvous board
- Concierge support tailored to verified members

It only takes a minute:
1. Have each partner open the verification email we sent earlier.
2. Click the link to confirm your address.
3. Refresh your profile to see the verified badge appear.

Need a fresh link? You can now resend it yourself:
- Visit ${resendUrl}
- Tap "Send them again" beneath the sign-in link
- Enter both partner emails and we'll deliver any pending links instantly.
If you still need help, drop us a note at info@dateastrum.com and we'll step in right away.

Log in: ${loginUrl}
Update reminder preferences: ${preferencesUrl}
  `.trim());

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.65; color: #0f172a;">
      <div style="text-align:center;margin-bottom:24px;">
        <img src="https://dateastrum.com/assets/img/logo-email.png" alt="DateAstrum" style="height:52px;" />
      </div>
      <h1 style="font-size: 26px; margin: 0 0 18px; color: #831843; text-align: center;">Complete your couple verification and keep the magic unlocked ?</h1>
      <p>Hi <strong>${displayName}</strong>,</p>
      <p>Thanks for building your profile with us! We noticed we’re still waiting on one (or both) of your email verifications. Once both partners confirm, you’ll unlock:</p>
      <ul style="margin: 16px 0; padding-left: 22px;">
        <li>Priority placement in searches and invites</li>
        <li>Access to our full couples directory and rendezvous board</li>
        <li>Concierge support tailored to verified members</li>
      </ul>
      <div style="margin: 24px 0; display: inline-flex; gap: 12px; padding: 14px 18px; border-radius: 16px; background: linear-gradient(135deg, rgba(249, 168, 212, 0.35), rgba(190, 242, 100, 0.3));">
        ${badgePrimary}
        ${badgePartner}
      </div>
      <p>It only takes a minute:</p>
      <ol style="margin: 16px 0; padding-left: 22px;">
        <li>Have each partner open the verification email we sent earlier.</li>
        <li>Click the link to confirm your address.</li>
        <li>Refresh your profile to see the verified badge appear.</li>
      </ol>
      <p>Need a fresh link? You can now resend it yourself in seconds:</p>
      <p style="text-align: center; margin: 18px 0;">
        <a href="${resendUrl}" style="display: inline-block; padding: 12px 26px; border-radius: 999px; background-color: #ec4899; color: #ffffff; text-decoration: none; font-weight: 600; letter-spacing: 0.05em;">
          Resend verification emails
        </a>
      </p>
      <p style="font-size: 14px; color: #be123c; margin-top: -8px; text-align:center;">Enter both partner emails and we'll deliver any pending links instantly.</p>
      <p style="text-align:center; margin-top: 18px;">Prefer help from the team? Drop us a note at <a href="mailto:info@dateastrum.com" style="color:#db2777;">info@dateastrum.com</a> and we'll take care of it.</p>
      <p style="text-align: center; margin: 32px 0;">
        <a href="${loginUrl}" style="display: inline-block; padding: 14px 28px; background-color: #0ea5e9; color: #ffffff; text-decoration: none; border-radius: 999px; font-weight: 600; letter-spacing: 0.08em;">
          Log in to verify
        </a>
      </p>
      <p>Let’s get your duo officially verified so you can explore without limits.</p>
      <p style="margin-top: 28px;">Warmly,<br/>The DateAstrum Team</p>
      <div style="margin-top: 36px; text-align: center;">
        <a href="${preferencesUrl}" style="font-size: 13px; color: #be123c; text-decoration: none;">
          Prefer fewer reminders? Update your preferences.
        </a>
      </div>
    </div>
  `;

  const message: EmailMessage = {
    senderAddress: SENDER_NOTIFICATIONS,
    recipients: { to: uniqueRecipients.map((address) => ({ address })) },
    content: {
      subject,
      plainText: plainTextContent,
      html: wrapWithBrandTemplate(htmlBody),
    },
  };

  await sendEmail(message);
}
export async function sendFakeEngagementAlertEmail(payload: {
  senderUserId: string;
  senderUsername?: string | null;
  senderEmail?: string | null;
  fakeUserId: string;
  fakeLabel?: string | null;
  fakeEmail?: string | null;
  messagePreview: string;
}): Promise<void> {
  const trimmedPreview = (payload.messagePreview ?? '').trim();
  const previewNormalized = trimmedPreview.replace(/\s+/g, ' ');
  const preview = previewNormalized.length > 500 ? `${previewNormalized.slice(0, 497)}…` : previewNormalized;

  const senderDescriptor = payload.senderUsername?.trim().length
    ? `${payload.senderUsername?.trim()} (ID: ${payload.senderUserId})`
    : `User ${payload.senderUserId}`;
  const fakeDescriptor = payload.fakeLabel?.trim().length
    ? `${payload.fakeLabel?.trim()} (ID: ${payload.fakeUserId})`
    : `Fake user ${payload.fakeUserId}`;

  const plainText = ensurePlainTextSignature(`Real couple contacted a fake profile.\n\nSender: ${senderDescriptor}\nSender Email: ${payload.senderEmail ?? 'N/A'}\nFake Profile: ${fakeDescriptor}\nFake Email: ${payload.fakeEmail ?? 'N/A'}\n\nMessage Preview:\n${preview || '(no message content provided)'}\n`);

  const html = wrapWithBrandTemplate(`
    <div style="font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#0f172a;">
      <h2 style="margin-top:0;color:#be123c;">Real couple pinged a fake profile</h2>
      <p><strong>Sender:</strong> ${senderDescriptor}</p>
      <p><strong>Sender Email:</strong> ${payload.senderEmail ?? 'Not provided'}</p>
      <p><strong>Fake Profile:</strong> ${fakeDescriptor}</p>
      <p><strong>Fake Email:</strong> ${payload.fakeEmail ?? 'Not provided'}</p>
      <div style="margin:18px 0;padding:16px;border-left:4px solid #f87171;background:#fff7ed;border-radius:8px;">
        <p style="margin:0 0 6px;font-weight:600;color:#ea580c;">Message preview</p>
        <p style="margin:0;white-space:pre-wrap;color:#475569;">${preview || '(no message content provided)'}</p>
      </div>
      <p style="margin-top:24px;font-size:13px;color:#475569;">This alert fires whenever a verified couple reaches out to a curated fake profile so concierge can follow up quickly.</p>
    </div>
  `);

  const message: EmailMessage = {
    senderAddress: SENDER_SUPPORT,
    recipients: { to: [{ address: SUPPORT_EMAIL }] },
    content: {
      subject: 'Real couple contacted fake profile',
      plainText,
      html,
    },
  };

  await sendEmail(message);
}

export default {
  verifyMailConnections,
  sendContactFormEmail,
  sendSubscriptionConfirmationEmail,
  sendPlatinumExpiryReminderEmail,
  sendVerificationEmail,
  sendPartnerVerificationEmail,
  sendPhotoShareRequestEmail,
  sendAccountDeletionCodeEmail,
  sendAccountDeletionPartnerNoticeEmail,
  sendPasswordResetPartnerCodeEmail,
  sendPasswordResetLinkEmail,
  sendPasswordShareEmail,
  sendAdminNewMemberNotificationEmail,
  sendAdmirerUpdateEmail,
  sendSingleInviteEmail,
  sendSingleActivationEmail,
  sendReengagementReminderEmail,
  sendVerificationReminderEmail,
  sendFakeEngagementAlertEmail,
};








