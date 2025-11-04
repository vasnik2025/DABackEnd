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
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importStar(require("react"));
const timeDurations = [
    { label: '5 seconds', value: 5 },
    { label: '10 seconds', value: 10 },
    { label: '30 seconds', value: 30 },
    { label: '60 seconds', value: 60 },
];
const SendPhotoForm = ({ photo, onConfirmSend, onCancel, availableUsers }) => {
    const [recipientUsername, setRecipientUsername] = (0, react_1.useState)('');
    const [duration, setDuration] = (0, react_1.useState)(timeDurations[0].value);
    const [error, setError] = (0, react_1.useState)('');
    const handleSubmit = (e) => {
        e.preventDefault();
        if (!recipientUsername.trim()) {
            setError('Recipient username is required.');
            return;
        }
        // Optional: Validate recipientUsername against availableUsers if provided
        // if (availableUsers && !availableUsers.some(u => u.username === recipientUsername.trim())) {
        //   setError('Recipient username not found.');
        //   return;
        // }
        setError('');
        onConfirmSend(recipientUsername.trim(), duration);
    };
    return (<form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h4 className="text-md font-medium text-gray-700 dark:text-gray-300 mb-2">Sending photo:</h4>
        <div className="flex items-center space-x-3">
          <img src={photo.dataUrl} alt={photo.caption || 'Photo to send'} className="w-16 h-16 object-cover rounded-md"/>
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{photo.caption || 'Untitled Photo'}</p>
        </div>
      </div>
      
      {error && <p className="text-red-500 dark:text-red-400 text-sm">{error}</p>}

      <div>
        <label htmlFor="recipient-username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Recipient Username
        </label>
        <input type="text" id="recipient-username" value={recipientUsername} onChange={(e) => setRecipientUsername(e.target.value)} required className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Enter recipient's username"/>
      </div>

      <div>
        <label htmlFor="time-duration" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Viewing Time Limit
        </label>
        <select id="time-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-accent-500 focus:border-accent-500 sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          {timeDurations.map((option) => (<option key={option.value} value={option.value}>
              {option.label}
            </option>))}
        </select>
      </div>

      <div className="flex justify-end space-x-3 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-gray-900">
          Cancel
        </button>
        <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-gray-800 hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 dark:focus:ring-offset-gray-900">
          Confirm Send
        </button>
      </div>
    </form>);
};
exports.default = SendPhotoForm;
