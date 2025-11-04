"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiSendContactForm = exports.apiToggleFavorite = exports.apiGetFavorites = exports.apiGetNotifications = exports.apiDeleteComment = exports.apiAddComment = exports.apiToggleLikePhoto = exports.apiGetPhotoDetails = exports.apiUpdateDirectMessageStatus = exports.apiGetConversationsList = exports.apiDeleteConversation = exports.apiGetConversation = exports.apiSendMessage = exports.apiUpdatePhotoShareStatus = exports.apiGetPendingPhotoShares = exports.apiGetReceivedShares = exports.apiGetSentShares = exports.apiSendPhoto = exports.apiDeletePhoto = exports.apiReplacePhoto = exports.apiUpdatePhotoPublicStatus = exports.apiUploadPhoto = exports.apiGetUserPhotos = exports.apiGetUserStats = exports.apiUpdateUser = exports.apiAdminGetAllUsers = exports.apiGetAllUsers = exports.apiGetUserById = exports.apiResetPasswordWithToken = exports.apiHandlePasswordApproval = exports.apiForgotPasswordRequest = exports.apiVerifyEmail = exports.apiSendPartnerVerificationEmail = exports.apiSendVerificationEmail = exports.apiRegisterUser = exports.apiLoginUser = void 0;
// Determine API_BASE_URL dynamically based on the frontend's hostname
const getApiBaseUrl = () => {
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        // Production / Staging environments
        if (hostname === 'swingerunion.com' || hostname.endsWith('.azurewebsites.net')) {
            return 'https://api.swingerunion.com';
        }
        // Local development
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return 'http://localhost:3001';
        }
    }
    // Fallback for other environments (like server-side rendering, though not used here)
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
};
const rawApiBaseUrl = getApiBaseUrl();
const API_BASE_URL = `${rawApiBaseUrl}/api`;
const mapBackendUserToFrontendUser = (backendUser) => {
    if (!backendUser)
        return null;
    if (!backendUser.id || !backendUser.username || !backendUser.email) {
        console.warn("Backend user object from API is missing essential fields:", backendUser);
        return null;
    }
    return {
        id: backendUser.id,
        username: backendUser.username,
        email: backendUser.email,
        bio: backendUser.bio,
        membershipType: backendUser.membershipType,
        membershipExpiryDate: backendUser.membershipExpiryDate,
        subscribedAt: backendUser.subscribedAt,
        profilePictureUrl: backendUser.profilePictureUrl,
        createdAt: backendUser.createdAt,
        updatedAt: backendUser.updatedAt,
        isOnline: backendUser.isOnline,
        city: backendUser.city,
        country: backendUser.country,
        isEmailVerified: backendUser.isEmailVerified,
        viber: backendUser.viber,
        isViberPublic: backendUser.isViberPublic,
        whatsApp: backendUser.whatsApp,
        isWhatsAppPublic: backendUser.isWhatsAppPublic,
        instagram: backendUser.instagram,
        isInstagramPublic: backendUser.isInstagramPublic,
        facebook: backendUser.facebook,
        isFacebookPublic: backendUser.isFacebookPublic,
        teams: backendUser.teams,
        isTeamsPublic: backendUser.isTeamsPublic,
        mail: backendUser.mail,
        isMailPublic: backendUser.isMailPublic,
        coupleType: backendUser.coupleType,
        partnerEmail: backendUser.partnerEmail,
        isPartnerEmailVerified: backendUser.isPartnerEmailVerified,
        partner1Nickname: backendUser.partner1Nickname,
        partner2Nickname: backendUser.partner2Nickname,
    };
};
async function handleApiResponse(response, url, mapFn) {
    if (!response.ok) {
        const error = new Error();
        try {
            const errorData = await response.json();
            error.message = errorData.message || `API Error at ${url}: ${response.status} ${response.statusText}`;
            error.code = errorData.code;
            error.unverifiedUser = errorData.unverifiedUser;
        }
        catch (e) {
            error.message = `API Error at ${url}: ${response.status} ${response.statusText}`;
        }
        console.error(`💔 ${error.message}`, {
            code: error.code,
            message: error.message,
            unverifiedUser: error.unverifiedUser,
            status: response.status,
            url,
        });
        throw error;
    }
    if (response.status === 204)
        return null;
    const data = await response.json();
    return mapFn ? mapFn(data) : data;
}
async function makeApiRequest(url, options = {}, mapFn) {
    console.log(`Making API request: ${options.method || 'GET'} ${url}`);
    try {
        const response = await fetch(url, options);
        return await handleApiResponse(response, url, mapFn);
    }
    catch (error) {
        if (error.message.includes('Failed to fetch')) {
            throw new Error(`Network error: Could not connect to API at ${url}. Ensure backend is running and accessible (${rawApiBaseUrl}). Check CORS.`);
        }
        throw error;
    }
}
// Auth
const apiLoginUser = async (credentials) => makeApiRequest(`${API_BASE_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials), }, mapBackendUserToFrontendUser);
exports.apiLoginUser = apiLoginUser;
const apiRegisterUser = async (userData) => makeApiRequest(`${API_BASE_URL}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(userData), });
exports.apiRegisterUser = apiRegisterUser;
const apiSendVerificationEmail = async (userId, email) => makeApiRequest(`${API_BASE_URL}/auth/send-verification-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, email }), });
exports.apiSendVerificationEmail = apiSendVerificationEmail;
const apiSendPartnerVerificationEmail = async (userId) => makeApiRequest(`${API_BASE_URL}/auth/send-partner-verification-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }), });
exports.apiSendPartnerVerificationEmail = apiSendPartnerVerificationEmail;
const apiVerifyEmail = async (token) => makeApiRequest(`${API_BASE_URL}/auth/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), });
exports.apiVerifyEmail = apiVerifyEmail;
const apiForgotPasswordRequest = async (email) => makeApiRequest(`${API_BASE_URL}/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }), });
exports.apiForgotPasswordRequest = apiForgotPasswordRequest;
const apiHandlePasswordApproval = async (token, decision) => makeApiRequest(`${API_BASE_URL}/auth/handle-password-approval`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, decision }), });
exports.apiHandlePasswordApproval = apiHandlePasswordApproval;
const apiResetPasswordWithToken = async (token, newPassword) => makeApiRequest(`${API_BASE_URL}/auth/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, newPassword }), });
exports.apiResetPasswordWithToken = apiResetPasswordWithToken;
// Users
const apiGetUserById = async (userId) => makeApiRequest(`${API_BASE_URL}/users/${userId}`, {}, mapBackendUserToFrontendUser);
exports.apiGetUserById = apiGetUserById;
const apiGetAllUsers = async (currentUserId) => {
    const mapUsersArray = (data) => (Array.isArray(data) ? data.map(mapBackendUserToFrontendUser).filter(Boolean) : []);
    const url = currentUserId ? `${API_BASE_URL}/users?currentUserId=${currentUserId}` : `${API_BASE_URL}/users`;
    return makeApiRequest(url, {}, mapUsersArray);
};
exports.apiGetAllUsers = apiGetAllUsers;
const apiAdminGetAllUsers = async () => {
    const mapUsersArray = (data) => (Array.isArray(data) ? data.map(mapBackendUserToFrontendUser).filter(Boolean) : []);
    return makeApiRequest(`${API_BASE_URL}/users/admin/all`, {}, mapUsersArray);
};
exports.apiAdminGetAllUsers = apiAdminGetAllUsers;
const apiUpdateUser = async (userId, updates) => makeApiRequest(`${API_BASE_URL}/users/${userId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates), }, mapBackendUserToFrontendUser);
exports.apiUpdateUser = apiUpdateUser;
const apiGetUserStats = async () => makeApiRequest(`${API_BASE_URL}/users/stats`);
exports.apiGetUserStats = apiGetUserStats;
// Photos
const mapBackendPhotoToFrontendPhoto = (p) => {
    if (!p)
        return null;
    return { id: p.PhotoID, userId: p.UserID, dataUrl: p.DataUrl, caption: p.Caption, uploadedAt: p.UploadedAt, isPublic: p.IsPublic ?? false, likeCount: p.likeCount, commentCount: p.commentCount };
};
const mapPhotosArray = (data) => (Array.isArray(data) ? data.map(mapBackendPhotoToFrontendPhoto).filter(Boolean) : []);
const apiGetUserPhotos = async (userId) => makeApiRequest(`${API_BASE_URL}/photos/user/${userId}`, {}, mapPhotosArray);
exports.apiGetUserPhotos = apiGetUserPhotos;
const apiUploadPhoto = async (userId, photoData) => {
    const payload = { ...photoData, isPublic: photoData.isPublic ?? false };
    const newPhoto = await makeApiRequest(`${API_BASE_URL}/photos/user/${userId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), }, mapBackendPhotoToFrontendPhoto);
    if (!newPhoto)
        throw new Error("Failed to upload photo or map response.");
    return newPhoto;
};
exports.apiUploadPhoto = apiUploadPhoto;
const apiUpdatePhotoPublicStatus = async (userId, photoId, isPublic) => {
    const updatedPhoto = await makeApiRequest(`${API_BASE_URL}/photos/${photoId}/user/${userId}/public`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPublic }), }, mapBackendPhotoToFrontendPhoto);
    if (!updatedPhoto)
        throw new Error("Failed to update photo public status or map response.");
    return updatedPhoto;
};
exports.apiUpdatePhotoPublicStatus = apiUpdatePhotoPublicStatus;
const apiReplacePhoto = async (userId, photoId, dataUrl) => {
    const updatedPhoto = await makeApiRequest(`${API_BASE_URL}/photos/${photoId}/user/${userId}/replace`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataUrl }) }, mapBackendPhotoToFrontendPhoto);
    if (!updatedPhoto)
        throw new Error("Failed to replace photo or map response.");
    return updatedPhoto;
};
exports.apiReplacePhoto = apiReplacePhoto;
const apiDeletePhoto = async (userId, photoId) => { await makeApiRequest(`${API_BASE_URL}/photos/${photoId}/user/${userId}`, { method: 'DELETE', }); };
exports.apiDeletePhoto = apiDeletePhoto;
const mapSharedPhotoItem = (item) => {
    if (!item || !item.ShareID)
        return null;
    return { id: item.ShareID, photoId: item.PhotoID, photoDataUrl: item.PhotoDataUrl ?? undefined, photoCaption: item.PhotoCaption ?? undefined, senderUserId: item.SenderUserID, senderUsername: item.SenderUsername, recipientUserId: item.RecipientUserID, recipientUsername: item.RecipientUsername, durationSeconds: item.DurationSeconds, sharedAt: item.SharedAt, expiresAt: item.ExpiresAt, status: item.Status, };
};
const mapSharedPhotoArray = (items) => (Array.isArray(items) ? items.map(mapSharedPhotoItem).filter(Boolean) : []);
const apiSendPhoto = async (shareData) => {
    const payload = { photoId: shareData.photoId, senderUserId: shareData.senderUserId, recipientUserId: shareData.recipientUserId, recipientUsername: shareData.recipientUsername, durationSeconds: shareData.durationSeconds, };
    const sentShare = await makeApiRequest(`${API_BASE_URL}/photos/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), }, mapSharedPhotoItem);
    if (!sentShare)
        throw new Error("Failed to send photo or map response.");
    return sentShare;
};
exports.apiSendPhoto = apiSendPhoto;
const apiGetSentShares = async (userId) => makeApiRequest(`${API_BASE_URL}/photos/shared/sent/${userId}`, {}, mapSharedPhotoArray);
exports.apiGetSentShares = apiGetSentShares;
const apiGetReceivedShares = async (userId, statusFilter) => {
    let url = `${API_BASE_URL}/photos/shared/received/${userId}`;
    if (statusFilter)
        url += `?status=${statusFilter}`;
    return makeApiRequest(url, {}, mapSharedPhotoArray);
};
exports.apiGetReceivedShares = apiGetReceivedShares;
const apiGetPendingPhotoShares = async (userId) => (0, exports.apiGetReceivedShares)(userId, 'pending');
exports.apiGetPendingPhotoShares = apiGetPendingPhotoShares;
const apiUpdatePhotoShareStatus = async (shareId, status, actingUserId) => makeApiRequest(`${API_BASE_URL}/photos/shared/${shareId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, actingUserId }), }, mapSharedPhotoItem);
exports.apiUpdatePhotoShareStatus = apiUpdatePhotoShareStatus;
// --- Direct Message API Functions ---
const mapBackendDirectMessageToFrontend = (dm) => ({
    MessageID: dm.MessageID,
    SenderUserID: dm.SenderUserID,
    SenderUsername: dm.SenderUsername,
    RecipientUserID: dm.RecipientUserID,
    RecipientUsername: dm.RecipientUsername,
    MessageContent: dm.MessageContent,
    SentAt: dm.SentAt,
    Status: dm.Status, // Use the frontend DirectMessageStatus type
});
const mapDirectMessagesArray = (data) => {
    if (!Array.isArray(data))
        return [];
    return data.map(mapBackendDirectMessageToFrontend);
};
const apiSendMessage = async (senderUserId, recipientUserId, messageContent) => {
    const message = await makeApiRequest(`${API_BASE_URL}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderUserId, recipientUserId, messageContent }),
    }, (data) => data);
    if (!message)
        throw new Error("Failed to send message or map response.");
    return mapBackendDirectMessageToFrontend(message);
};
exports.apiSendMessage = apiSendMessage;
const apiGetConversation = async (currentUserId, otherUserId) => {
    return makeApiRequest(`${API_BASE_URL}/messages/conversation/${otherUserId}?currentUserId=${currentUserId}`, {}, mapDirectMessagesArray);
};
exports.apiGetConversation = apiGetConversation;
const apiDeleteConversation = async (currentUserId, otherUserId) => makeApiRequest(`${API_BASE_URL}/messages/conversation/${otherUserId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actingUserId: currentUserId }) });
exports.apiDeleteConversation = apiDeleteConversation;
const apiGetConversationsList = async (userId) => makeApiRequest(`${API_BASE_URL}/messages/conversations/${userId}`, {}, mapConversationPreviewsArray);
exports.apiGetConversationsList = apiGetConversationsList;
const apiUpdateDirectMessageStatus = async (messageId, status, actingUserId) => {
    // Ensure the status being sent matches the backend's expectation (DirectMessageStatusBE)
    const backendStatus = status;
    return makeApiRequest(`${API_BASE_URL}/messages/${messageId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: backendStatus, actingUserId }),
    }, (data) => data ? mapBackendDirectMessageToFrontend(data) : null);
};
exports.apiUpdateDirectMessageStatus = apiUpdateDirectMessageStatus;
const mapBackendConvoToPreview = (item) => {
    if (!item || !item.UserID)
        return null;
    const otherUser = {
        id: item.UserID,
        username: item.Username,
        profilePictureUrl: item.ProfilePictureUrl,
        isOnline: item.IsOnline,
        city: item.City,
        country: item.Country,
    };
    return {
        otherUser,
        lastMessage: {
            content: item.LastMessageContent,
            sentAt: item.LastMessageSentAt,
            senderId: item.LastMessageSenderID,
        },
    };
};
const mapConversationPreviewsArray = (items) => (Array.isArray(items) ? items.map(mapBackendConvoToPreview).filter(Boolean) : []);
const apiGetPhotoDetails = async (photoId, currentUserId) => {
    const url = currentUserId ? `${API_BASE_URL}/photos/${photoId}/details?currentUserId=${currentUserId}` : `${API_BASE_URL}/photos/${photoId}/details`;
    const mapPhotoDetails = (data) => ({
        photo: mapBackendPhotoToFrontendPhoto(data.photo),
        likes: data.likes.map((l) => ({ userId: l.UserID, username: l.Username })),
        comments: data.comments.map((c) => ({
            id: c.CommentID,
            photoId: c.PhotoID,
            userId: c.UserID,
            username: c.Username,
            profilePictureUrl: c.ProfilePictureUrl,
            commentText: c.CommentText,
            createdAt: c.CreatedAt,
        })),
        userHasLiked: data.userHasLiked,
    });
    return makeApiRequest(url, {}, mapPhotoDetails);
};
exports.apiGetPhotoDetails = apiGetPhotoDetails;
const apiToggleLikePhoto = async (photoId, userId) => makeApiRequest(`${API_BASE_URL}/photos/${photoId}/like`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
exports.apiToggleLikePhoto = apiToggleLikePhoto;
const apiAddComment = async (photoId, userId, commentText) => {
    const mapComment = (c) => ({
        id: c.id, photoId: c.photoId, userId: c.userId, username: c.username,
        profilePictureUrl: c.profilePictureUrl, commentText: c.commentText, createdAt: c.createdAt,
    });
    return makeApiRequest(`${API_BASE_URL}/photos/${photoId}/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, commentText }) }, mapComment);
};
exports.apiAddComment = apiAddComment;
const apiDeleteComment = async (commentId, actingUserId) => makeApiRequest(`${API_BASE_URL}/photos/comments/${commentId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actingUserId }) });
exports.apiDeleteComment = apiDeleteComment;
const apiGetNotifications = async (userId) => {
    return makeApiRequest(`${API_BASE_URL}/notifications/${userId}`);
};
exports.apiGetNotifications = apiGetNotifications;
const apiGetFavorites = async (userId) => {
    return makeApiRequest(`${API_BASE_URL}/users/${userId}/favorites`);
};
exports.apiGetFavorites = apiGetFavorites;
const apiToggleFavorite = async (userId, favoriteUserId) => {
    return makeApiRequest(`${API_BASE_URL}/users/${userId}/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favoriteUserId }),
    });
};
exports.apiToggleFavorite = apiToggleFavorite;
const apiSendContactForm = async (data) => {
    return makeApiRequest(`${API_BASE_URL}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
};
exports.apiSendContactForm = apiSendContactForm;
