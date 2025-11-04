"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = __importDefault(require("react"));
const UserCircleIcon_1 = require("./icons/UserCircleIcon");
const getTrialDaysRemaining = (expiryDateString) => {
    if (!expiryDateString)
        return null;
    const expiryDate = new Date(expiryDateString);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    if (diffTime < 0)
        return 0; // Expired
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};
const MemberDetailsPopup = ({ user, position, onMouseEnter, onMouseLeave }) => {
    const getMembershipStatusDisplay = () => {
        const { membershipType, membershipExpiryDate, subscribedAt } = user;
        if (membershipType === 'unlimited') {
            const subDate = subscribedAt ? new Date(subscribedAt).toLocaleDateString() : 'N/A';
            return <p className="text-xs text-green-500 dark:text-green-400">Unlimited (since {subDate})</p>;
        }
        if (membershipType === 'trial') {
            const daysRemaining = getTrialDaysRemaining(membershipExpiryDate);
            if (daysRemaining !== null && daysRemaining > 0) {
                return <p className="text-xs text-yellow-500 dark:text-yellow-400">Trial: {daysRemaining} day(s) left</p>;
            }
            return <p className="text-xs text-red-500 dark:text-red-400">Trial Expired</p>;
        }
        return <p className="text-xs text-gray-500 dark:text-gray-400">No active membership</p>;
    };
    // Attempt to make popup stay within viewport - basic adjustments
    const adjustedPosition = { ...position };
    const popupWidth = 288; // approx w-72
    const popupHeight = 200; // estimated height, can be dynamic but harder
    if (position.left + popupWidth > window.innerWidth) {
        adjustedPosition.left = window.innerWidth - popupWidth - 10; // 10px buffer
    }
    if (position.top + popupHeight > window.innerHeight) {
        adjustedPosition.top = window.innerHeight - popupHeight - 10; // 10px buffer
    }
    if (adjustedPosition.left < 0)
        adjustedPosition.left = 5;
    if (adjustedPosition.top < 0)
        adjustedPosition.top = 5;
    return (<div className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 w-72 border border-gray-200 dark:border-gray-700 z-50 transition-opacity duration-150 ease-in-out" style={{ top: `${adjustedPosition.top}px`, left: `${adjustedPosition.left}px` }} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} aria-live="polite" role="tooltip">
      <div className="flex items-start mb-3">
        {user.profilePictureUrl ? (<img src={user.profilePictureUrl} alt={`${user.username}'s profile`} className="w-16 h-16 rounded-full object-cover mr-3 border-2 border-accent-200 dark:border-accent-700"/>) : (<UserCircleIcon_1.UserCircleIcon className="w-16 h-16 text-gray-400 dark:text-gray-500 mr-3"/>)}
        <div className="flex-grow">
          <h4 className="text-lg font-semibold text-accent-700 dark:text-accent-600 truncate flex items-center" title={user.username}>
            {user.username}
            {user.isOnline && <span className="ml-2 w-2.5 h-2.5 bg-green-500 rounded-full" title="Online"></span>}
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={user.email}>
            {user.email}
          </p>
          {user.city && <p className="text-xs text-gray-400 dark:text-gray-300">City: {user.city}</p>}
           {getMembershipStatusDisplay()}
        </div>
      </div>
      
      {user.bio ? (<p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed max-h-28 overflow-y-auto text-left custom-scrollbar">
          {user.bio}
        </p>) : (<p className="text-sm text-gray-500 dark:text-gray-400 italic text-left">No bio available.</p>)}
    </div>);
};
exports.default = MemberDetailsPopup;
