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
const apiService_1 = require("../services/apiService");
const useAuth_ts_1 = require("../hooks/useAuth.ts");
const ViewSharedPhotoModal = ({ isOpen, onClose, sharedPhotoItem }) => {
    const { currentUser } = (0, useAuth_ts_1.useAuth)();
    const [timeLeft, setTimeLeft] = (0, react_1.useState)(sharedPhotoItem.durationSeconds);
    const [isModalContentOpen, setIsModalContentOpen] = (0, react_1.useState)(false);
    const updateShareStatus = (0, react_1.useCallback)(async (status) => {
        if (!currentUser)
            return;
        try {
            await (0, apiService_1.apiUpdatePhotoShareStatus)(sharedPhotoItem.id, status, currentUser.id);
        }
        catch (error) {
            console.error(`Failed to update share status to ${status}:`, error);
        }
    }, [sharedPhotoItem.id, currentUser]);
    (0, react_1.useEffect)(() => {
        if (isOpen) {
            setIsModalContentOpen(true);
            setTimeLeft(sharedPhotoItem.durationSeconds);
            if (sharedPhotoItem.status === 'accepted') {
                updateShareStatus('viewed');
            }
            const timer = setInterval(() => {
                setTimeLeft(prevTime => {
                    if (prevTime <= 1) {
                        clearInterval(timer);
                        updateShareStatus('expired');
                        setTimeout(() => onClose('expired'), 0); // ✅ Defer onClose call
                        return 0;
                    }
                    return prevTime - 1;
                });
            }, 1000);
            return () => {
                clearInterval(timer);
            };
        }
        else {
            setIsModalContentOpen(false);
        }
    }, [isOpen, sharedPhotoItem.durationSeconds, onClose, updateShareStatus, sharedPhotoItem.status]);
    const handleActualClose = () => {
        setTimeout(() => {
            onClose(timeLeft === 0 ? 'expired' : sharedPhotoItem.status); // ✅ Safe onClose call
        }, 0);
    };
    if (!isOpen && !isModalContentOpen) {
        return null;
    }
    return (<Modal_1.default isOpen={isOpen} onClose={handleActualClose} title={`Viewing: ${sharedPhotoItem.photoCaption || 'Shared Photo'}`} isFadingOut={!isModalContentOpen && isOpen}>
      <div className="text-center p-2 relative">
        <div className="mb-4 bg-yellow-100 dark:bg-yellow-700 border-l-4 border-yellow-500 dark:border-yellow-400 text-yellow-700 dark:text-yellow-100 p-3 rounded-md">
          <p className="font-semibold text-sm">Privacy Advisory</p>
          <p className="text-xs">
            This photo is shared for temporary viewing. Please respect the sender's privacy.
            Screenshots, screen recording, or any form of copying are prohibited.
          </p>
        </div>

        {sharedPhotoItem.photoDataUrl ? (<img src={sharedPhotoItem.photoDataUrl} alt={sharedPhotoItem.photoCaption || 'Shared content'} className="max-w-full max-h-[60vh] object-contain mx-auto rounded-md mb-3 shadow-lg"/>) : (<p className="text-gray-500 dark:text-gray-400 p-10">Photo data is not available.</p>)}

        <div className="mt-3 p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
          {timeLeft > 0 ? (<p className="text-lg font-semibold text-accent-600 dark:text-accent-500">
              Closes in: <span className="text-2xl tabular-nums">{timeLeft}s</span>
            </p>) : (<p className="text-lg font-semibold text-red-600 dark:text-red-400">Viewing time expired.</p>)}
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Shared by: {sharedPhotoItem.senderUsername}
          </p>
        </div>
      </div>
    </Modal_1.default>);
};
exports.default = ViewSharedPhotoModal;
