import { EmailClient } from '@azure/communication-email';
import * as jwt from 'jsonwebtoken';
import { OperationalError } from './errorHandler';

let emailClient: EmailClient | null = null;

// Senders must be configured as "MailFrom" addresses in your Azure Communication Resource
const SENDER_INFO = 'DoNotReply@dateastrum.com';
const SENDER_SUBSCRIPTION = 'DoNotReply@dateastrum.com';
const SUPPORT_EMAIL = 'info@dateastrum.com';
// FIX: Changed sender to a valid 'MailFrom' address based on server logs.
const SENDER_NOTIFICATIONS = 'DoNotReply@dateastrum.com';
const SENDER_SUPPORT = SENDER_NOTIFICATIONS;
const SENDER_VERIFICATION = 'MailVerification@dateastrum.com';

const ACS_CONNECTION_STRING = (process.env.COMMUNICATION_SERVICES_CONNECTION_STRING || '').trim();
const ACS_ENDPOINT = (() => {
  const endpointPart = ACS_CONNECTION_STRING.split(';').find((part) => part.toLowerCase().startsWith('endpoint='));
  return endpointPart ? endpointPart.slice(endpointPart.indexOf('=') + 1) : 'unknown-endpoint';
})();

const BACKEND_URL = (process.env.BACKEND_URL || 'https://api.dateastrum.com').replace(/\/$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://dateastrum.com').replace(/\/$/, '');

const BRAND_SIGNATURE_TEXT = `Warm regards,\nThe DateAstrum Concierge Team\nhttps://dateastrum.com`;
const BRAND_TEMPLATE_MARKER = 'data-su-template="DateAstrum"';

export type VerificationEmailResult = {
  userId: string;
  email: string;
  token: string;
  emailSent: boolean;
  backendLink: string;
  frontendLink: string;
};

function ensurePlainTextSignature(text?: string) {
  const base = (text ?? '').trimEnd();
  if (!base.length) return `${BRAND_SIGNATURE_TEXT}`;
  if (base.includes('DateAstrum Concierge Team')) return base;
  return `${base}\n\n${BRAND_SIGNATURE_TEXT}`;
}

function wrapWithBrandTemplate(html?: string) {
  if (!html) return html ?? undefined;
  const trimmed = html.trim();
  if (!trimmed.length || trimmed.includes(BRAND_TEMPLATE_MARKER)) return trimmed;
  const bodyBlock = `<div style="font-size:16px;line-height:1.7;color:#0f172a;margin:0;padding:0;">\n    ${trimmed}\n  </div>`;
  return `<!DOCTYPE html>\n  <html lang="en" ${BRAND_TEMPLATE_MARKER}>\n    <head>\n      <meta charset="UTF-8" />\n      <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n      <title>DateAstrum</title>\n    </head>\n    <body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">\n      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:linear-gradient(135deg,#ffe4e6,#fdf2f8);padding:32px 16px;">\n        <tr>\n          <td align="center">\n            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:24px;box-shadow:0 24px 48px rgba(15,23,42,0.12);overflow:hidden;">\n              <tr>\n                <td style="padding:40px;">\n                  <div style="text-align:center;margin-bottom:28px;">\n                    <img src="https://dateastrum.com/assets/img/logo-email.png" alt="DateAstrum" style="height:48px;display:inline-block;" />\n                  </div>\n                  ${bodyBlock}\n                  <div style="margin-top:36px;border-top:1px solid #e2e8f0;padding-top:20px;font-size:14px;color:#475569;">\n                    Warm regards,<br />\n                    <strong>The DateAstrum Concierge Team</strong><br />\n                    <a href="https://dateastrum.com" style="color:#db2777;text-decoration:none;">https://dateastrum.com</a>\n                  </div>\n                </td>\n              </tr>\n            </table>\n            <div style="margin-top:24px;font-size:12px;color:#64748b;">\n              © ${new Date().getFullYear()} DateAstrum. All rights reserved.\n            </div>\n          </td>\n        </tr>\n      </table>\n    </body>\n  </html>`;
}

function acsEnabled() {
  return ACS_CONNECTION_STRING.length > 0;
}

export async function initEmailClient(): Promise<EmailClient | null> {
  if (!acsEnabled()) {
    console.warn('[emailService] Azure Communication Services not configured - email sending is disabled.');
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
  try {
    await initEmailClient();
    return emailClient !== null;
  } catch {
    return false;
  }
}

async function sendEmail(message: any): Promise<boolean> {
  const client = emailClient ?? (await initEmailClient());
  if (!client) {
    const toList =
      message.recipients?.to?.map((r: any) => r.address).join(', ') ?? 'unknown recipients';
    // Gracefully degrade when ACS is not configured or temporarily unavailable.
    console.warn(
      `[emailService] sendEmail skipped because no client is available. Intended recipients: ${toList}`,
    );
    return false;
  }
  if (message.content) {
    if (message.content.html) message.content.html = wrapWithBrandTemplate(message.content.html);
    message.content.plainText = ensurePlainTextSignature(message.content.plainText);
  }
  const maxAttempts = 3;
  const baseDelayMs = 1500;
  const shouldRetry = (error: any) => {
    const status = Number(error?.statusCode ?? error?.response?.status ?? 0);
    return status === 502 || status === 503 || status === 504;
  };
  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const poller = await client.beginSend(message);
        const result = await poller.pollUntilDone();
        if (result.status === 'Succeeded') {
          const toList = message.recipients?.to?.map((r: any) => r.address).join(', ');
          console.log(`[emailService] Email sent successfully via ACS to ${toList}`);
          return true;
        }
        console.error('[emailService] ACS email send failed.', result);
        const errorDetails = result.error?.message || JSON.stringify(result.error);
        throw new Error(`Failed to send email: ${errorDetails}`);
      } catch (err: any) {
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
      const suppressedList =
        message.recipients?.to?.map((recipient: any) => recipient.address).join(', ') ??
        'unknown recipients';
      console.warn(
        `[emailService] ACS dropped email because all recipients were suppressed. Skipping send. Recipients: ${suppressedList}`,
      );
      return false;
    }
    throw new OperationalError(messageText || 'An unexpected error occurred while sending the email.', 500);
  }
  return false;
}

export async function sendContactFormEmail(arg1: any, arg2?: any, arg3?: any, arg4?: any) {
  let name: any, email: any, subject: any, message: any;
  if (typeof arg1 === 'object' && arg1 !== null) {
    ({ name, email, subject, message } = arg1);
  } else {
    name = arg1;
    email = arg2;
    subject = arg3;
    message = arg4;
  }
  const finalSubject = subject || 'Contact form submission';
  const plainTextContent = `New contact form submission\nName: ${name || '-'}\nReply-To Email: ${email}\nSubject: ${finalSubject}\n\n${message}`;
  const htmlContent = `<html><body><h3>New Contact Form Submission</h3><p><strong>Name:</strong> ${name || '<em>Not provided</em>'}</p><p><strong>Reply-To Email:</strong> <a href="mailto:${email}">${email}</a></p><p><strong>Subject:</strong> ${finalSubject}</p><hr><p>${message.replace(/\n/g, '<br>')}</p></body></html>`;
  const emailMessage = {
    senderAddress: SENDER_INFO,
    recipients: { to: [{ address: SUPPORT_EMAIL }] },
    content: { subject: `[Contact Form] ${finalSubject}`, plainText: plainTextContent, html: htmlContent },
    replyTo: [{ address: email, displayName: name }],
  };
  await sendEmail(emailMessage);
}

export async function sendSubscriptionConfirmationEmail(to: string, details?: any) {
  const subject = 'Your subscription is active';
  const lines: string[] = ['Thanks for subscribing — your membership is now active.'];
  if (details?.planName) lines.push(`Plan: ${details.planName}`);
  if (details?.price) lines.push(`Price: ${details.price}`);
  if (details?.orderId) lines.push(`Order ID: ${details.orderId}`);
  if (details?.nextBilling) lines.push(`Next billing: ${details.nextBilling}`);
  const emailMessage = {
    senderAddress: SENDER_SUBSCRIPTION,
    recipients: { to: [{ address: to }] },
    content: { subject, plainText: lines.join('\n'), html: `<p>${lines.join('<br>')}</p>` },
  };
  await sendEmail(emailMessage);
}

export async function sendPlatinumExpiryReminderEmail(recipients: any, payload?: any) {
  const uniqueRecipients = Array.from(new Set((recipients ?? [])
    .map((value: any) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value: any) => value.length > 0)));
  if (!uniqueRecipients.length) return;
  const expirySource = payload?.membershipExpiryDate ?? null;
  const expiryDate = expirySource instanceof Date ? expirySource : expirySource ? new Date(expirySource) : null;
  const expiryText = expiryDate ? expiryDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'soon';
  const subject = 'Reminder: Your Platinum membership is expiring';
  const plainTextContent = `\nHello lovers,\n\nThis is a friendly reminder that your DateAstrum Platinum membership will expire on ${expiryText}.\nRenew within the next 5 days to keep every premium perk for just €2.\n\nIf you let it lapse, the account will automatically return to the Free tier and Platinum-only features will disappear.\n\nYou can renew inside DateAstrum under Settings – Membership.\n\nPlay safe,\nThe DateAstrum Team\n  `.trim();
  const htmlContent = `\n    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">\n      <h2 style="color:#db2777;">Your Platinum perks are about to lapse</h2>\n      <p>Hello lovers,</p>\n      <p>Your DateAstrum Platinum membership is due to expire on <strong>${expiryText}</strong>.</p>\n      <p>Renew within the next 5 days to keep your premium tools for just <strong>€2</strong>. After the expiry date we will automatically switch your account back to the Free tier and all Platinum-only features will disappear.</p>\n      <p style="margin-top: 24px;">\n        Open the <strong>Settings – Membership</strong> section inside DateAstrum to renew in a few taps.\n      </p>\n      <p style="margin-top:30px;">Play safe,<br/>The DateAstrum Team</p>\n    </div>\n  `.trim();
  const message = {
    senderAddress: SENDER_SUBSCRIPTION,
    recipients: { to: uniqueRecipients.map((address: string) => ({ address })) },
    content: { subject, plainText: plainTextContent, html: htmlContent },
  };
  await sendEmail(message);
}

export async function sendVerificationEmail(
  userId: string,
  email: string,
): Promise<VerificationEmailResult> {
  const token = jwt.sign({ userId, type: 'primary' }, process.env.JWT_SECRET || '', { expiresIn: '24h' });
  const verificationLink = `${BACKEND_URL}/api/auth/verify-email?token=${token}`;
  const frontendLink = `${FRONTEND_URL}/verify-email-link?token=${token}`;
  const subject = 'Verify Your Email Address for DateAstrum.com';
  const plainTextContent = `Hello,\n\nThank you for registering. Please verify your email by clicking the link below:\n${verificationLink}\n\nIf you did not create an account, please ignore this email.\n\nFor convenience, you can also use this link: ${frontendLink}`;
  const htmlContent = `<h3>Welcome to DateAstrum.com!</h3><p>Please verify your email address by clicking the button below:</p><a href="${frontendLink}" style="background-color:#db2777;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Verify Email</a><p>If you did not create an account, please ignore this email.</p>`;
  const message = { senderAddress: SENDER_VERIFICATION, recipients: { to: [{ address: email }] }, content: { subject, plainText: plainTextContent, html: htmlContent } };
  let emailSent = false;
  try {
    emailSent = await sendEmail(message);
  } catch (error) {
    console.error('[emailService] Failed to send verification email via ACS', error);
  }
  if (!emailSent) {
    console.warn(
      `[emailService] Verification email not sent automatically. Manual link: ${frontendLink}`,
    );
  }
  return {
    userId,
    email,
    token,
    emailSent,
    backendLink: verificationLink,
    frontendLink,
  };
}

// NOTE: For brevity the remaining functions are implemented in the same pattern as above in the original JS.
// To keep the patch small and focused, we'll re-export the functions from the JS file where the implementation is unchanged.

// Import the legacy JS implementation and re-export named functions to preserve behavior while migrating to TS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsImpl = require('./emailService.legacy.js');

export const sendPartnerVerificationEmail = jsImpl.sendPartnerVerificationEmail || jsImpl.default?.sendPartnerVerificationEmail;
export const sendPhotoShareRequestEmail = jsImpl.sendPhotoShareRequestEmail || jsImpl.default?.sendPhotoShareRequestEmail;
export const sendAccountDeletionCodeEmail = jsImpl.sendAccountDeletionCodeEmail || jsImpl.default?.sendAccountDeletionCodeEmail;
export const sendAccountDeletionPartnerNoticeEmail = jsImpl.sendAccountDeletionPartnerNoticeEmail || jsImpl.default?.sendAccountDeletionPartnerNoticeEmail;
export const sendPasswordResetPartnerCodeEmail = jsImpl.sendPasswordResetPartnerCodeEmail || jsImpl.default?.sendPasswordResetPartnerCodeEmail;
export const sendPasswordResetLinkEmail = jsImpl.sendPasswordResetLinkEmail || jsImpl.default?.sendPasswordResetLinkEmail;
export const sendPasswordShareEmail = jsImpl.sendPasswordShareEmail || jsImpl.default?.sendPasswordShareEmail;
export const sendAdminNewMemberNotificationEmail = jsImpl.sendAdminNewMemberNotificationEmail || jsImpl.default?.sendAdminNewMemberNotificationEmail;
export const sendAdmirerUpdateEmail = jsImpl.sendAdmirerUpdateEmail || jsImpl.default?.sendAdmirerUpdateEmail;
export const sendSingleInviteEmail = jsImpl.sendSingleInviteEmail || jsImpl.default?.sendSingleInviteEmail;
export const sendSingleActivationEmail = jsImpl.sendSingleActivationEmail || jsImpl.default?.sendSingleActivationEmail;
export const sendReengagementReminderEmail = jsImpl.sendReengagementReminderEmail || jsImpl.default?.sendReengagementReminderEmail;
export const sendVerificationReminderEmail = jsImpl.sendVerificationReminderEmail || jsImpl.default?.sendVerificationReminderEmail;
export const sendFakeEngagementAlertEmail = jsImpl.sendFakeEngagementAlertEmail || jsImpl.default?.sendFakeEngagementAlertEmail;

const defaultExport = {
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

export default defaultExport;
