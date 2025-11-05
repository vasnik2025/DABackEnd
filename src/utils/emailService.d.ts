// Minimal declaration to inform TypeScript about the JS implementation in src/utils/emailService.js
// This file declares the module's named exports and default export with loose types (any)
// to satisfy the compiler until the JS implementation is migrated to TS.

export function verifyMailConnections(): Promise<boolean>;

export function sendContactFormEmail(...args: any[]): Promise<void>;
export function sendSubscriptionConfirmationEmail(...args: any[]): Promise<void>;
export function sendPlatinumExpiryReminderEmail(...args: any[]): Promise<void>;
export type VerificationEmailResult = {
    userId: string;
    email: string;
    token: string;
    emailSent: boolean;
    backendLink: string;
    frontendLink: string;
};

export function sendVerificationEmail(userId: string, email: string): Promise<VerificationEmailResult>;
export function sendPartnerVerificationEmail(...args: any[]): Promise<void>;
export function sendPhotoShareRequestEmail(...args: any[]): Promise<void>;
export function sendAccountDeletionCodeEmail(...args: any[]): Promise<void>;
export function sendAccountDeletionPartnerNoticeEmail(...args: any[]): Promise<void>;
export function sendPasswordResetPartnerCodeEmail(...args: any[]): Promise<void>;
export function sendPasswordResetLinkEmail(...args: any[]): Promise<void>;
export function sendPasswordShareEmail(...args: any[]): Promise<void>;
export function sendAdminNewMemberNotificationEmail(...args: any[]): Promise<void>;
export function sendAdmirerUpdateEmail(...args: any[]): Promise<void>;
export function sendSingleInviteEmail(...args: any[]): Promise<void>;
export function sendSingleActivationEmail(...args: any[]): Promise<void>;
export function sendReengagementReminderEmail(...args: any[]): Promise<void>;
export function sendVerificationReminderEmail(...args: any[]): Promise<void>;
export function sendFakeEngagementAlertEmail(...args: any[]): Promise<void>;

declare const _default: {
    verifyMailConnections: typeof verifyMailConnections;
    sendContactFormEmail: typeof sendContactFormEmail;
    sendSubscriptionConfirmationEmail: typeof sendSubscriptionConfirmationEmail;
    sendPlatinumExpiryReminderEmail: typeof sendPlatinumExpiryReminderEmail;
    sendVerificationEmail: typeof sendVerificationEmail;
    sendPartnerVerificationEmail: typeof sendPartnerVerificationEmail;
    sendPhotoShareRequestEmail: typeof sendPhotoShareRequestEmail;
    sendAccountDeletionCodeEmail: typeof sendAccountDeletionCodeEmail;
    sendAccountDeletionPartnerNoticeEmail: typeof sendAccountDeletionPartnerNoticeEmail;
    sendPasswordResetPartnerCodeEmail: typeof sendPasswordResetPartnerCodeEmail;
    sendPasswordResetLinkEmail: typeof sendPasswordResetLinkEmail;
    sendPasswordShareEmail: typeof sendPasswordShareEmail;
    sendAdminNewMemberNotificationEmail: typeof sendAdminNewMemberNotificationEmail;
    sendAdmirerUpdateEmail: typeof sendAdmirerUpdateEmail;
    sendSingleInviteEmail: typeof sendSingleInviteEmail;
    sendSingleActivationEmail: typeof sendSingleActivationEmail;
    sendReengagementReminderEmail: typeof sendReengagementReminderEmail;
    sendVerificationReminderEmail: typeof sendVerificationReminderEmail;
    sendFakeEngagementAlertEmail: typeof sendFakeEngagementAlertEmail;
};

export default _default;
