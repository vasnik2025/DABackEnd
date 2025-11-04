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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const Modal_1 = __importDefault(require("./Modal"));
const PhotoGrid_1 = __importDefault(require("./PhotoGrid"));
const apiService_1 = require("../services/apiService");
const UserCircleIcon_1 = require("./icons/UserCircleIcon");
const ChatBubbleLeftRightIcon_1 = require("./icons/ChatBubbleLeftRightIcon");
const ViewPublicPhotoModal_1 = __importDefault(require("./ViewPublicPhotoModal"));
const useAuth_1 = require("../hooks/useAuth");
const ViberIcon_1 = require("./icons/ViberIcon");
const WhatsAppIcon_1 = require("./icons/WhatsAppIcon");
const InstagramIcon_1 = require("./icons/InstagramIcon");
const FacebookIcon_1 = require("./icons/FacebookIcon");
const TeamsIcon_1 = require("./icons/TeamsIcon");
const MailIcon_1 = require("./icons/MailIcon");
const DetailCard = ({ label, value }) => {
    if (!value && value !== 0)
        return null;
    return (react_1.default.createElement("div", { className: "bg-rose-50 dark:bg-gray-700/50 p-4 rounded-xl text-center shadow-inner" },
        react_1.default.createElement("p", { className: "text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider" }, label),
        react_1.default.createElement("p", { className: "text-lg font-bold text-gray-800 dark:text-gray-100 mt-1 truncate" }, value)));
};
const getMembershipStatus = (user) => {
    const getTrialDaysRemaining = (expiryDateString) => {
        if (!expiryDateString)
            return null;
        const expiryDate = new Date(expiryDateString);
        const today = new Date();
        const diffTime = expiryDate.getTime() - today.getTime();
        if (diffTime < 0)
            return 0;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };
    if (user.membershipType === 'unlimited' || user.membershipType === 'platinum') {
        return 'Premium';
    }
    if (user.membershipType === 'trial') {
        const days = getTrialDaysRemaining(user.membershipExpiryDate);
        if (days !== null && days > 0) {
            return 'Trial';
        }
    }
    return 'Free';
};
const MemberProfileModal = ({ isOpen, onClose, user, onStartConversation, }) => {
    const { currentUser } = (0, useAuth_1.useAuth)();
    const [photos, setPhotos] = (0, react_1.useState)([]);
    const [isLoadingPhotos, setIsLoadingPhotos] = (0, react_1.useState)(false);
    const [photoError, setPhotoError] = (0, react_1.useState)(null);
    const [selectedPhotoForModal, setSelectedPhotoForModal] = (0, react_1.useState)(null);
    const [isViewPublicPhotoModalOpen, setIsViewPublicPhotoModalOpen] = (0, react_1.useState)(false);
    const fetchUserPublicPhotos = (0, react_1.useCallback)(async () => {
        if (!user)
            return;
        setIsLoadingPhotos(true);
        setPhotoError(null);
        try {
            const userPhotos = await (0, apiService_1.apiGetUserPhotos)(user.id);
            setPhotos(userPhotos.filter(p => p.isPublic === true));
        }
        catch (error) {
            console.error("Failed to fetch user's public photos:", error);
            setPhotoError(error.message || "Could not load photos.");
        }
        finally {
            setIsLoadingPhotos(false);
        }
    }, [user]);
    (0, react_1.useEffect)(() => {
        if (isOpen && user) {
            fetchUserPublicPhotos();
        }
        else {
            setPhotos([]);
        }
    }, [isOpen, user, fetchUserPublicPhotos]);
    const handleViewPhoto = (0, react_1.useCallback)((photo) => {
        setSelectedPhotoForModal(photo);
        setIsViewPublicPhotoModalOpen(true);
    }, []);
    const handleCloseViewPublicPhotoModal = (0, react_1.useCallback)(() => {
        setIsViewPublicPhotoModalOpen(false);
        setSelectedPhotoForModal(null);
    }, []);
    const socialLinks = [
        { key: 'viber', handle: user.viber, isPublic: user.isViberPublic, Icon: ViberIcon_1.ViberIcon, color: 'text-purple-600' },
        { key: 'whatsApp', handle: user.whatsApp, isPublic: user.isWhatsAppPublic, Icon: WhatsAppIcon_1.WhatsAppIcon, color: 'text-green-500' },
        { key: 'instagram', handle: user.instagram, isPublic: user.isInstagramPublic, Icon: InstagramIcon_1.InstagramIcon, color: 'text-pink-600' },
        { key: 'facebook', handle: user.facebook, isPublic: user.isFacebookPublic, Icon: FacebookIcon_1.FacebookIcon, color: 'text-blue-600' },
        { key: 'teams', handle: user.teams, isPublic: user.isTeamsPublic, Icon: TeamsIcon_1.TeamsIcon, color: 'text-indigo-500' },
        { key: 'mail', handle: user.mail, isPublic: user.isMailPublic, Icon: MailIcon_1.MailIcon, color: 'text-gray-500' }
    ].filter(link => link.handle && link.isPublic);
    const formatAge = () => {
        if (user.partner1Age && user.partner2Age) {
            return `${user.partner1Age} & ${user.partner2Age}`;
        }
        if (user.age) {
            return user.age;
        }
        return null;
    };
    const formatLocation = () => {
        if (user.city && user.country) {
            return `${user.city}, ${user.country}`;
        }
        return user.city || user.country || null;
    };
    return (react_1.default.createElement(react_1.default.Fragment, null,
        react_1.default.createElement(Modal_1.default, { isOpen: isOpen, onClose: onClose, title: `${user.username}'s Profile` },
            react_1.default.createElement("div", { className: "space-y-6" },
                react_1.default.createElement("div", { className: "flex flex-col sm:flex-row items-center p-4 bg-rose-50 dark:bg-gray-700/50 rounded-lg" },
                    user.profilePictureUrl ? (react_1.default.createElement("img", { src: user.profilePictureUrl, alt: user.username, className: "w-24 h-24 rounded-full object-cover mr-0 sm:mr-6 mb-4 sm:mb-0 border-2 border-rose-300 dark:border-rose-600" })) : (react_1.default.createElement(UserCircleIcon_1.UserCircleIcon, { className: "w-24 h-24 text-gray-400 dark:text-gray-500 mr-0 sm:mr-6 mb-4 sm:mb-0" })),
                    react_1.default.createElement("div", { className: "text-center sm:text-left" },
                        react_1.default.createElement("h3", { className: "text-2xl font-bold text-rose-700 dark:text-rose-500 flex items-center justify-center sm:justify-start" },
                            user.username,
                            user.isOnline && react_1.default.createElement("span", { className: "ml-2 w-3 h-3 bg-green-500 rounded-full", title: "Online" })),
                        react_1.default.createElement("p", { className: "text-sm text-gray-600 dark:text-gray-300" }, user.email),
                        user.welcomeMessage && react_1.default.createElement("p", { className: "mt-2 text-sm text-gray-700 dark:text-gray-300 max-h-20 overflow-y-auto custom-scrollbar" }, user.welcomeMessage))),
                react_1.default.createElement("div", { className: "grid grid-cols-2 md:grid-cols-3 gap-4 px-2" },
                    react_1.default.createElement(DetailCard, { label: "Age", value: formatAge() }),
                    react_1.default.createElement(DetailCard, { label: "Gender", value: user.gender }),
                    react_1.default.createElement(DetailCard, { label: "Location", value: formatLocation() }),
                    react_1.default.createElement(DetailCard, { label: "Relationship", value: user.relationshipStatus }),
                    react_1.default.createElement(DetailCard, { label: "Years Together", value: user.yearsTogether === 0 ? '< 1' : user.yearsTogether }),
                    react_1.default.createElement(DetailCard, { label: "Membership", value: getMembershipStatus(user) })),
                socialLinks.length > 0 && (react_1.default.createElement("div", null,
                    react_1.default.createElement("h4", { className: "text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3" }, "Contact Info"),
                    react_1.default.createElement("div", { className: "bg-gray-50 dark:bg-gray-700 p-3 rounded-lg" },
                        react_1.default.createElement("ul", { className: "space-y-2" }, socialLinks.map(({ key, handle, Icon, color }) => (react_1.default.createElement("li", { key: key, className: "flex items-center" },
                            react_1.default.createElement(Icon, { className: `w-5 h-5 mr-3 flex-shrink-0 ${color}` }),
                            react_1.default.createElement("span", { className: "text-gray-700 dark:text-gray-200 truncate" }, handle)))))))),
                react_1.default.createElement("div", null,
                    react_1.default.createElement("h4", { className: "text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3" }, "Public Photos"),
                    isLoadingPhotos ? (react_1.default.createElement("p", { className: "text-center text-gray-500 dark:text-gray-400" }, "Loading photos...")) : photoError ? (react_1.default.createElement("p", { className: "text-center text-red-500 dark:text-red-400" }, photoError)) : photos.length > 0 ? (react_1.default.createElement("div", { className: "max-h-80 overflow-y-auto custom-scrollbar border border-gray-200 dark:border-gray-700 rounded-md p-2" },
                        react_1.default.createElement(PhotoGrid_1.default, { photos: photos, onViewPhoto: handleViewPhoto, showActions: false }))) : (react_1.default.createElement("p", { className: "text-center text-gray-500 dark:text-gray-400 py-4" }, "This member has no public photos."))),
                react_1.default.createElement("div", { className: "flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700" },
                    react_1.default.createElement("button", { onClick: () => onStartConversation(user), className: "flex items-center justify-center px-4 py-2 text-sm font-medium text-rose-600 bg-rose-100 hover:bg-rose-200 dark:text-rose-300 dark:bg-rose-800/50 dark:hover:bg-rose-700/50 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 dark:focus:ring-offset-gray-800" },
                        react_1.default.createElement(ChatBubbleLeftRightIcon_1.ChatBubbleLeftRightIcon, { className: "w-4 h-4 mr-2" }),
                        "Message"),
                    react_1.default.createElement("button", { onClick: onClose, className: "px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-gray-800" }, "Close")))),
        selectedPhotoForModal && currentUser && (react_1.default.createElement(ViewPublicPhotoModal_1.default, { isOpen: isViewPublicPhotoModalOpen, onClose: handleCloseViewPublicPhotoModal, photo: selectedPhotoForModal, currentUser: currentUser }))));
};
exports.default = MemberProfileModal;
