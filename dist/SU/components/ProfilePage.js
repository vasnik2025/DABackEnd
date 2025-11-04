
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfilePage = void 0;
const react_1 = __importStar(require("react"));
const react_router_dom_1 = require("react-router-dom");
const useAuth_ts_1 = require("../hooks/useAuth.ts");
const PhotoGrid_1 = __importDefault(require("./PhotoGrid"));
const Modal_1 = __importDefault(require("./Modal"));
const EditUserDetailsModal_1 = __importDefault(require("./EditUserDetailsModal"));
const ChangePasswordModal_1 = __importDefault(require("./ChangePasswordModal"));
const MemberProfileModal_1 = __importDefault(require("./MemberProfileModal"));
const ViewMyPhotoModal_1 = __importDefault(require("./ViewMyPhotoModal"));
const ViewSharedPhotoModal_1 = __importDefault(require("./ViewSharedPhotoModal"));
const SendPhotoForm_1 = __importDefault(require("./SendPhotoForm"));
const MemberDetailsPopup_1 = __importDefault(require("./MemberDetailsPopup"));
const NotificationPopover_1 = __importDefault(require("./NotificationPopover"));
const EmailVerificationModal_1 = __importDefault(require("./EmailVerificationModal"));
const apiService_1 = require("../services/apiService");
const PencilIcon_1 = require("./icons/PencilIcon");
const UserCircleIcon_1 = require("./icons/UserCircleIcon");
const SearchIcon_1 = require("./icons/SearchIcon");
const CameraIcon_1 = require("./icons/CameraIcon");
const BellIcon_1 = require("./icons/BellIcon");
const ChatBubbleLeftRightIcon_1 = require("./icons/ChatBubbleLeftRightIcon");
const ViberIcon_1 = require("./icons/ViberIcon");
const WhatsAppIcon_1 = require("./icons/WhatsAppIcon");
const InstagramIcon_1 = require("./icons/InstagramIcon");
const FacebookIcon_1 = require("./icons/FacebookIcon");
const TeamsIcon_1 = require("./icons/TeamsIcon");
const MailIcon_1 = require("./icons/MailIcon");
const LockOpenIcon_1 = require("./icons/LockOpenIcon");
const LockClosedIcon_1 = require("./icons/LockClosedIcon");
const UploadIcon_1 = require("./icons/UploadIcon");
const HeartIcon_1 = require("./icons/HeartIcon");
const getMembershipDisplay = (user) => {
    if (!user)
        return "N/A";
    const { membershipType, subscribedAt, membershipExpiryDate } = user;
    const getTrialDaysRemaining = (expiry) => {
        if (!expiry)
            return null;
        const diff = new Date(expiry).getTime() - Date.now();
        if (diff < 0)
            return 0;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };
    if (membershipType === 'unlimited') {
        return `Unlimited Membership (Since: ${subscribedAt ? new Date(subscribedAt).toLocaleDateString() : 'N/A'})`;
    }
    if (membershipType === 'trial') {
        const days = getTrialDaysRemaining(membershipExpiryDate);
        if (days !== null && days > 0) {
            return `Trial Member (${days} day(s) remaining)`;
        }
        return `Trial Membership (Expired: ${membershipExpiryDate ? new Date(membershipExpiryDate).toLocaleDateString() : "N/A"})`;
    }
    return 'No Active Subscription';
};
const SocialInput = ({ id, label, Icon, value, onValueChange, isPublic, onIsPublicChange, isSaving }) => (react_1.default.createElement("div", { className: "space-y-1" },
    react_1.default.createElement("label", { htmlFor: `social-${id}`, className: "flex items-center text-sm font-medium text-gray-700 dark:text-gray-300" },
        React.createElement(Icon, { className: "w-5 h-5 mr-2 text-gray-500" }),
        " ",
        label),
    react_1.default.createElement("div", { className: "flex items-center space-x-2" },
        react_1.default.createElement("input", { id: `social-${id}`, type: "text", value: value, onChange: (e) => onValueChange(e.target.value), disabled: isSaving, className: "flex-grow block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-accent-500 focus:border-accent-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white", placeholder: `${label} username/number` }),
        React.createElement("label", { htmlFor: `public-social-${id}`, className: "relative inline-flex items-center cursor-pointer" },
            react_1.default.createElement("input", { type: "checkbox", id: `public-social-${id}`, checked: isPublic, onChange: (e) => onIsPublicChange(e.target.checked), disabled: isSaving, className: "sr-only peer" }),
            react_1.default.createElement("div", { className: "w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-300 dark:peer-focus:ring-accent-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent-600" })))));
const SocialLinkDisplay = ({ Icon, value, isPublic, color }) => {
    if (!value)
        return null;
    return (react_1.default.createElement("div", { className: "flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50" },
        react_1.default.createElement("div", { className: "flex items-center space-x-3" },
            React.createElement(Icon, { className: `w-6 h-6 ${color}` }),
            React.createElement("span", { className: "text-gray-800 dark:text-gray-200" }, value)),
        React.createElement("div", { title: isPublic ? 'Publicly visible' : 'Private' }, isPublic ? React.createElement(LockOpenIcon_1.LockOpenIcon, { className: "w-5 h-5 text-yellow-500" }) : React.createElement(LockClosedIcon_1.LockClosedIcon, { className: "w-5 h-5 text-red-500" }))));
};
const formatLastActive = (user) => {
    if (user.isOnline)
        return "Active Now";
    if (!user.updatedAt)
        return 'Never';
    const now = new Date();
    const lastActiveDate = new Date(user.updatedAt);
    const diffSeconds = Math.floor((now.getTime() - lastActiveDate.getTime()) / 1000);
    if (diffSeconds < 300)
        return "Active Now"; // 5 minutes
    if (diffSeconds < 3600)
        return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400)
        return `${Math.floor(diffSeconds / 3600)}h ago`;
    return lastActiveDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
const ProfilePage = () => {
    const { currentUser, updateUser, updateUserProfilePicture, reloadUser } = (0, useAuth_ts_1.useAuth)();
    const navigate = (0, react_router_dom_1.useNavigate)();
    const [photos, setPhotos] = (0, react_1.useState)([]);
    const [isPhotosLoading, setIsPhotosLoading] = (0, react_1.useState)(false);
    const [selectedPhotoForModal, setSelectedPhotoForModal] = (0, react_1.useState)(null);
    const [isViewPhotoModalOpen, setIsViewPhotoModalOpen] = (0, react_1.useState)(false);
    const [isEditingBio, setIsEditingBio] = (0, react_1.useState)(false);
    const [editableBioText, setEditableBioText] = (0, react_1.useState)('');
    const [isBioUpdating, setIsBioUpdating] = (0, react_1.useState)(false);
    const [isProfilePicUpdating, setIsProfilePicUpdating] = (0, react_1.useState)(false);
    const [searchTerm, setSearchTerm] = (0, react_1.useState)('');
    const [searchResults, setSearchResults] = (0, react_1.useState)([]);
    const profilePictureInputRef = (0, react_1.useRef)(null);
    const searchContainerRef = (0, react_1.useRef)(null);
    const [isSendModalOpen, setIsSendModalOpen] = (0, react_1.useState)(false);
    const [photoToSend, setPhotoToSend] = (0, react_1.useState)(null);
    const [hoveredUser, setHoveredUser] = (0, react_1.useState)(null);
    const [popupPosition, setPopupPosition] = (0, react_1.useState)(null);
    const hoverTimeoutRef = (0, react_1.useRef)(null);
    const popupRef = (0, react_1.useRef)(null);
    const notificationPopoverRef = (0, react_1.useRef)(null);
    const notificationButtonRef = (0, react_1.useRef)(null);
    const [allUsers, setAllUsers] = (0, react_1.useState)([]);
    const [newMembers, setNewMembers] = (0, react_1.useState)([]);
    const [filterOnlineOnly, setFilterOnlineOnly] = (0, react_1.useState)(false);
    const [filterByCity, setFilterByCity] = (0, react_1.useState)(false);
    const [cityFilterValue, setCityFilterValue] = (0, react_1.useState)('');
    const [isEditDetailsModalOpen, setIsEditDetailsModalOpen] = (0, react_1.useState)(false);
    const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = (0, react_1.useState)(false);
    const [isVerificationModalOpen, setIsVerificationModalOpen] = (0, react_1.useState)(false);
    const [isDonationModalOpen, setIsDonationModalOpen] = (0, react_1.useState)(false);
    const [donationState, setDonationState] = (0, react_1.useState)('form');
    const [isMemberProfileModalOpen, setIsMemberProfileModalOpen] = (0, react_1.useState)(false);
    const [selectedUserForProfileModal, setSelectedUserForProfileModal] = (0, react_1.useState)(null);
    const [allNotifications, setAllNotifications] = (0, react_1.useState)([]);
    const [isLoadingNotifications, setIsLoadingNotifications] = (0, react_1.useState)(false);
    const [notificationError, setNotificationError] = (0, react_1.useState)(null);
    const [isNotificationPopoverOpen, setIsNotificationPopoverOpen] = (0, react_1.useState)(false);
    const [isViewSharedPhotoModalOpen, setIsViewSharedPhotoModalOpen] = (0, react_1.useState)(false);
    const [selectedSharedPhotoItem, setSelectedSharedPhotoItem] = (0, react_1.useState)(null);
    const [isEditingSocials, setIsEditingSocials] = (0, react_1.useState)(false);
    const [viber, setViber] = (0, react_1.useState)('');
    const [isViberPublic, setIsViberPublic] = (0, react_1.useState)(false);
    const [whatsApp, setWhatsApp] = (0, react_1.useState)('');
    const [isWhatsAppPublic, setIsWhatsAppPublic] = (0, react_1.useState)(false);
    const [instagram, setInstagram] = (0, react_1.useState)('');
    const [isInstagramPublic, setIsInstagramPublic] = (0, react_1.useState)(false);
    const [facebook, setFacebook] = (0, react_1.useState)('');
    const [isFacebookPublic, setIsFacebookPublic] = (0, react_1.useState)(false);
    const [teams, setTeams] = (0, react_1.useState)('');
    const [isTeamsPublic, setIsTeamsPublic] = (0, react_1.useState)(false);
    const [mail, setMail] = (0, react_1.useState)('');
    const [isMailPublic, setIsMailPublic] = (0, react_1.useState)(false);
    const [isSocialsSaving, setIsSocialsSaving] = (0, react_1.useState)(false);
    const [socialsError, setSocialsError] = (0, react_1.useState)('');
    const [isUploading, setIsUploading] = (0, react_1.useState)(false);
    const uploadInputRef = (0, react_1.useRef)(null);
    const handleUploadButtonClick = () => { var _a; return (_a = uploadInputRef.current) === null || _a === void 0 ? void 0 : _a.click(); };
    const handleOpenDonationModal = () => {
        setDonationState('form'); // Reset to form view every time it's opened
        setIsDonationModalOpen(true);
    };
    const handleCloseDonationModal = () => {
        setIsDonationModalOpen(false);
    };
    const handlePaypalSubmit = () => {
        setDonationState('thanks');
    };
    const resetSocialsState = (0, react_1.useCallback)(() => {
        if (currentUser) {
            setViber(currentUser.viber || '');
            setIsViberPublic(currentUser.isViberPublic || false);
            setWhatsApp(currentUser.whatsApp || '');
            setIsWhatsAppPublic(currentUser.isWhatsAppPublic || false);
            setInstagram(currentUser.instagram || '');
            setIsInstagramPublic(currentUser.isInstagramPublic || false);
            setFacebook(currentUser.facebook || '');
            setIsFacebookPublic(currentUser.isFacebookPublic || false);
            setTeams(currentUser.teams || '');
            setIsTeamsPublic(currentUser.isTeamsPublic || false);
            setMail(currentUser.mail || currentUser.email || '');
            setIsMailPublic(currentUser.isMailPublic || false);
            setSocialsError('');
        }
    }, [currentUser]);
    (0, react_1.useEffect)(() => {
        if (currentUser) {
            resetSocialsState();
        }
    }, [currentUser, resetSocialsState]);
    const fetchAndCombineNotifications = (0, react_1.useCallback)(async () => {
        if (!currentUser)
            return;
        setIsLoadingNotifications(true);
        setNotificationError(null);
        try {
            const socialNotifications = await (0, apiService_1.apiGetNotifications)(currentUser.id);
            const pendingPhotoShares = await (0, apiService_1.apiGetPendingPhotoShares)(currentUser.id);
            const sentPhotoShares = await (0, apiService_1.apiGetSentShares)(currentUser.id);
            const pendingDMs = await (0, apiService_1.apiGetConversation)(currentUser.id, 'ALL_UNACCEPTED');
            const dmNotifications = pendingDMs
                .filter((dm) => dm.RecipientUserID === currentUser.id && dm.Status === 'pending')
                .map((dm) => ({
                id: `dm_req_${dm.MessageID}`,
                type: 'new_message',
                createdAt: dm.SentAt,
                message: `${dm.SenderUsername || 'A user'} sent you a message.`,
                messageSummary: {
                    MessageID: dm.MessageID,
                    SenderUserID: dm.SenderUserID,
                    SenderUsername: dm.SenderUsername,
                    MessageContent: dm.MessageContent,
                },
                isRead: false,
            }));
            const photoShareRequestNotifications = pendingPhotoShares.map(share => ({
                id: `share_req_${share.id}`, type: 'photo_share_request', createdAt: share.sharedAt,
                shareDetails: share, message: `${share.senderUsername} shared a photo with you.`, isRead: false,
            }));
            const photoShareUpdateNotifications = sentPhotoShares
                .filter(share => share.status === 'accepted' || share.status === 'denied' || share.status === 'viewed')
                .map(share => ({
                id: `share_upd_${share.id}_${share.status}`, type: 'photo_share_update', createdAt: share.sharedAt,
                shareDetails: share, message: `Your photo share to ${share.recipientUsername} was ${share.status}.`, isRead: false,
            }));
            const combined = [...socialNotifications, ...photoShareRequestNotifications, ...photoShareUpdateNotifications, ...dmNotifications];
            combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            setAllNotifications(combined);
        }
        catch (err) {
            console.error("Failed to fetch notifications:", err);
            setNotificationError(err.message || "Could not load notifications.");
        }
        finally {
            setIsLoadingNotifications(false);
        }
    }, [currentUser]);
    const fetchUserPhotos = (0, react_1.useCallback)(async () => {
        if (!currentUser)
            return;
        setIsPhotosLoading(true);
        try {
            const userPhotos = await (0, apiService_1.apiGetUserPhotos)(currentUser.id);
            setPhotos(userPhotos);
        }
        catch (e) {
            console.error("Failed to fetch user photos:", e);
        }
        finally {
            setIsPhotosLoading(false);
        }
    }, [currentUser]);
    const fetchAllUsers = (0, react_1.useCallback)(async () => {
        if (!currentUser)
            return;
        try {
            const users = await (0, apiService_1.apiGetAllUsers)(currentUser.id);
            setAllUsers(users);
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const recentMembers = users.filter(u => u.createdAt && new Date(u.createdAt) > twentyFourHoursAgo);
            setNewMembers(recentMembers);
        }
        catch (e) {
            console.error("Failed to fetch users", e);
        }
    }, [currentUser]);
    (0, react_1.useEffect)(() => {
        if (currentUser) {
            fetchUserPhotos();
            fetchAllUsers();
            fetchAndCombineNotifications();
            setEditableBioText(currentUser.bio || '');
        }
    }, [currentUser, fetchUserPhotos, fetchAllUsers, fetchAndCombineNotifications]);
    (0, react_1.useEffect)(() => {
        const handleClickOutside = (event) => {
            if (isNotificationPopoverOpen && notificationPopoverRef.current && !notificationPopoverRef.current.contains(event.target) && notificationButtonRef.current && !notificationButtonRef.current.contains(event.target)) {
                setIsNotificationPopoverOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isNotificationPopoverOpen]);
    const handlePhotoUploaded = (0, react_1.useCallback)(async (photoData) => {
        if (!currentUser)
            return;
        try {
            const photoToUpload = { ...photoData, isPublic: false, };
            await (0, apiService_1.apiUploadPhoto)(currentUser.id, photoToUpload);
            fetchUserPhotos();
        }
        catch (error) {
            console.error("Failed to upload photo:", error);
            alert("Photo upload failed.");
        }
    }, [currentUser, fetchUserPhotos]);
    const handleFileSelected = (0, react_1.useCallback)((event) => {
        var _a;
        const file = (_a = event.target.files) === null || _a === void 0 ? void 0 : _a[0];
        if (!file)
            return;
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file (e.g., JPG, PNG, GIF).');
            if (event.target)
                event.target.value = '';
            return;
        }
        setIsUploading(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                const photoDataToUpload = {
                    dataUrl: reader.result,
                    caption: `My new photo from ${new Date().toLocaleDateString()}`,
                };
                await handlePhotoUploaded(photoDataToUpload);
            }
            catch (err) {
                console.error("Error during photo upload process:", err);
            }
            finally {
                setIsUploading(false);
                if (event.target)
                    event.target.value = '';
            }
        };
        reader.onerror = () => {
            alert('Failed to read file.');
            setIsUploading(false);
            if (event.target)
                event.target.value = '';
        };
        reader.readAsDataURL(file);
    }, [handlePhotoUploaded]);
    const handleViewPhoto = (photo) => { setSelectedPhotoForModal(photo); setIsViewPhotoModalOpen(true); };
    const handleCloseViewPhotoModal = () => setIsViewPhotoModalOpen(false);
    const handleTogglePublic = (photoId) => { const photo = photos.find(p => p.id === photoId); if (photo && currentUser)
        (0, apiService_1.apiUpdatePhotoPublicStatus)(currentUser.id, photoId, !photo.isPublic).then(fetchUserPhotos); };
    const handleDelete = (photoId) => { if (currentUser && window.confirm("Are you sure?"))
        (0, apiService_1.apiDeletePhoto)(currentUser.id, photoId).then(fetchUserPhotos); };
    const handleSend = (photo) => { setPhotoToSend(photo); setIsSendModalOpen(true); };
    const handleReplace = (photoId, dataUrl) => { if (currentUser)
        (0, apiService_1.apiReplacePhoto)(currentUser.id, photoId, dataUrl).then(() => { fetchUserPhotos(); handleCloseViewPhotoModal(); }); };
    const handleDeleteComment = async (commentId) => { if (currentUser)
        await (0, apiService_1.apiDeleteComment)(commentId, currentUser.id); };
    const handleOpenEditDetailsModal = () => setIsEditDetailsModalOpen(true);
    const handleSaveUserDetails = async (updatedData) => { await updateUser(updatedData); setIsEditDetailsModalOpen(false); await reloadUser(); };
    const handleOpenChangePasswordModal = () => { setIsEditDetailsModalOpen(false); setIsChangePasswordModalOpen(true); };
    const handleSavePassword = async (currentPassword, newPassword) => { if (newPassword) {
        await updateUser({ currentPassword, newPassword });
        setIsChangePasswordModalOpen(false);
    } };
    const handleToggleOnlineStatus = async () => {
        var _a;
        if (!currentUser)
            return;
        await updateUser({ isOnline: !((_a = currentUser.isOnline) !== null && _a !== void 0 ? _a : false) });
        await reloadUser();
    };
    const handleEditBioClick = () => {
        var _a;
        setEditableBioText((_a = currentUser === null || currentUser === void 0 ? void 0 : currentUser.bio) !== null && _a !== void 0 ? _a : '');
        setIsEditingBio(true);
    };
    const handleBioTextChange = (e) => setEditableBioText(e.target.value);
    const handleSaveBio = async () => { if (!currentUser)
        return; setIsBioUpdating(true); try {
        await updateUser({ bio: editableBioText });
        setIsEditingBio(false);
        await reloadUser();
    }
    catch (e) {
        console.error(e);
    }
    finally {
        setIsBioUpdating(false);
    } };
    const handleCancelEditBio = () => { var _a; setEditableBioText((_a = currentUser === null || currentUser === void 0 ? void 0 : currentUser.bio) !== null && _a !== void 0 ? _a : ''); setIsEditingBio(false); };
    const handleSaveSocials = async () => {
        if (!currentUser)
            return;
        setSocialsError('');
        const updates = {};
        let changed = false;
        const checkChange = (key, newValue, originalValue) => {
            if (newValue !== originalValue) {
                updates[key] = newValue;
                changed = true;
            }
        };
        checkChange('viber', viber.trim(), currentUser.viber || '');
        checkChange('isViberPublic', isViberPublic, currentUser.isViberPublic || false);
        checkChange('whatsApp', whatsApp.trim(), currentUser.whatsApp || '');
        checkChange('isWhatsAppPublic', isWhatsAppPublic, currentUser.isWhatsAppPublic || false);
        checkChange('instagram', instagram.trim(), currentUser.instagram || '');
        checkChange('isInstagramPublic', isInstagramPublic, currentUser.isInstagramPublic || false);
        checkChange('facebook', facebook.trim(), currentUser.facebook || '');
        checkChange('isFacebookPublic', isFacebookPublic, currentUser.isFacebookPublic || false);
        checkChange('teams', teams.trim(), currentUser.teams || '');
        checkChange('isTeamsPublic', isTeamsPublic, currentUser.isTeamsPublic || false);
        checkChange('mail', mail.trim(), currentUser.mail || '');
        checkChange('isMailPublic', isMailPublic, currentUser.isMailPublic || false);
        if (!changed) {
            setSocialsError('No changes to save.');
            return;
        }
        setIsSocialsSaving(true);
        try {
            await updateUser(updates);
            await reloadUser();
            setIsEditingSocials(false);
        }
        catch (err) {
            setSocialsError(err.message || 'Failed to save social links.');
        }
        finally {
            setIsSocialsSaving(false);
        }
    };
    const handleCancelEditSocials = () => {
        resetSocialsState();
        setIsEditingSocials(false);
    };
    const handleProfilePictureChange = (event) => {
        var _a;
        const file = (_a = event.target.files) === null || _a === void 0 ? void 0 : _a[0];
        if (!file)
            return;
        if (!file.type.startsWith('image/')) {
            alert('Please select an image file.');
            return;
        }
        setIsProfilePicUpdating(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                await updateUserProfilePicture(reader.result);
                await reloadUser();
            }
            catch (error) {
                console.error('Failed to update profile picture:', error);
                alert('Failed to update profile picture.');
            }
            finally {
                setIsProfilePicUpdating(false);
            }
        };
        reader.onerror = () => {
            alert("Failed to read file.");
            setIsProfilePicUpdating(false);
        };
        reader.readAsDataURL(file);
        if (event.target) {
            event.target.value = '';
        }
    };
    const handleSearchChange = (e) => {
        const term = e.target.value;
        setSearchTerm(term);
        filterAndSetResults(term, filterOnlineOnly, cityFilterValue);
    };
    const filterAndSetResults = (0, react_1.useCallback)((term, online, city) => {
        let results = allUsers;
        if (term.trim())
            results = results.filter(u => u.username.toLowerCase().includes(term.toLowerCase()));
        if (online)
            results = results.filter(u => u.isOnline);
        if (filterByCity && city.trim())
            results = results.filter(u => { var _a; return (_a = u.city) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(city.toLowerCase()); });
        setSearchResults(results);
    }, [allUsers, filterByCity]);
    (0, react_1.useEffect)(() => { filterAndSetResults(searchTerm, filterOnlineOnly, cityFilterValue); }, [filterOnlineOnly, filterByCity, cityFilterValue, searchTerm, filterAndSetResults]);
    const handleMouseEnterUser = (user, event) => {
        if (hoverTimeoutRef.current)
            clearTimeout(hoverTimeoutRef.current);
        const rect = event.currentTarget.getBoundingClientRect();
        const popupWidth = 288;
        const popupHeight = 200;
        const gap = 10;
        let newLeft = rect.left + window.scrollX - popupWidth - gap;
        if (newLeft < gap)
            newLeft = rect.right + window.scrollX + gap;
        let newTop = rect.top + window.scrollY;
        if (newTop + popupHeight > window.innerHeight + window.scrollY - gap)
            newTop = window.innerHeight + window.scrollY - popupHeight - gap;
        if (newTop < window.scrollY + gap)
            newTop = window.scrollY + gap;
        setHoveredUser(user);
        setPopupPosition({ top: newTop, left: newLeft });
    };
    const handleMouseLeaveUser = () => {
        hoverTimeoutRef.current = window.setTimeout(() => {
            setHoveredUser(null);
            setPopupPosition(null);
        }, 150);
    };
    const handlePopupMouseEnter = () => {
        if (hoverTimeoutRef.current)
            clearTimeout(hoverTimeoutRef.current);
    };
    const handlePopupMouseLeave = () => {
        setHoveredUser(null);
        setPopupPosition(null);
    };
    const handleSearchResultClick = (user) => {
        setHoveredUser(null);
        setPopupPosition(null);
        setSearchTerm('');
        setSelectedUserForProfileModal(user);
        setIsMemberProfileModalOpen(true);
    };
    const handleStartConversation = (user) => {
        setIsMemberProfileModalOpen(false);
        setSelectedUserForProfileModal(null);
        navigate('/chat', { state: { initialUser: user } });
    };
    const handleAcceptPhotoShare = async (share) => {
        if (!currentUser)
            return;
        setAllNotifications(prev => prev.filter(n => n.id !== `share_req_${share.id}`));
        try {
            await (0, apiService_1.apiUpdatePhotoShareStatus)(share.id, 'accepted', currentUser.id);
            setSelectedSharedPhotoItem(share);
            setIsViewSharedPhotoModalOpen(true);
        }
        catch (err) {
            console.error("Failed to accept photo share:", err);
            setNotificationError("Failed to accept photo share.");
            fetchAndCombineNotifications(); // Revert on error
        }
    };
    const handleDenyPhotoShare = async (shareId) => {
        if (!currentUser)
            return;
        setAllNotifications(prev => prev.filter(n => n.type === 'photo_share_request' && n.shareDetails.id !== shareId));
        try {
            await (0, apiService_1.apiUpdatePhotoShareStatus)(shareId, 'denied', currentUser.id);
            fetchAndCombineNotifications();
        }
        catch (err) {
            console.error("Failed to deny photo share:", err);
            fetchAndCombineNotifications();
        }
    };
    const handleClearAllNotifications = () => {
        setAllNotifications([]);
        setIsNotificationPopoverOpen(false);
    };
    const handleCloseViewSharedPhotoModal = async (shareId, newStatus) => {
        setIsViewSharedPhotoModalOpen(false);
        setSelectedSharedPhotoItem(null);
        fetchAndCombineNotifications();
    };
    const handleCloseSendModal = (0, react_1.useCallback)(() => {
        setIsSendModalOpen(false);
        setPhotoToSend(null);
    }, []);
    const handleConfirmSend = (0, react_1.useCallback)(async (recipientUsername, duration) => {
        if (!currentUser || !photoToSend)
            return;
        const recipientUser = allUsers.find(u => u.username === recipientUsername);
        if (!recipientUser) {
            alert(`User "${recipientUsername}" not found.`);
            return;
        }
        const shareData = {
            photoId: photoToSend.id,
            photoDataUrl: photoToSend.dataUrl,
            photoCaption: photoToSend.caption,
            senderUserId: currentUser.id,
            senderUsername: currentUser.username,
            recipientUserId: recipientUser.id,
            recipientUsername: recipientUser.username,
            durationSeconds: duration,
        };
        try {
            await (0, apiService_1.apiSendPhoto)(shareData);
            alert(`Photo sent to ${recipientUser.username}.`);
            fetchAndCombineNotifications();
        }
        catch (error) {
            console.error("Error sending photo:", error);
            alert(`Failed to send photo: ${error.message}.`);
        }
        handleCloseSendModal();
    }, [currentUser, photoToSend, allUsers, handleCloseSendModal, fetchAndCombineNotifications]);
    const unreadCount = allNotifications.filter(n => !n.isRead).length;
    const isSearching = searchTerm.trim() !== '' || filterOnlineOnly || (filterByCity && cityFilterValue.trim() !== '');
    const renderNotificationItem = (notification) => {
        const commonClasses = "p-3 border-b border-gray-200 dark:border-gray-700 last:border-b-0";
        const actionButtonBase = "px-2 py-1 text-xs font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 dark:focus:ring-offset-gray-800";
        const acceptButtonClass = `${actionButtonBase} text-white bg-green-600 hover:bg-green-700 focus:ring-green-500`;
        const denyButtonClass = `${actionButtonBase} text-white bg-red-600 hover:bg-red-700 focus:ring-red-500 ml-2`;
        const viewMessageButtonClass = `${actionButtonBase} text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500`;
        return (React.createElement("li", { key: notification.id, className: `${commonClasses} ${notification.isRead ? 'opacity-70' : ''}` },
            React.createElement("p", { className: "text-sm text-gray-800 dark:text-gray-200" }, notification.message),
            React.createElement("p", { className: "text-xs text-gray-500 dark:text-gray-400 mt-0.5" }, notification.createdAt ? new Date(notification.createdAt).toLocaleString() : ''),
            notification.type === 'photo_share_request' && (React.createElement("div", { className: "mt-2 flex space-x-2" },
                React.createElement("button", { onClick: () => handleAcceptPhotoShare(notification.shareDetails), className: acceptButtonClass }, "View & Accept"),
                React.createElement("button", { onClick: () => handleDenyPhotoShare(notification.shareDetails.id), className: denyButtonClass }, "Deny"))),
            notification.type === 'new_message' && currentUser && allUsers && (React.createElement("div", { className: "mt-2" },
                React.createElement("button", { onClick: () => {
                        const sender = allUsers.find(u => u.id === notification.messageSummary.SenderUserID);
                        if (sender) {
                            handleStartConversation(sender);
                        }
                        else {
                            console.warn("Sender user for DM request not found in allUsers", notification.messageSummary.SenderUserID);
                            alert("Could not open message: sender details unavailable.");
                        }
                    }, className: viewMessageButtonClass }, "View Message"))),
            notification.type === 'photo_share_update' && (React.createElement("p", { className: "text-sm text-gray-600 dark:text-gray-400 italic" },
                "Status: ",
                notification.shareDetails.status))));
    };
    const socialLinksConfig = [
        { id: 'viber', label: 'Viber', Icon: ViberIcon_1.ViberIcon, color: 'text-purple-600', value: viber, isPublic: isViberPublic, onValueChange: setViber, onIsPublicChange: setIsViberPublic },
        { id: 'whatsApp', label: 'WhatsApp', Icon: WhatsAppIcon_1.WhatsAppIcon, color: 'text-green-500', value: whatsApp, isPublic: isWhatsAppPublic, onValueChange: setWhatsApp, onIsPublicChange: setIsWhatsAppPublic },
        { id: 'instagram', label: 'Instagram', Icon: InstagramIcon_1.InstagramIcon, color: 'text-pink-500', value: instagram, isPublic: isInstagramPublic, onValueChange: setInstagram, onIsPublicChange: setIsInstagramPublic },
        { id: 'facebook', label: 'Facebook', Icon: FacebookIcon_1.FacebookIcon, color: 'text-blue-600', value: facebook, isPublic: isFacebookPublic, onValueChange: setFacebook, onIsPublicChange: setIsFacebookPublic },
        { id: 'teams', label: 'Teams', Icon: TeamsIcon_1.TeamsIcon, color: 'text-indigo-500', value: teams, isPublic: isTeamsPublic, onValueChange: setTeams, onIsPublicChange: setIsTeamsPublic },
        { id: 'mail', label: 'Email', Icon: MailIcon_1.MailIcon, color: 'text-gray-500', value: mail, isPublic: isMailPublic, onValueChange: setMail, onIsPublicChange: setIsMailPublic },
    ];
    const socialLinksForDisplay = currentUser ? [
        { id: 'viber', Icon: ViberIcon_1.ViberIcon, value: currentUser.viber, isPublic: currentUser.isViberPublic, color: 'text-purple-600' },
        { id: 'whatsApp', Icon: WhatsAppIcon_1.WhatsAppIcon, value: currentUser.whatsApp, isPublic: currentUser.isWhatsAppPublic, color: 'text-green-500' },
        { id: 'instagram', Icon: InstagramIcon_1.InstagramIcon, value: currentUser.instagram, isPublic: currentUser.isInstagramPublic, color: 'text-pink-500' },
        { id: 'facebook', Icon: FacebookIcon_1.FacebookIcon, value: currentUser.facebook, isPublic: currentUser.isFacebookPublic, color: 'text-blue-600' },
        { id: 'teams', Icon: TeamsIcon_1.TeamsIcon, value: currentUser.teams, isPublic: currentUser.isTeamsPublic, color: 'text-indigo-500' },
        { id: 'mail', Icon: MailIcon_1.MailIcon, value: currentUser.mail, isPublic: currentUser.isMailPublic, color: 'text-gray-500' },
    ].filter(link => {
        if (!link.value)
            return false;
        if (link.id === 'mail')
            return true;
        return !!link.isPublic;
    }) : [];
    return (React.createElement("div", { className: "container mx-auto p-4 sm:p-6 lg:p-8" },
        React.createElement("div", { className: "grid grid-cols-1 xl:grid-cols-3 gap-8" },
            React.createElement("div", { className: "xl:col-span-2 space-y-8" },
                React.createElement("div", { className: "bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6" },
                    React.createElement("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-8" },
                        React.createElement("div", { className: "space-y-6" },
                            React.createElement("div", { className: "flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-6" },
                                React.createElement("div", { className: "relative flex-shrink-0 group" }, isProfilePicUpdating ? React.createElement("div", { className: "w-24 h-24 rounded-full bg-gray-200 animate-pulse" }) :
                                    (currentUser === null || currentUser === void 0 ? void 0 : currentUser.profilePictureUrl) ? React.createElement("img", { src: currentUser.profilePictureUrl, alt: "Profile", className: "w-24 h-24 rounded-full object-cover" }) : React.createElement(UserCircleIcon_1.UserCircleIcon, { className: "w-24 h-24 text-gray-400" }),
                                    React.createElement("button", { onClick: () => { var _a; return (_a = profilePictureInputRef.current) === null || _a === void 0 ? void 0 : _a.click(); }, className: "absolute bottom-0 right-0 bg-gray-700 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" },
                                        React.createElement(CameraIcon_1.CameraIcon, { className: "w-4 h-4" })),
                                    React.createElement("input", { type: "file", ref: profilePictureInputRef, onChange: handleProfilePictureChange, accept: "image/*", className: "hidden" })),
                                React.createElement("div", { className: "flex-grow" },
                                    React.createElement("h1", { className: "text-3xl font-bold text-accent-700 dark:text-accent-600 flex items-center justify-center sm:justify-start" },
                                        currentUser === null || currentUser === void 0 ? void 0 : currentUser.username,
                                        React.createElement("span", { className: `ml-2 w-3 h-3 rounded-full ${(currentUser === null || currentUser === void 0 ? void 0 : currentUser.isOnline) ? 'bg-green-500' : 'bg-gray-400'}`, title: (currentUser === null || currentUser === void 0 ? void 0 : currentUser.isOnline) ? 'Online' : 'Offline' })),
                                    React.createElement("div", { className: "mt-3 text-sm text-gray-600 dark:text-gray-400 space-y-1" },
                                        React.createElement("p", null,
                                            "Email: ",
                                            React.createElement("strong", { className: "font-semibold text-gray-800 dark:text-gray-200" }, currentUser === null || currentUser === void 0 ? void 0 : currentUser.email)),
                                        (currentUser === null || currentUser === void 0 ? void 0 : currentUser.country) && React.createElement("p", null,
                                            "Country: ",
                                            React.createElement("strong", { className: "font-semibold text-gray-800 dark:text-gray-200" }, currentUser.country)),
                                        (currentUser === null || currentUser === void 0 ? void 0 : currentUser.city) && React.createElement("p", null,
                                            "City: ",
                                            React.createElement("strong", { className: "font-semibold text-gray-800 dark:text-gray-200" }, currentUser.city)),
                                        React.createElement("p", null,
                                            "Membership: ",
                                            React.createElement("strong", { className: "font-semibold text-green-600 dark:text-green-400" }, getMembershipDisplay(currentUser)))),
                                    React.createElement("button", { onClick: handleToggleOnlineStatus, disabled: isBioUpdating, className: `mt-2 px-3 py-1.5 text-xs font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600` }, (currentUser === null || currentUser === void 0 ? void 0 : currentUser.isOnline) ? 'Go Offline' : 'Go Online'),
                                    !(currentUser === null || currentUser === void 0 ? void 0 : currentUser.isEmailVerified) && (React.createElement("button", { onClick: () => setIsVerificationModalOpen(true), className: `mt-2 ml-2 px-3 py-1.5 text-xs font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600` }, "Verify Email")))),
                            React.createElement("div", { className: "pt-6 border-t border-gray-200 dark:border-gray-700" },
                                React.createElement("h3", { className: "font-bold text-lg text-gray-700 dark:text-gray-200 mb-2" }, "Welcome Message"),
                                isEditingBio ? (React.createElement("div", { className: "animate-fade-in-down" },
                                    React.createElement("textarea", { value: editableBioText, onChange: handleBioTextChange, className: "w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 focus:ring-accent-500 focus:border-accent-500", rows: 4, placeholder: "Tell us about yourself...", "aria-label": "Edit your welcome message", disabled: isBioUpdating }),
                                    React.createElement("div", { className: "mt-2 flex justify-end space-x-2" },
                                        React.createElement("button", { onClick: handleCancelEditBio, disabled: isBioUpdating, className: "px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md shadow-sm" }, "Cancel"),
                                        React.createElement("button", { onClick: handleSaveBio, disabled: isBioUpdating, className: "px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-md shadow-sm" }, isBioUpdating ? "Saving..." : "Save Message")))) : (React.createElement("div", { className: "p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 min-h-[100px]" },
                                    React.createElement("p", { className: "text-gray-700 dark:text-gray-300 whitespace-pre-wrap" }, (currentUser === null || currentUser === void 0 ? void 0 : currentUser.bio) || "No welcome message set."))))),
                        React.createElement("div", { className: "space-y-4 pt-0 md:pt-6 md:border-l md:pl-6 border-gray-200 dark:border-gray-700" },
                            React.createElement("div", { className: "flex justify-between items-center" },
                                React.createElement("h3", { className: "font-bold text-lg text-gray-700 dark:text-gray-200" }, "Social Links"),
                                !isEditingSocials && React.createElement("button", { onClick: () => setIsEditingSocials(true), className: "inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500" },
                                    React.createElement(PencilIcon_1.PencilIcon, { className: "w-3 h-3 mr-1" }),
                                    " Edit")),
                            socialsError && !isEditingSocials && React.createElement("p", { className: "text-red-500 dark:text-red-400 text-sm text-center" }, socialsError),
                            isEditingSocials ? (React.createElement("div", { className: "space-y-4 animate-fade-in-down" },
                                socialsError && React.createElement("p", { className: "text-red-500 dark:text-red-400 text-sm text-center" }, socialsError),
                                socialLinksConfig.map(link => React.createElement(SocialInput, { key: link.id, ...link, isSaving: isSocialsSaving })),
                                React.createElement("div", { className: "flex justify-end space-x-2 pt-2" },
                                    React.createElement("button", { onClick: handleCancelEditSocials, disabled: isSocialsSaving, className: "px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md shadow-sm" }, "Cancel"),
                                    React.createElement("button", { onClick: handleSaveSocials, disabled: isSocialsSaving, className: "px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-md shadow-sm" }, isSocialsSaving ? "Saving..." : "Save Socials")))) : (React.createElement("div", { className: "space-y-1" }, socialLinksForDisplay.length > 0 ? (socialLinksForDisplay.map(link => (React.createElement(SocialLinkDisplay, { key: link.id, Icon: link.Icon, value: link.value, isPublic: !!link.isPublic, color: link.color })))) : (React.createElement("p", { className: "text-sm text-gray-500 dark:text-gray-400 italic px-2" }, "No public social links available.")))))),
                    React.createElement("div", { className: "mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-start gap-3" },
                        React.createElement("button", { onClick: handleEditBioClick, className: "inline-flex items-center whitespace-nowrap px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800" },
                            React.createElement(PencilIcon_1.PencilIcon, { className: "w-4 h-4 mr-1.5" }),
                            " Edit Welcome Message"),
                        React.createElement("button", { onClick: handleOpenEditDetailsModal, className: "inline-flex items-center whitespace-nowrap px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800" },
                            React.createElement(PencilIcon_1.PencilIcon, { className: "w-4 h-4 mr-1.5" }),
                            " Edit Profile Details"),
                        React.createElement("button", { onClick: () => navigate("/chat"), className: "inline-flex items-center whitespace-nowrap px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 dark:focus:ring-offset-gray-800" },
                            React.createElement(ChatBubbleLeftRightIcon_1.ChatBubbleLeftRightIcon, { className: "w-4 h-4 mr-1.5" }),
                            " Chat"),
                    React.createElement("button", { onClick: handleOpenDonationModal, className: "inline-flex items-center whitespace-nowrap gap-1.5 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 dark:focus:ring-offset-gray-800" },
                        React.createElement(HeartIcon_1.HeartIcon, { className: "w-4 h-4" }),
                            " Donate"),
                        React.createElement("div", { className: "relative" },
                            React.createElement("button", { ref: notificationButtonRef, onClick: () => setIsNotificationPopoverOpen(p => !p), className: "relative inline-flex items-center p-2.5 border border-transparent rounded-full shadow-sm text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600" },
                                React.createElement(BellIcon_1.BellIcon, { className: "w-5 h-5" }),
                                unreadCount > 0 && React.createElement("span", { className: "absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-white dark:ring-gray-800" }, unreadCount > 9 ? "9+" : unreadCount)),
                            React.createElement(NotificationPopover_1.default, { isOpen: isNotificationPopoverOpen, notifications: allNotifications, isLoading: isLoadingNotifications, error: notificationError, onRefresh: fetchAndCombineNotifications, onClearAll: handleClearAllNotifications, renderItem: renderNotificationItem, popoverRef: notificationPopoverRef })))),
                React.createElement("div", { className: "bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6" },
                    React.createElement("div", { className: "flex justify-between items-center mb-6" },
                        React.createElement("h2", { className: "text-2xl font-bold text-gray-800 dark:text-gray-200" }, "My Photos"),
                        React.createElement("button", { onClick: handleUploadButtonClick, disabled: isUploading, className: "inline-flex items-center text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600 font-bold px-4 py-2 rounded-lg shadow-md transition duration-300 text-sm disabled:opacity-50" },
                            React.createElement(UploadIcon_1.UploadIcon, { className: "w-4 h-4 mr-2 inline" }),
                            isUploading ? "Uploading..." : "Upload New Photo")),
                    React.createElement("input", { type: "file", ref: uploadInputRef, onChange: handleFileSelected, className: "hidden", accept: "image/*", disabled: isUploading }),
                    isPhotosLoading ? React.createElement("p", null, "Loading photos...") : React.createElement(PhotoGrid_1.default, { photos: photos, onViewPhoto: handleViewPhoto, onDeletePhoto: handleDelete, onSendPhoto: handleSend, onTogglePhotoPublicStatus: handleTogglePublic }))),
            React.createElement("div", { className: "xl:col-span-1 space-y-6" },
                React.createElement("div", { ref: searchContainerRef, className: "bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700 sticky top-6 z-20" },
                    React.createElement("h3", { className: "font-bold text-lg text-gray-700 dark:text-gray-200 mb-4" }, "Find Members"),
                    React.createElement("div", { className: "relative mb-2" },
                        React.createElement("div", { className: "absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" },
                            React.createElement(SearchIcon_1.SearchIcon, { className: "h-5 w-5 text-gray-400 dark:text-gray-500" })),
                        React.createElement("input", { type: "search", value: searchTerm, onChange: (e) => setSearchTerm(e.target.value), placeholder: "Search members...", className: "block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 dark:focus:placeholder-gray-500 focus:ring-1 focus:ring-accent-500 focus:border-accent-500 sm:text-sm" })),
                    React.createElement("div", { className: "mt-3 space-y-2 sm:space-y-0 sm:flex sm:space-x-4 sm:flex-wrap" },
                        React.createElement("div", { className: "flex items-center basis-1/2 sm:basis-auto" },
                            React.createElement("input", { id: "filter-online", type: "checkbox", checked: filterOnlineOnly, onChange: (e) => setFilterOnlineOnly(e.target.checked), className: "h-4 w-4 text-accent-600 border-gray-300 dark:border-gray-600 rounded focus:ring-accent-500" }),
                            React.createElement("label", { htmlFor: "filter-online", className: "ml-2 text-sm text-gray-700 dark:text-gray-300" }, "Online Only")),
                        React.createElement("div", { className: "flex items-center basis-1/2 sm:basis-auto" },
                            React.createElement("input", { id: "filter-city-toggle", type: "checkbox", checked: filterByCity, onChange: (e) => setFilterByCity(e.target.checked), className: "h-4 w-4 text-accent-600 border-gray-300 dark:border-gray-600 rounded focus:ring-accent-500" }),
                            React.createElement("label", { htmlFor: "filter-city-toggle", className: "ml-2 text-sm text-gray-700 dark:text-gray-300" }, "Filter by City")),
                        filterByCity && React.createElement("input", { type: "text", value: cityFilterValue, onChange: (e) => setCityFilterValue(e.target.value), placeholder: "Enter city", className: "mt-2 sm:mt-0 block w-full sm:w-auto px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-accent-500 focus:border-accent-500" })),
                    React.createElement("div", { className: "mt-2" },
                        isSearching && searchResults.length > 0 && (React.createElement("div", { className: "grid grid-cols-3 gap-2 px-2 pb-2 border-b dark:border-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400" },
                            React.createElement("div", { className: "truncate font-bold" }, "Username"),
                            React.createElement("div", { className: "truncate font-bold" }, "City"),
                            React.createElement("div", { className: "text-right truncate font-bold" }, "Last Active"))),
                        React.createElement("div", { className: "h-56 overflow-y-auto custom-scrollbar" }, isSearching && searchResults.length > 0 ? (React.createElement("ul", { className: "divide-y dark:divide-gray-700" }, searchResults.map(user => (React.createElement("li", { key: user.id, className: "py-2 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer grid grid-cols-3 gap-2 items-center text-sm", onMouseEnter: (e) => handleMouseEnterUser(user, e), onMouseLeave: handleMouseLeaveUser, onClick: () => handleSearchResultClick(user) },
                            React.createElement("span", { className: "flex items-center truncate text-gray-800 dark:text-gray-100" },
                                user.username,
                                user.isOnline && React.createElement("span", { className: "ml-2 w-2 h-2 bg-green-500 rounded-full", title: "Online" })),
                            React.createElement("span", { className: "truncate text-gray-600 dark:text-gray-400" }, user.city || 'N/A'),
                            React.createElement("span", { className: "truncate text-gray-500 dark:text-gray-400 text-right" }, user.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : "N/A")))))) : isSearching ? (React.createElement("div", { className: "flex items-center justify-center h-full" },
                            React.createElement("p", { className: "text-sm text-gray-500 p-4 text-center" }, "No users found."))) : (React.createElement("div", { className: "flex items-center justify-center h-full" },
                            React.createElement("p", { className: "text-sm text-gray-500 p-4 text-center" }, "Start a search to find members.")))))),
                React.createElement("div", { className: "bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sticky top-80" },
                    React.createElement("h3", { className: "font-bold text-lg mb-2" }, "New Members (Last 24h)"),
                    React.createElement("div", { className: "h-64 overflow-y-auto custom-scrollbar" }, newMembers.length > 0 ? (React.createElement(React.Fragment, null,
                        React.createElement("div", { className: "grid grid-cols-3 gap-2 px-2 pb-2 border-b dark:border-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400" },
                            React.createElement("div", { className: "truncate font-bold" }, "Username"),
                            React.createElement("div", { className: "truncate font-bold" }, "City"),
                            React.createElement("div", { className: "text-right truncate font-bold" }, "Last Active")),
                        React.createElement("ul", { className: "divide-y dark:divide-gray-700 mt-1" }, newMembers.map(user => (React.createElement("li", { key: user.id, className: "py-2 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer grid grid-cols-3 gap-2 items-center text-sm", onMouseEnter: (e) => handleMouseEnterUser(user, e), onMouseLeave: handleMouseLeaveUser, onClick: () => handleSearchResultClick(user) },
                            React.createElement("span", { className: "flex items-center truncate text-gray-800 dark:text-gray-100" },
                                user.username,
                                user.isOnline && React.createElement("span", { className: "ml-2 w-2 h-2 bg-green-500 rounded-full", title: "Online" })),
                            React.createElement("span", { className: "truncate text-gray-600 dark:text-gray-400" }, user.city || 'N/A'),
                            React.createElement("span", { className: "truncate text-gray-500 dark:text-gray-400 text-right" }, formatLastActive(user)))))))) : (React.createElement("p", { className: "text-sm text-gray-500 p-4 text-center" }, "No new members in the last 24 hours."))))))),
        popupPosition && hoveredUser && (React.createElement("div", { ref: popupRef },
            React.createElement(MemberDetailsPopup_1.default, { user: hoveredUser, position: popupPosition, onMouseEnter: handlePopupMouseEnter, onMouseLeave: handlePopupMouseLeave }))),
        selectedPhotoForModal && (React.createElement(ViewMyPhotoModal_1.default, { isOpen: isViewPhotoModalOpen, onClose: handleCloseViewPhotoModal, photo: selectedPhotoForModal, onTogglePublic: handleTogglePublic, onDelete: handleDelete, onSend: handleSend, onReplace: handleReplace, onDeleteComment: handleDeleteComment, onDetailsReload: fetchUserPhotos })),
        isSendModalOpen && photoToSend && (React.createElement(Modal_1.default, { isOpen: isSendModalOpen, onClose: handleCloseSendModal, title: `Send "${photoToSend.caption || "Untitled Photo"}"` },
            React.createElement(SendPhotoForm_1.default, { photo: photoToSend, onConfirmSend: handleConfirmSend, onCancel: handleCloseSendModal, availableUsers: allUsers }))),
        currentUser && (React.createElement(EditUserDetailsModal_1.default, { isOpen: isEditDetailsModalOpen, onClose: () => setIsEditDetailsModalOpen(false), currentUser: currentUser, onSave: handleSaveUserDetails, onChangePasswordClick: handleOpenChangePasswordModal })),
        currentUser && (React.createElement(ChangePasswordModal_1.default, { isOpen: isChangePasswordModalOpen, onClose: () => setIsChangePasswordModalOpen(false), onSavePassword: handleSavePassword })),
        selectedUserForProfileModal && (React.createElement(MemberProfileModal_1.default, { isOpen: isMemberProfileModalOpen, onClose: () => { setIsMemberProfileModalOpen(false); setSelectedUserForProfileModal(null); }, user: selectedUserForProfileModal, onStartConversation: handleStartConversation })),
        isViewSharedPhotoModalOpen && selectedSharedPhotoItem && (React.createElement(ViewSharedPhotoModal_1.default, { isOpen: isViewSharedPhotoModalOpen, onClose: (updatedStatus) => handleCloseViewSharedPhotoModal(selectedSharedPhotoItem.id, updatedStatus), sharedPhotoItem: selectedSharedPhotoItem })),
        currentUser && (React.createElement(EmailVerificationModal_1.default, { isOpen: isVerificationModalOpen, onClose: () => setIsVerificationModalOpen(false), currentUser: currentUser })),
        React.createElement(Modal_1.default, { isOpen: isDonationModalOpen, onClose: handleCloseDonationModal, title: donationState === 'form' ? "Support SwingerUnion.com" : "Thank You!" }, donationState === 'form' ? (React.createElement("div", { className: "text-center space-y-6 p-4" },
            React.createElement("img", { src: "/assets/img/SULogo.jpg", alt: "SwingerUnion Logo", className: "h-24 w-24 mx-auto rounded-full object-cover shadow-lg" }),
            React.createElement("p", { className: "text-lg text-gray-700 dark:text-gray-200" }, "Your support helps us keep the community running and ad-free."),
            React.createElement("p", { className: "text-sm text-gray-500 dark:text-gray-400 mb-4" }, "Thank you for your generosity!"),
            React.createElement("div", { className: "flex justify-center" },
                React.createElement("form", { action: "https://www.paypal.com/donate", method: "post", target: "_blank", onSubmit: handlePaypalSubmit },
                    React.createElement("input", { type: "hidden", name: "hosted_button_id", value: "HXEXRTZSZ2U94" }),
                    React.createElement("input", { type: "image", src: "https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif", name: "submit", title: "PayPal - The safer, easier way to pay online!", alt: "Donate with PayPal button" }),
                    React.createElement("img", { alt: "", src: "https://www.paypal.com/en_GR/i/scr/pixel.gif", width: "1", height: "1" }))))) : (React.createElement("div", { className: "text-center space-y-6 p-8" },
            React.createElement("h2", { className: "text-3xl font-bold text-accent-600" }, "Thank You!"),
            React.createElement("p", { className: "text-lg text-gray-700 dark:text-gray-200" }, "Your generosity is what keeps our community thriving. We appreciate your support!"),
            React.createElement("button", { onClick: handleCloseDonationModal, className: "mt-4 px-6 py-2 bg-accent-600 text-white rounded-md" }, "Close"))))));
};
exports.ProfilePage = ProfilePage;
