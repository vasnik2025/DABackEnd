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
const PaperAirplaneIcon_1 = require("./icons/PaperAirplaneIcon");
const MAX_MESSAGE_LENGTH = 1000; // Increased limit for real messages
const DirectMessageModal = ({ isOpen, onClose, recipient, currentUser, onSend, }) => {
    const [message, setMessage] = (0, react_1.useState)('');
    const [charCount, setCharCount] = (0, react_1.useState)(0);
    const [error, setError] = (0, react_1.useState)('');
    const [isSending, setIsSending] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        if (isOpen) {
            setMessage('');
            setCharCount(0);
            setError('');
            setIsSending(false);
        }
    }, [isOpen]);
    const handleMessageChange = (e) => {
        const newText = e.target.value;
        if (newText.length <= MAX_MESSAGE_LENGTH) {
            setMessage(newText);
            setCharCount(newText.length);
        }
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) {
            setError('Message cannot be empty.');
            return;
        }
        setError('');
        setIsSending(true);
        try {
            const success = await onSend(recipient.id, message.trim());
            if (success) {
                onClose(); // Close modal on successful send
            }
            else {
                // Error should be set by the onSend handler if it throws or returns false
                setError('Failed to send message. Please try again.');
            }
        }
        catch (err) {
            setError(err.message || 'An unexpected error occurred.');
        }
        finally {
            setIsSending(false);
        }
    };
    return (<Modal_1.default isOpen={isOpen} onClose={onClose} title={`Message to ${recipient.username}`}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (<p className="text-red-500 dark:text-red-400 text-sm text-center p-2 bg-red-50 dark:bg-red-900 rounded-md">
            {error}
          </p>)}
        <div>
          <label htmlFor="dm-message" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Your Message
          </label>
          <textarea id="dm-message" rows={4} value={message} onChange={handleMessageChange} disabled={isSending} required className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-accent-500 focus:border-accent-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white custom-scrollbar" placeholder={`Write your message to ${recipient.username}...`}/>
          <p className={`mt-1 text-xs ${charCount > MAX_MESSAGE_LENGTH - 50 ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
            {charCount}/{MAX_MESSAGE_LENGTH} characters
          </p>
        </div>

        <div className="flex justify-end space-x-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={onClose} disabled={isSending} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-gray-900 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={isSending || !message.trim()} className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 dark:bg-accent-500 dark:hover:bg-accent-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 dark:focus:ring-offset-gray-900 disabled:opacity-70">
            <PaperAirplaneIcon_1.PaperAirplaneIcon className="w-4 h-4 mr-2 transform rotate-45"/>
            {isSending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </Modal_1.default>);
};
exports.default = DirectMessageModal;
