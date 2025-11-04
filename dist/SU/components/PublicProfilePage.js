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
const react_router_dom_1 = require("react-router-dom");
const apiService_1 = require("../services/apiService");
const PhotoGrid_1 = __importDefault(require("./PhotoGrid"));
const Modal_1 = __importDefault(require("./Modal"));
const UserCircleIcon_1 = require("./icons/UserCircleIcon");
const useAuth_1 = require("../hooks/useAuth");
const PublicProfilePage = () => {
    const { userId } = (0, react_router_dom_1.useParams)();
    const { currentUser, isLoading: authIsLoading } = (0, useAuth_1.useAuth)();
    const [profileUser, setProfileUser] = (0, react_1.useState)(null);
    const [photos, setPhotos] = (0, react_1.useState)([]);
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    const [selectedPhotoForModal, setSelectedPhotoForModal] = (0, react_1.useState)(null);
    const [isViewPhotoModalOpen, setIsViewPhotoModalOpen] = (0, react_1.useState)(false);
    const [isPhotoModalFadingOut, setIsPhotoModalFadingOut] = (0, react_1.useState)(false);
    const fetchProfileData = (0, react_1.useCallback)(async () => {
        if (!userId) {
            setError("User ID is missing.");
            setIsLoading(false);
            return;
        }
        if (currentUser && userId === currentUser.id) {
            // User is trying to view their own public profile, redirect to standard profile
            return; // Navigate component will handle this
        }
        setIsLoading(true);
        setError(null);
        try {
            const userDetails = await (0, apiService_1.apiGetUserById)(userId);
            if (!userDetails) {
                setError("User not found.");
                setProfileUser(null);
                setPhotos([]);
                return;
            }
            setProfileUser(userDetails);
            const userPhotos = await (0, apiService_1.apiGetUserPhotos)(userId);
            setPhotos(userPhotos.filter(p => p.isPublic === true).map(p => ({ ...p, isPublic: p.isPublic ?? false })));
        }
        catch (err) {
            console.error("Failed to fetch public profile data:", err);
            setError(err.message || "Could not load profile.");
            setProfileUser(null);
            setPhotos([]);
        }
        finally {
            setIsLoading(false);
        }
    }, [userId, currentUser]);
    (0, react_1.useEffect)(() => {
        fetchProfileData();
    }, [fetchProfileData]);
    const handleViewPhoto = (0, react_1.useCallback)((photo) => {
        setSelectedPhotoForModal(photo);
        setIsViewPhotoModalOpen(true);
        setIsPhotoModalFadingOut(false);
    }, []);
    const handleCloseViewPhotoModal = (0, react_1.useCallback)(() => {
        setIsPhotoModalFadingOut(true);
        setTimeout(() => {
            setIsViewPhotoModalOpen(false);
            setSelectedPhotoForModal(null);
            setIsPhotoModalFadingOut(false);
        }, 300);
    }, []);
    if (authIsLoading || isLoading) {
        return (<div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <p className="text-xl text-gray-700 dark:text-gray-300">Loading profile...</p>
      </div>);
    }
    if (currentUser && userId === currentUser.id) {
        return <react_router_dom_1.Navigate to="/profile" replace/>;
    }
    if (error) {
        return (<div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <h1 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-4">Error</h1>
        <p className="text-red-700 dark:text-red-300 text-center">{error}</p>
        <button onClick={() => window.location.hash = '#/'} className="mt-6 px-4 py-2 bg-accent-600 text-white rounded hover:bg-accent-700">
          Go to Home
        </button>
      </div>);
    }
    if (!profileUser) {
        return (<div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <h1 className="text-2xl font-bold text-gray-700 dark:text-gray-300">User Not Found</h1>
        <p className="text-gray-500 dark:text-gray-400">The profile you are looking for does not exist or could not be loaded.</p>
         <button onClick={() => window.location.hash = '#/'} className="mt-6 px-4 py-2 bg-accent-600 text-white rounded hover:bg-accent-700">
          Go to Home
        </button>
      </div>);
    }
    return (<div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <header className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6 sm:p-8 mb-8 border border-gray-200 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row items-center">
          {profileUser.profilePictureUrl ? (<img src={profileUser.profilePictureUrl} alt={`${profileUser.username}'s profile`} className="w-24 h-24 sm:w-32 sm:h-32 rounded-full object-cover mr-0 sm:mr-6 mb-4 sm:mb-0 border-4 border-accent-300 dark:border-accent-600 shadow-md"/>) : (<UserCircleIcon_1.UserCircleIcon className="w-24 h-24 sm:w-32 sm:h-32 text-accent-500 dark:text-accent-400 mr-0 sm:mr-6 mb-4 sm:mb-0"/>)}
          <div className="text-center sm:text-left flex-grow">
            <h1 className="text-3xl sm:text-4xl font-bold text-accent-700 dark:text-accent-800 flex items-center justify-center sm:justify-start">
              {profileUser.username}
              {profileUser.isOnline && <span className="ml-2 w-3 h-3 bg-green-500 rounded-full" title="Online"></span>}
            </h1>
            <p className="text-md text-gray-600 dark:text-gray-400">{profileUser.email}</p>
            {profileUser.country && <p className="text-sm text-gray-500 dark:text-gray-400">Country: {profileUser.country}</p>}
            {profileUser.city && <p className="text-sm text-gray-500 dark:text-gray-400">City: {profileUser.city}</p>}
            {profileUser.bio && <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{profileUser.bio}</p>}
          </div>
        </div>
      </header>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8">
        <h2 className="text-2xl font-semibold text-accent-700 dark:text-accent-800 mb-6">Public Photos</h2>
        {photos.length > 0 ? (<PhotoGrid_1.default photos={photos} onDeletePhoto={() => { }} // No delete on public profile
         onViewPhoto={handleViewPhoto} onSendPhoto={() => { }} // No send from public profile
         onTogglePhotoPublicStatus={() => { }} // No toggle on public profile
        />) : (<p className="text-center py-10 text-gray-500 dark:text-gray-400">
            {profileUser.username} has no public photos to display.
          </p>)}
      </div>

      {selectedPhotoForModal && (<Modal_1.default isOpen={isViewPhotoModalOpen} isFadingOut={isPhotoModalFadingOut} onClose={handleCloseViewPhotoModal} title={selectedPhotoForModal.caption || "View Photo"}>
          <div className="text-center">
            <img src={selectedPhotoForModal.dataUrl} alt={selectedPhotoForModal.caption || "Full size view"} className="max-w-full max-h-[70vh] object-contain mx-auto rounded-md mb-2"/>
            {selectedPhotoForModal.caption && (<p className="font-semibold text-gray-800 dark:text-gray-200">{selectedPhotoForModal.caption}</p>)}
            <p className="text-xs text-gray-500 dark:text-gray-400">Uploaded: {new Date(selectedPhotoForModal.uploadedAt).toLocaleString()}</p>
          </div>
        </Modal_1.default>)}
    </div>);
};
exports.default = PublicProfilePage;
