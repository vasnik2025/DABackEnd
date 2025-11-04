
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
const react_1 = __importStar(require("react"));
const Modal_1 = __importDefault(require("./Modal"));
const apiService_1 = require("../services/apiService");
const CameraIcon_1 = require("./icons/CameraIcon");
const SharedPhotosInboxModal = ({ isOpen, onClose, currentUser, onViewSharedPhoto, onRefreshNotifications, }) => {
    const [activeTab, setActiveTab] = (0, react_1.useState)('received');
    const [receivedShares, setReceivedShares] = (0, react_1.useState)([]);
    const [sentShares, setSentShares] = (0, react_1.useState)([]);
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)(null);
    const fetchData = (0, react_1.useCallback)(async () => {
        if (!currentUser)
            return;
        setIsLoading(true);
        setError(null);
        try {
            const [received, sent] = await Promise.all([
                (0, apiService_1.apiGetReceivedShares)(currentUser.id),
                (0, apiService_1.apiGetSentShares)(currentUser.id),
            ]);
            setReceivedShares(received);
            setSentShares(sent);
        }
        catch (err) {
            setError(err.message || 'Failed to load shared photos.');
        }
        finally {
            setIsLoading(false);
        }
    }, [currentUser]);
    (0, react_1.useEffect)(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen, fetchData]);
    const handleUpdateStatus = async (item, status) => {
        try {
            const updatedItem = await (0, apiService_1.apiUpdatePhotoShareStatus)(item.id, status, currentUser.id);
            if (status === 'accepted' && updatedItem) {
                onViewSharedPhoto(updatedItem);
            }
            await fetchData(); // Refresh data to show changes
            onRefreshNotifications(); // Refresh main page notifications
        }
        catch (error) {
            setError(error.message || `Failed to ${status} share.`);
        }
    };
    const renderItem = (item, type) => {
        const isPendingReceived = type === 'received' && item.status === 'pending';
        const isViewable = type === 'received' && (item.status === 'accepted' || item.status === 'viewed');
        return (react_1.default.createElement("li", { key: item.id, className: "flex items-center justify-between p-3 bg-rose-100/50 dark:bg-gray-700/50 rounded-lg shadow-sm" },
            react_1.default.createElement("div", { className: "flex items-center space-x-4 overflow-hidden" },
                item.photoDataUrl ? (react_1.default.createElement("img", { src: item.photoDataUrl, alt: "Shared thumbnail", className: "w-14 h-14 object-cover rounded-md flex-shrink-0" })) : (react_1.default.createElement("div", { className: "w-14 h-14 bg-gray-200 dark:bg-gray-600 rounded-md flex items-center justify-center flex-shrink-0" },
                    react_1.default.createElement(CameraIcon_1.CameraIcon, { className: "h-6 w-6 text-gray-400" }))),
                react_1.default.createElement("div", { className: "overflow-hidden" },
                    react_1.default.createElement("p", { className: "font-semibold text-gray-800 dark:text-gray-200 truncate" }, type === 'received' ? `From @${item.senderUsername}` : `To @${item.recipientUsername}`),
                    react_1.default.createElement("p", { className: "text-sm text-gray-500 dark:text-gray-400" },
                        "Status: ",
                        item.status))),
            react_1.default.createElement("div", { className: "flex items-center space-x-2 flex-shrink-0" },
                isPendingReceived && (react_1.default.createElement(react_1.default.Fragment, null,
                    react_1.default.createElement("button", { onClick: () => handleUpdateStatus(item, 'accepted'), className: "px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm" }, "Accept"),
                    react_1.default.createElement("button", { onClick: () => handleUpdateStatus(item, 'denied'), className: "px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md shadow-sm" }, "Deny"))),
                isViewable && (react_1.default.createElement("button", { onClick: () => onViewSharedPhoto(item), className: "px-4 py-1.5 text-sm font-medium text-white bg-rose-500 hover:bg-rose-600 rounded-md shadow-sm" }, "View")))));
    };
    const currentList = activeTab === 'received' ? receivedShares : sentShares;
    return (react_1.default.createElement(Modal_1.default, { isOpen: isOpen, onClose: onClose, title: "Shared Photos Inbox" },
        react_1.default.createElement("div", { className: "flex flex-col space-y-4 max-h-[80vh]" },
            react_1.default.createElement("div", { className: "flex-shrink-0" },
                react_1.default.createElement("p", { className: "text-sm text-gray-600 dark:text-gray-400 mb-4" }, "Photos others sent to you, and photos you sent to others."),
                react_1.default.createElement("div", { className: "flex items-center justify-center space-x-1 p-1 bg-gray-200 dark:bg-gray-800 rounded-lg" },
                    react_1.default.createElement("button", { onClick: () => setActiveTab('received'), className: `px-4 py-1.5 text-sm font-semibold rounded-md transition-colors w-1/2 ${activeTab === 'received' ? 'bg-white dark:bg-gray-700 text-rose-600 dark:text-rose-300 shadow' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300/50 dark:hover:bg-gray-700/50'}` }, "Received"),
                    react_1.default.createElement("button", { onClick: () => setActiveTab('sent'), className: `px-4 py-1.5 text-sm font-semibold rounded-md transition-colors w-1/2 ${activeTab === 'sent' ? 'bg-white dark:bg-gray-700 text-rose-600 dark:text-rose-300 shadow' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300/50 dark:hover:bg-gray-700/50'}` }, "Sent"))),
            error && react_1.default.createElement("p", { className: "text-center text-red-500 dark:text-red-400" }, error),
            react_1.default.createElement("div", { className: "flex-grow overflow-y-auto pr-2 custom-scrollbar" },
                isLoading && react_1.default.createElement("p", { className: "text-center text-gray-500 dark:text-gray-400" }, "Loading..."),
                !isLoading && !error && (react_1.default.createElement("ul", { className: "space-y-3" }, currentList.length > 0 ? (currentList.map(item => renderItem(item, activeTab))) : (react_1.default.createElement("p", { className: "text-center text-gray-500 dark:text-gray-400 py-8" },
                    "No ",
                    activeTab,
                    " photos."))))))));
};
exports.default = SharedPhotosInboxModal;
