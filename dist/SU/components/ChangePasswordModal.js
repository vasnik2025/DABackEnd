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
const ChangePasswordModal = ({ isOpen, onClose, onSavePassword, }) => {
    const [currentPassword, setCurrentPassword] = (0, react_1.useState)('');
    const [newPassword, setNewPassword] = (0, react_1.useState)('');
    const [confirmNewPassword, setConfirmNewPassword] = (0, react_1.useState)('');
    const [error, setError] = (0, react_1.useState)('');
    const [isSaving, setIsSaving] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        if (isOpen) {
            // Reset form only when modal becomes visible, not on every render when isOpen is true
            setCurrentPassword('');
            setNewPassword('');
            setConfirmNewPassword('');
            setError('');
            setIsSaving(false);
        }
    }, [isOpen]);
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!currentPassword) {
            setError('Current password is required.');
            return;
        }
        if (!newPassword) {
            setError('New password cannot be empty.');
            return;
        }
        if (newPassword.length < 6) {
            setError('New password must be at least 6 characters long.');
            return;
        }
        if (newPassword !== confirmNewPassword) {
            setError('New passwords do not match.');
            return;
        }
        setIsSaving(true);
        try {
            await onSavePassword(currentPassword, newPassword);
            onClose();
        }
        catch (err) {
            setError(err.message || 'Failed to change password. Please try again.');
        }
        finally {
            setIsSaving(false);
        }
    };
    return (<Modal_1.default isOpen={isOpen} onClose={onClose} title="Change Your Password">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p className="text-red-500 dark:text-red-400 text-sm text-center p-2 bg-red-50 dark:bg-red-900 rounded-md">{error}</p>}
        
        <div>
          <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Current Password</label>
          <input id="current-password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} disabled={isSaving} required className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-accent-500 focus:border-accent-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"/>
        </div>
        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">New Password</label>
          <input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={isSaving} required className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-accent-500 focus:border-accent-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Min. 6 characters"/>
        </div>
        <div>
          <label htmlFor="confirm-new-password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Confirm New Password</label>
          <input id="confirm-new-password" type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} disabled={isSaving} required className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-accent-500 focus:border-accent-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white" placeholder="Confirm new password"/>
        </div>

        <div className="flex justify-end space-x-3 pt-4">
          <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-gray-900 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 dark:bg-accent-500 dark:hover:bg-accent-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 dark:focus:ring-offset-gray-900 disabled:opacity-70">
            {isSaving ? 'Saving Password...' : 'Save Password'}
          </button>
        </div>
      </form>
    </Modal_1.default>);
};
exports.default = ChangePasswordModal;
