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
const PaperAirplaneIcon_1 = require("./icons/PaperAirplaneIcon");
const ConversationModal = ({ isOpen, onClose, currentUser, otherUser, }) => {
    const [messages, setMessages] = (0, react_1.useState)([]);
    const [newMessageContent, setNewMessageContent] = (0, react_1.useState)('');
    const [isLoadingMessages, setIsLoadingMessages] = (0, react_1.useState)(false);
    const [isSendingMessage, setIsSendingMessage] = (0, react_1.useState)(false);
    const [isUpdatingStatus, setIsUpdatingStatus] = (0, react_1.useState)(null); // Store MessageID being updated
    const [error, setError] = (0, react_1.useState)(null);
    const messagesEndRef = (0, react_1.useRef)(null);
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" }); // Use "auto" for instant scroll on new data
    };
    const fetchConversation = (0, react_1.useCallback)(async (markJustAcceptedAsViewed = false) => {
        if (!currentUser || !otherUser)
            return;
        setIsLoadingMessages(true);
        setError(null);
        try {
            const fetchedMessages = await (0, apiService_1.apiGetConversation)(currentUser.id, otherUser.id);
            setMessages(fetchedMessages);
            if (markJustAcceptedAsViewed) {
                fetchedMessages.forEach(msg => {
                    if (msg.RecipientUserID === currentUser.id && msg.Status === 'accepted') {
                        (0, apiService_1.apiUpdateDirectMessageStatus)(msg.MessageID, 'viewed', currentUser.id)
                            .then(() => {
                            setMessages(prev => prev.map(m => m.MessageID === msg.MessageID ? { ...m, Status: 'viewed' } : m));
                        })
                            .catch(err => console.warn(`Failed to mark message ${msg.MessageID} as viewed:`, err));
                    }
                });
            }
        }
        catch (err) {
            console.error("Failed to fetch conversation:", err);
            setError(err.message || "Could not load messages.");
        }
        finally {
            setIsLoadingMessages(false);
        }
    }, [currentUser, otherUser]);
    (0, react_1.useEffect)(() => {
        if (isOpen && currentUser && otherUser) {
            fetchConversation(true);
        }
    }, [isOpen, currentUser, otherUser, fetchConversation]);
    (0, react_1.useEffect)(scrollToBottom, [messages, isLoadingMessages]);
    const handleInputChange = (e) => {
        setNewMessageContent(e.target.value);
    };
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!newMessageContent.trim() || !currentUser || !otherUser)
            return;
        setIsSendingMessage(true);
        setError(null);
        try {
            await (0, apiService_1.apiSendMessage)(currentUser.id, otherUser.id, newMessageContent.trim());
            setNewMessageContent('');
            await fetchConversation();
        }
        catch (err) {
            console.error("Failed to send message:", err);
            setError(err.message || "Could not send message.");
        }
        finally {
            setIsSendingMessage(false);
        }
    };
    const handleUpdateMessageStatus = async (messageId, newStatus) => {
        if (!currentUser)
            return;
        setIsUpdatingStatus(messageId);
        setError(null);
        try {
            await (0, apiService_1.apiUpdateDirectMessageStatus)(messageId, newStatus, currentUser.id);
            await fetchConversation(newStatus === 'accepted');
        }
        catch (err) {
            console.error(`Failed to update message ${messageId} to ${newStatus}:`, err);
            setError(err.message || `Could not update message status.`);
        }
        finally {
            setIsUpdatingStatus(null);
        }
    };
    const renderMessageContent = (msg) => {
        if (msg.RecipientUserID === currentUser.id && msg.Status === 'pending') {
            return (<div className="italic text-gray-600 dark:text-gray-400">
          <p>New message from {msg.SenderUsername || otherUser.username}.</p>
          <div className="mt-2 space-x-2">
            <button onClick={() => handleUpdateMessageStatus(msg.MessageID, 'accepted')} disabled={isUpdatingStatus === msg.MessageID} className="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded disabled:opacity-50">
              {isUpdatingStatus === msg.MessageID ? 'Accepting...' : 'Accept'}
            </button>
            <button onClick={() => handleUpdateMessageStatus(msg.MessageID, 'denied')} disabled={isUpdatingStatus === msg.MessageID} className="px-2 py-1 text-xs bg-red-500 hover:bg-red-600 text-white rounded disabled:opacity-50">
             {isUpdatingStatus === msg.MessageID ? 'Denying...' : 'Deny'}
            </button>
          </div>
        </div>);
        }
        if (msg.Status === 'denied') {
            if (msg.RecipientUserID === currentUser.id)
                return <p className="italic text-gray-500 dark:text-gray-400">You denied this message.</p>;
            if (msg.SenderUserID === currentUser.id)
                return <p className="italic text-gray-500 dark:text-gray-400">Your message was denied by {otherUser.username}.</p>;
        }
        return <p className="text-sm whitespace-pre-wrap break-words">{msg.MessageContent}</p>;
    };
    const getStatusIndicator = (msg) => {
        if (msg.SenderUserID === currentUser.id) {
            switch (msg.Status) {
                case 'pending': return '(Pending delivery)';
                case 'accepted': return '(Accepted)';
                case 'viewed': return '(Viewed)';
                case 'denied': return '(Denied by recipient)';
                case 'replied': return '(Replied by recipient)';
                default: return '';
            }
        }
        return '';
    };
    return (<Modal_1.default isOpen={isOpen} onClose={onClose} title={`Messages with ${otherUser.username}`}>
      <div className="flex flex-col h-[70vh]">
        <div className="flex-grow overflow-y-auto p-4 space-y-3 custom-scrollbar bg-gray-50 dark:bg-gray-700 rounded-t-md">
          {isLoadingMessages && <p className="text-center text-gray-500 dark:text-gray-400 py-4">Loading messages...</p>}
          {error && !isLoadingMessages && <p className="text-center text-red-500 dark:text-red-400 py-4">{error}</p>}
          {!isLoadingMessages && !error && messages.length === 0 && (<p className="text-center text-gray-500 dark:text-gray-400 py-10">No messages yet. Start the conversation!</p>)}
          {messages.map((msg) => (<div key={msg.MessageID} className={`flex ${msg.SenderUserID === currentUser.id ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[70%] p-3 rounded-lg shadow ${msg.SenderUserID === currentUser.id
                ? 'bg-accent-500 text-white rounded-br-none'
                : 'bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-bl-none'}`}>
                <div className="flex justify-between items-baseline">
                    <p className="text-xs font-semibold mb-0.5">
                    {msg.SenderUserID === currentUser.id ? "You" : msg.SenderUsername || otherUser.username}
                    </p>
                    <span className="text-xs opacity-60 ml-2">{getStatusIndicator(msg)}</span>
                </div>
                {renderMessageContent(msg)}
                <p className="text-xs opacity-70 mt-1 text-right">
                  {new Date(msg.SentAt).toLocaleTimeString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>))}
          <div ref={messagesEndRef}/>
        </div>
        <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-750 rounded-b-md">
          <div className="flex items-center space-x-2">
            <textarea value={newMessageContent} onChange={handleInputChange} placeholder={`Send a message to ${otherUser.username}...`} rows={1} disabled={isSendingMessage} className="flex-grow p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-accent-500 focus:border-accent-500 sm:text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white custom-scrollbar resize-none" onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage(e);
    } }} aria-label={`Message to ${otherUser.username}`}/>
            <button type="submit" disabled={isSendingMessage || !newMessageContent.trim()} className="p-2.5 bg-accent-600 text-white rounded-lg hover:bg-accent-700 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50" aria-label="Send message">
              {isSendingMessage ? (<svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>) : (<PaperAirplaneIcon_1.PaperAirplaneIcon className="w-5 h-5 transform rotate-45"/>)}
            </button>
          </div>
        </form>
      </div>
    </Modal_1.default>);
};
exports.default = ConversationModal;
