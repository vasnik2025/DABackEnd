// Compatibility shared types (v4)

export interface User {
  id: string;
  username: string;
  email: string;
  bio?: string | null;
  membershipType?: string | null;
  membershipExpiryDate?: string | null;
  subscribedAt?: string | null;
  profilePictureUrl?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  isOnline?: boolean;
  city?: string | null;
  country?: string | null;
  isEmailVerified?: boolean;
  viber?: string | null;
  isViberPublic?: boolean;
  whatsApp?: string | null;
  isWhatsAppPublic?: boolean;
  instagram?: string | null;
  isInstagramPublic?: boolean;
  facebook?: string | null;
  isFacebookPublic?: boolean;
  teams?: string | null;
  isTeamsPublic?: boolean;
  mail?: string | null;
  isMailPublic?: boolean;
  coupleType?: string | null;
  partnerEmail?: string | null;
  isPartnerEmailVerified?: boolean;
  partner1Nickname?: string | null;
  partner2Nickname?: string | null;
  disableReengagementReminders?: boolean;
  reengagementOptOutAt?: string | null;
  disableVerificationReminders?: boolean;
  verificationReminderOptOutAt?: string | null;
  accountKind?: 'couple' | 'single' | string | null;
  invitedByUserId?: string | null;
  nextPaymentDueAt?: string | null;

  // personal info
  age?: number | null;
  gender?: string | null;
  welcomeMessage?: string | null;
  relationshipStatus?: "Marriage" | "Relationship Without Marriage" | "Just Sex Friends" | null;
  yearsTogether?: number | null;  // 0 => less than 1
  partner1Age?: number | null;
  partner2Age?: number | null;
  interestsCsv?: string | null;
  languagesCsv?: string | null;
  lookingForCsv?: string | null;
}

export interface UserUpdatePayload {
  bio?: string | null;
  profilePictureUrl?: string | null;
  username?: string;
  email?: string;
  isOnline?: boolean;
  city?: string | null;
  country?: string | null;
  newPassword?: string;
  currentPassword?: string;

  viber?: string; isViberPublic?: boolean;
  whatsApp?: string; isWhatsAppPublic?: boolean;
  instagram?: string; isInstagramPublic?: boolean;
  facebook?: string; isFacebookPublic?: boolean;
  teams?: string; isTeamsPublic?: boolean;
  mail?: string; isMailPublic?: boolean;

  isEmailVerified?: boolean;
  partner1Nickname?: string;
  partner2Nickname?: string;

  // personal fields
  age?: number | null;
  gender?: string | null;
  welcomeMessage?: string | null;
  relationshipStatus?: "Marriage" | "Relationship Without Marriage" | "Just Sex Friends" | null;
  yearsTogether?: number | null;
  partner1Age?: number | null;
  partner2Age?: number | null;
  interestsCsv?: string | null;
}

export interface UserForMessageContext {
  UserID: string;
  Username: string;
  id?: string;
  username?: string;
  profilePictureUrl?: string | null;
  isOnline?: boolean;
}

export type SharedPhotoStatus =
  | "pending" | "accepted" | "denied" | "viewed" | "expired" | "active";

export type VoiceMessageStatus = "pending" | "playing" | "heard" | "deleted";

export interface PhotoLikeBE {
  userId: string;
  username?: string;
  likeId?: string;
  photoId?: string;
  createdAt?: string;
}

export interface PhotoCommentBE {
  commentText: string;
  commentId?: string;
  id?: string;
  photoId?: string;
  userId?: string;
  username?: string;
  profilePictureUrl?: string | null;
  createdAt?: string;
}

export type DirectMessageStatusBE = "pending" | "sent" | "delivered" | "read" | "accepted" | "denied" | "viewed";

export interface DirectMessageBE {
  messageId?: string; MessageID?: string;
  senderUserId: string; SenderUserID?: string;
  recipientUserId: string; RecipientUserID?: string;
  messageContent: string; MessageContent?: string;
  status?: DirectMessageStatusBE; Status?: DirectMessageStatusBE;
  sentAt?: string; SentAt?: string;
  updatedAt?: string | null; UpdatedAt?: string | null;

  SenderUsername?: string;
  RecipientUsername?: string;
}

export interface Photo {
  id: string;
  userId: string;
  dataUrl: string;
  caption?: string | null;
  uploadedAt: string;
  isPublic?: boolean;
  likeCount?: number;
  commentCount?: number;
}

export interface PhotoDetails {
    photo: Photo;
    likes: PhotoLikeBE[];
    comments: PhotoCommentBE[];
    userHasLiked: boolean;
}

export interface ConversationPreview {
    otherUser: Partial<User> & { id: string; username: string; };
    lastMessage: {
        content: string;
        sentAt: string;
        senderId: string;
    };
}

export interface VoiceMessageSummary {
  voiceMessageId: string;
  senderUserId: string;
  senderUsername?: string | null;
  recipientUserId: string;
  recipientUsername?: string | null;
  durationSeconds: number;
  status: VoiceMessageStatus;
  createdAt: string;
  heardAt?: string | null;
  deletedAt?: string | null;
}

export interface VoiceMessageAudioPayload {
  voiceMessageId: string;
  audioBase64: string;
  audioMimeType: string;
  durationSeconds: number;
}

export type DirectMessage = DirectMessageBE;

// FIX: Added missing SharedPhotoItem interface.
export interface SharedPhotoItem {
  id: string;
  photoId: string;
  photoDataUrl?: string;
  photoCaption?: string | null;
  senderUserId: string;
  senderUsername: string;
  recipientUserId: string;
  recipientUsername: string;
  durationSeconds: number;
  sharedAt: string;
  expiresAt: string;
  status: SharedPhotoStatus;
}

// FIX: Added missing Notification interface.
export interface Notification {
  id: string;
  userId?: string;
  type: string;
  createdAt: string;
  message: string;
  isRead: boolean;
  sourceUserId?: string;
  sourceUsername?: string;
  entityId?: string;
  shareDetails?: SharedPhotoItem;
  messageSummary?: {
    MessageID?: string;
    SenderUserID?: string;
    SenderUsername?: string;
    MessageContent?: string;
  };
}

export type LocationBeaconVisibility = 'public' | 'favorites' | 'verified';

export interface UserLocationBeacon {
  beaconId: string;
  userId: string;
  latitude: number;
  longitude: number;
  visibility: LocationBeaconVisibility;
  message?: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}


