"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const GlobeAltIcon_1 = require("./icons/GlobeAltIcon"); // Import Globe icon
const LockClosedIcon_1 = require("./icons/LockClosedIcon"); // Import Lock icon
const PhotoGridItem = ({ photo, onDelete, onView, onSend, onTogglePublic, showActions = true }) => {
    const isPublic = photo.isPublic === true;
    const handleItemClick = () => {
        if (onView) {
            onView();
        }
    };
    return (react_1.default.createElement("div", { className: "group relative aspect-square bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden shadow-lg transform transition-all duration-300 hover:scale-105 cursor-pointer", onClick: handleItemClick, role: "button", tabIndex: 0, onKeyDown: (e) => {
            if (e.key === 'Enter' || e.key === ' ')
                handleItemClick();
        }, "aria-label": `View photo: ${photo.caption || 'User uploaded photo'}` },
        react_1.default.createElement("img", { src: photo.dataUrl, alt: photo.caption || 'User uploaded photo', className: "w-full h-full object-cover" }),
        react_1.default.createElement("div", { className: "absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-opacity duration-300 flex flex-col justify-between p-3" },
            react_1.default.createElement("div", { className: "flex justify-between items-start" },
                react_1.default.createElement("p", { className: "text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300 truncate flex-grow mr-2" }, photo.caption),
                isPublic ? (react_1.default.createElement(GlobeAltIcon_1.GlobeAltIcon, { className: "w-4 h-4 text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300" })) : (react_1.default.createElement(LockClosedIcon_1.LockClosedIcon, { className: "w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300" }))),
            // Action buttons removed as per user request to make the entire item clickable. Actions are available in the detail view.
            null)));
};
const PhotoGrid = ({ photos, onDeletePhoto, onViewPhoto, onSendPhoto, onTogglePhotoPublicStatus, showActions = true }) => {
    if (photos.length === 0) {
        return (react_1.default.createElement("div", { className: "text-center py-10" },
            react_1.default.createElement("p", { className: "text-gray-500 dark:text-gray-400 text-lg" }, "No photos yet. Start by uploading some!")));
    }
    return (react_1.default.createElement("div", { className: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4" }, photos.map((photo) => (react_1.default.createElement(PhotoGridItem, { key: photo.id, photo: photo, onDelete: () => onDeletePhoto(photo.id), onView: () => onViewPhoto(photo), onSend: () => onSendPhoto(photo), onTogglePublic: () => onTogglePhotoPublicStatus(photo.id), showActions: showActions })))));
};
exports.default = PhotoGrid;
