import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import PhotoGrid from './components/PhotoGrid';
import Modal from './components/Modal';
import EditUserDetailsModal from './components/EditUserDetailsModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import MemberProfileModal from './components/MemberProfileModal';
import ViewMyPhotoModal from './components/ViewMyPhotoModal';
import ViewSharedPhotoModal from './components/ViewSharedPhotoModal';
import SendPhotoForm from './components/SendPhotoForm';
import EmailVerificationModal from './components/EmailVerificationModal';
import SharedPhotosInboxModal from './components/SharedPhotosInboxModal';

import { apiGetUserPhotos, apiUploadPhoto, apiDeletePhoto, apiUpdatePhotoPublicStatus, apiReplacePhoto, apiDeleteComment, apiSendPhoto, apiGetAllUsers, apiGetNotifications, apiGetPendingPhotoShares, apiUpdatePhotoShareStatus, apiGetSentShares, apiGetConversation } from './services/apiService';
import { User, Photo, UserUpdatePayload, SharedPhotoItem, Notification, DirectMessage, SharedPhotoStatus } from '../shared_types';

import { PencilIcon } from './components/icons/PencilIcon';
import { UserCircleIcon } from './components/icons/UserCircleIcon';
import { SearchIcon } from './components/icons/SearchIcon';
import { CameraIcon } from './components/icons/CameraIcon';
import { ChatBubbleLeftRightIcon } from './components/icons/ChatBubbleLeftRightIcon';
import { ViberIcon } from './components/icons/ViberIcon';
import { WhatsAppIcon } from './components/icons/WhatsAppIcon';
import { InstagramIcon } from './components/icons/InstagramIcon';
import { FacebookIcon } from './components/icons/FacebookIcon';
import { TeamsIcon } from './components/icons/TeamsIcon';
import { MailIcon } from './components/icons/MailIcon';
import { LockOpenIcon } from './components/icons/LockOpenIcon';
import { LockClosedIcon } from './components/icons/LockClosedIcon';
import { UploadIcon } from './components/icons/UploadIcon';
import { HeartIcon } from './components/icons/HeartIcon';

const getMembershipDisplay = (user: User | null): string => {
    if (!user) return "N/A";
    const { membershipType, subscribedAt, membershipExpiryDate } = user;
  
    const getTrialDaysRemaining = (expiry?: string | null): number | null => {
      if (!expiry) return null;
      const diff = new Date(expiry).getTime() - Date.now();
      if (diff < 0) return 0;
      return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };
  
    if (membershipType === 'unlimited') {
      return `Unlimited Membership (Since: ${subscribedAt ? new Date(subscribedAt).toLocaleDateString() : 'N/A'})`;
    }
    if (membershipType === 'trial') {
      const days = getTrialDaysRemaining(membershipExpiryDate);
      if (days !== null && days > 0) {
        return `Trial Member (${days} day(s) remaining)`;
      }
      return `Trial Membership (Expired: ${membershipExpiryDate ? new Date(membershipExpiryDate).toLocaleDateString() : "N/A"})`;
    }
    return 'No Active Subscription';
};

const SocialInput = ({ id, label, Icon, value, onValueChange, isPublic, onIsPublicChange, isSaving }: { id: string, label: string, Icon: React.ElementType, value: string, onValueChange: (v: string) => void, isPublic: boolean, onIsPublicChange: (v: boolean) => void, isSaving: boolean }) => (
    <div className="space-y-1">
      <label htmlFor={`social-${id}`} className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
        <Icon className="w-5 h-5 mr-2 text-gray-500" /> {label}
      </label>
      <div className="flex items-center space-x-2">
        <input
          id={`social-${id}`}
          type="text"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          disabled={isSaving}
          className="flex-grow block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-accent-500 focus:border-accent-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          placeholder={`${label} username/number`}
        />
        <label htmlFor={`public-social-${id}`} className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" id={`public-social-${id}`} checked={isPublic} onChange={(e) => onIsPublicChange(e.target.checked)} disabled={isSaving} className="sr-only peer" />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-accent-300 dark:peer-focus:ring-accent-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-accent-600"></div>
        </label>
      </div>
    </div>
);

const SocialLinkDisplay = ({ Icon, value, isPublic, color }: { Icon: React.ElementType, value: string, isPublic: boolean, color: string }) => {
    if (!value) return null;
    return (
        <div className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
            <div className="flex items-center space-x-3">
                <Icon className={`w-6 h-6 ${color}`} />
                <span className="text-gray-800 dark:text-gray-200">{value}</span>
            </div>
            <div title={isPublic ? 'Publicly visible' : 'Private'}>
                {isPublic ? <LockOpenIcon className="w-5 h-5 text-yellow-500" /> : <LockClosedIcon className="w-5 h-5 text-red-500" />}
            </div>
        </div>
    );
};

const formatLastActive = (user: User) => {
    if (user.isOnline) return "Active Now";
    if (!user.updatedAt) return 'Never';
    const now = new Date();
    const lastActiveDate = new Date(user.updatedAt);
    const diffSeconds = Math.floor((now.getTime() - lastActiveDate.getTime()) / 1000);
  
    if (diffSeconds < 300) return "Active Now"; // 5 minutes
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    return lastActiveDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
  
export const ProfilePage: React.FC = () => {
  const { currentUser, updateUser, updateUserProfilePicture, reloadUser } = useAuth();
  const navigate = useNavigate();

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isPhotosLoading, setIsPhotosLoading] = useState(false);
  const [selectedPhotoForModal, setSelectedPhotoForModal] = useState<Photo | null>(null);
  const [isViewPhotoModalOpen, setIsViewPhotoModalOpen] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [editableBioText, setEditableBioText] = useState('');
  const [isBioUpdating, setIsBioUpdating] = useState(false);
  const [isProfilePicUpdating, setIsProfilePicUpdating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const profilePictureInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [photoToSend, setPhotoToSend] = useState<Photo | null>(null);

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [newMembers, setNewMembers] = useState<User[]>([]);
  const [filterOnlineOnly, setFilterOnlineOnly] = useState(false);
  const [filterByCity, setFilterByCity] = useState(false);
  const [cityFilterValue, setCityFilterValue] = useState('');

  const [isEditDetailsModalOpen, setIsEditDetailsModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false);
  const [donationState, setDonationState] = useState<'form' | 'thanks'>('form');

  const [isMemberProfileModalOpen, setIsMemberProfileModalOpen] = useState(false);
  const [selectedUserForProfileModal, setSelectedUserForProfileModal] = useState<User | null>(null);

  const [chatNotificationCount, setChatNotificationCount] = useState(0);
  const [isInboxModalOpen, setIsInboxModalOpen] = useState(false);
  
  const [isViewSharedPhotoModalOpen, setIsViewSharedPhotoModalOpen] = useState(false);
  const [selectedSharedPhotoItem, setSelectedSharedPhotoItem] = useState<SharedPhotoItem | null>(null);

  const [isEditingSocials, setIsEditingSocials] = useState(false);
  const [viber, setViber] = useState('');
  const [isViberPublic, setIsViberPublic] = useState(false);
  const [whatsApp, setWhatsApp] = useState('');
  const [isWhatsAppPublic, setIsWhatsAppPublic] = useState(false);
  const [instagram, setInstagram] = useState('');
  const [isInstagramPublic, setIsInstagramPublic] = useState(false);
  const [facebook, setFacebook] = useState('');
  const [isFacebookPublic, setIsFacebookPublic] = useState(false);
  const [teams, setTeams] = useState('');
  const [isTeamsPublic, setIsTeamsPublic] = useState(false);
  const [mail, setMail] = useState('');
  const [isMailPublic, setIsMailPublic] = useState(false);
  const [isSocialsSaving, setIsSocialsSaving] = useState(false);
  const [socialsError, setSocialsError] = useState('');

  const [isUploading, setIsUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const handleUploadButtonClick = () => uploadInputRef.current?.click();

  const handleOpenDonationModal = () => {
    setDonationState('form'); // Reset to form view every time it's opened
    setIsDonationModalOpen(true);
  };

  const handleCloseDonationModal = () => {
    setIsDonationModalOpen(false);
  };
  
  const handlePaypalSubmit = () => {
    setDonationState('thanks');
  };

  const resetSocialsState = useCallback(() => {
    if (currentUser) {
        setViber(currentUser.viber || '');
        setIsViberPublic(currentUser.isViberPublic || false);
        setWhatsApp(currentUser.whatsApp || '');
        setIsWhatsAppPublic(currentUser.isWhatsAppPublic || false);
        setInstagram(currentUser.instagram || '');
        setIsInstagramPublic(currentUser.isInstagramPublic || false);
        setFacebook(currentUser.facebook || '');
        setIsFacebookPublic(currentUser.isFacebookPublic || false);
        setTeams(currentUser.teams || '');
        setIsTeamsPublic(currentUser.isTeamsPublic || false);
        setMail(currentUser.mail || currentUser.email || '');
        setIsMailPublic(currentUser.isMailPublic || false);
        setSocialsError('');
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      resetSocialsState();
    }
  }, [currentUser, resetSocialsState]);

  const fetchAndCombineNotifications = useCallback(async () => {
    if (!currentUser) return;
    try {
        const [socialNotifications, pendingPhotoShares, pendingDMs] = await Promise.all([
          apiGetNotifications(currentUser.id),
          apiGetPendingPhotoShares(currentUser.id),
          apiGetConversation(currentUser.id, 'ALL_UNACCEPTED'),
        ]);

        const chatNotifs = [...pendingPhotoShares, ...pendingDMs];
        setChatNotificationCount(chatNotifs.length);
    } catch (err: any) {
        console.error("Failed to fetch notification count:", err);
    }
  }, [currentUser]);

  const fetchUserPhotos = useCallback(async () => {
    if (!currentUser) return;
    setIsPhotosLoading(true);
    try {
      const userPhotos = await apiGetUserPhotos(currentUser.id);
      setPhotos(userPhotos);
    } catch (e) {
      console.error("Failed to fetch user photos:", e);
    } finally {
      setIsPhotosLoading(false);
    }
  }, [currentUser]);
  
  const fetchAllUsers = useCallback(async () => {
    if (!currentUser) return;
    try {
        const users = await apiGetAllUsers(currentUser.id);
        setAllUsers(users);
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentMembers = users.filter(u => u.createdAt && new Date(u.createdAt) > twentyFourHoursAgo);
        setNewMembers(recentMembers);
    } catch (e) {
        console.error("Failed to fetch users", e);
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      fetchUserPhotos();
      fetchAllUsers();
      fetchAndCombineNotifications();
      setEditableBioText(
        currentUser.welcomeMessage?.trim() ||
        currentUser.bio?.trim() ||
        ''
      );
    }
  }, [currentUser, fetchUserPhotos, fetchAllUsers, fetchAndCombineNotifications]);
  

  const handlePhotoUploaded = useCallback(async (photoData: { dataUrl: string, caption: string }) => {
    if (!currentUser) return;
    try {
      const photoToUpload = { ...photoData, isPublic: false, };
      await apiUploadPhoto(currentUser.id, photoToUpload);
      fetchUserPhotos();
    } catch (error) {
      console.error("Failed to upload photo:", error);
      alert("Photo upload failed.");
    }
  }, [currentUser, fetchUserPhotos]);

  const handleFileSelected = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('Please select an image file (e.g., JPG, PNG, GIF).');
        if (event.target) event.target.value = '';
        return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
        try {
            const photoDataToUpload = {
                dataUrl: reader.result as string,
                caption: `My new photo from ${new Date().toLocaleDateString()}`,
            };
            await handlePhotoUploaded(photoDataToUpload);
        } catch (err) {
            console.error("Error during photo upload process:", err);
        } finally {
            setIsUploading(false);
            if (event.target) event.target.value = '';
        }
    };
    reader.onerror = () => {
        alert('Failed to read file.');
        setIsUploading(false);
        if (event.target) event.target.value = '';
    };
    reader.readAsDataURL(file);
  }, [handlePhotoUploaded]);

  const handleViewPhoto = (photo: Photo) => { setSelectedPhotoForModal(photo); setIsViewPhotoModalOpen(true); };
  const handleCloseViewPhotoModal = () => {
    setIsViewPhotoModalOpen(false);
    setSelectedPhotoForModal(null);
  };
  const handleTogglePublic = (photoId: string) => { const photo = photos.find(p => p.id === photoId); if (photo && currentUser) apiUpdatePhotoPublicStatus(currentUser.id, photoId, !photo.isPublic).then(fetchUserPhotos); };
  const handleDelete = (photoId: string) => { if (currentUser && window.confirm("Are you sure?")) apiDeletePhoto(currentUser.id, photoId).then(fetchUserPhotos); };
  const handleSend = (photo: Photo) => { setPhotoToSend(photo); setIsSendModalOpen(true); };
  const handleReplace = (photoId: string, dataUrl: string) => { if (currentUser) apiReplacePhoto(currentUser.id, photoId, dataUrl).then(() => { fetchUserPhotos(); handleCloseViewPhotoModal(); }); };
  const handleDeleteComment = async (commentId: string) => { if (currentUser) await apiDeleteComment(commentId, currentUser.id); };

  const handleOpenEditDetailsModal = () => setIsEditDetailsModalOpen(true);
  const handleSaveUserDetails = async (updatedData: UserUpdatePayload) => { await updateUser(updatedData); setIsEditDetailsModalOpen(false); await reloadUser(); await fetchAllUsers(); };
  const handleOpenChangePasswordModal = () => { setIsEditDetailsModalOpen(false); setIsChangePasswordModalOpen(true); };
  const handleSavePassword = async (currentPassword: string, newPassword?: string) => { if(newPassword) { await updateUser({ currentPassword, newPassword }); setIsChangePasswordModalOpen(false); } };

  const handleToggleOnlineStatus = async () => {
    if (!currentUser) return;
    await updateUser({ isOnline: !(currentUser.isOnline ?? false) });
    await reloadUser();
  };

  const handleEditBioClick = () => {
    const initial =
      currentUser?.welcomeMessage?.trim() ||
      currentUser?.bio?.trim() ||
      '';
    setEditableBioText(initial);
    setIsEditingBio(true);
  };
  const handleBioTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => setEditableBioText(e.target.value);
  const handleSaveBio = async () => {
    if (!currentUser) return;
    setIsBioUpdating(true);
    try {
      const trimmed = editableBioText.trim();
      await updateUser({ bio: trimmed, welcomeMessage: trimmed });
      setIsEditingBio(false);
      await reloadUser();
    } catch (e) { console.error(e); } finally { setIsBioUpdating(false); }
  };
  const handleCancelEditBio = () => {
    setEditableBioText(
      currentUser?.welcomeMessage?.trim() ||
      currentUser?.bio?.trim() ||
      ''
    );
    setIsEditingBio(false);
  };

  const handleSaveSocials = async () => {
    if (!currentUser) return;
    setSocialsError('');
    const updates: Partial<UserUpdatePayload> = {};
    let changed = false;

    const checkChange = (key: keyof UserUpdatePayload, newValue: any, originalValue: any) => {
        if (newValue !== originalValue) {
            (updates as any)[key] = newValue;
            changed = true;
        }
    };
    checkChange('viber', viber.trim(), currentUser.viber || '');
    checkChange('isViberPublic', isViberPublic, currentUser.isViberPublic || false);
    checkChange('whatsApp', whatsApp.trim(), currentUser.whatsApp || '');
    checkChange('isWhatsAppPublic', isWhatsAppPublic, currentUser.isWhatsAppPublic || false);
    checkChange('instagram', instagram.trim(), currentUser.instagram || '');
    checkChange('isInstagramPublic', isInstagramPublic, currentUser.isInstagramPublic || false);
    checkChange('facebook', facebook.trim(), currentUser.facebook || '');
    checkChange('isFacebookPublic', isFacebookPublic, currentUser.isFacebookPublic || false);
    checkChange('teams', teams.trim(), currentUser.teams || '');
    checkChange('isTeamsPublic', isTeamsPublic, currentUser.isTeamsPublic || false);
    checkChange('mail', mail.trim(), currentUser.mail || '');
    checkChange('isMailPublic', isMailPublic, currentUser.isMailPublic || false);
    
    if (!changed) {
        setSocialsError('No changes to save.');
        return;
    }

    setIsSocialsSaving(true);
    try {
        await updateUser(updates);
        await reloadUser();
        setIsEditingSocials(false);
    } catch (err: any) {
        setSocialsError(err.message || 'Failed to save social links.');
    } finally {
        setIsSocialsSaving(false);
    }
  };

  const handleCancelEditSocials = () => {
      resetSocialsState();
      setIsEditingSocials(false);
  };
  
  const handleProfilePictureChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }
    
    setIsProfilePicUpdating(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        await updateUserProfilePicture(reader.result as string);
        await reloadUser();
      } catch (error) {
        console.error('Failed to update profile picture:', error);
        alert('Failed to update profile picture.');
      } finally {
        setIsProfilePicUpdating(false);
      }
    };
    reader.onerror = () => {
        alert("Failed to read file.");
        setIsProfilePicUpdating(false);
    }
    reader.readAsDataURL(file);
    if(event.target) {
        (event.target as HTMLInputElement).value = '';
    }
  };
  
  const filterAndSetResults = useCallback((term: string, online: boolean, city: string) => {
    let results = allUsers;
    if (term.trim()) results = results.filter(u => u.username.toLowerCase().includes(term.toLowerCase()));
    if (online) results = results.filter(u => u.isOnline);
    if (filterByCity && city.trim()) results = results.filter(u => u.city?.toLowerCase().includes(city.toLowerCase()));
    setSearchResults(results);
  }, [allUsers, filterByCity]);

  useEffect(() => { filterAndSetResults(searchTerm, filterOnlineOnly, cityFilterValue); }, [filterOnlineOnly, filterByCity, cityFilterValue, searchTerm, filterAndSetResults]);

  const handleUserClick = (user: User) => {
    setSearchTerm('');
    setSelectedUserForProfileModal(user);
    setIsMemberProfileModalOpen(true);
  };
  
  const handleStartConversation = (user: User) => {
    setIsMemberProfileModalOpen(false);
    setSelectedUserForProfileModal(null);
    navigate('/chat', { state: { initialUser: user } });
  };
  
  const handleCloseViewSharedPhotoModal = (updatedStatus?: SharedPhotoStatus) => {
      setIsViewSharedPhotoModalOpen(false);
      setSelectedSharedPhotoItem(null);
      fetchAndCombineNotifications();
  };

  const handleViewSharedPhotoFromInbox = (item: SharedPhotoItem) => {
    setSelectedSharedPhotoItem(item);
    setIsViewSharedPhotoModalOpen(true);
    setIsInboxModalOpen(false); 
  };

  const handleCloseSendModal = useCallback(() => {
    setIsSendModalOpen(false);
    setPhotoToSend(null);
  }, []);

  const handleConfirmSend = useCallback(async (recipientUsername: string, duration: number) => {
    if (!currentUser || !photoToSend) return;
    
    const recipientUser = allUsers.find(u => u.username === recipientUsername);
    if (!recipientUser) {
        alert(`User "${recipientUsername}" not found.`);
        return;
    }

    const shareData: Omit<SharedPhotoItem, 'id' | 'sharedAt' | 'expiresAt' | 'status'> = {
      photoId: photoToSend.id,
      photoDataUrl: photoToSend.dataUrl,
      photoCaption: photoToSend.caption,
      senderUserId: currentUser.id,
      senderUsername: currentUser.username,
      recipientUserId: recipientUser.id,
      recipientUsername: recipientUser.username,
      durationSeconds: duration,
    };
    
    try {
      await apiSendPhoto(shareData);
      alert(`Photo sent to ${recipientUser.username}.`);
      fetchAndCombineNotifications();
    } catch (error: any) {
      console.error("Error sending photo:", error);
      alert(`Failed to send photo: ${error.message}.`);
    }

    handleCloseSendModal();
  }, [currentUser, photoToSend, allUsers, handleCloseSendModal, fetchAndCombineNotifications]);
  
  const isSearching = searchTerm.trim() !== '' || filterOnlineOnly || (filterByCity && cityFilterValue.trim() !== '');

  const socialLinksConfig = [
    { id: 'viber', label: 'Viber', Icon: ViberIcon, color: 'text-purple-600', value: viber, isPublic: isViberPublic, onValueChange: setViber, onIsPublicChange: setIsViberPublic },
    { id: 'whatsApp', label: 'WhatsApp', Icon: WhatsAppIcon, color: 'text-green-500', value: whatsApp, isPublic: isWhatsAppPublic, onValueChange: setWhatsApp, onIsPublicChange: setIsWhatsAppPublic },
    { id: 'instagram', label: 'Instagram', Icon: InstagramIcon, color: 'text-pink-500', value: instagram, isPublic: isInstagramPublic, onValueChange: setInstagram, onIsPublicChange: setIsInstagramPublic },
    { id: 'facebook', label: 'Facebook', Icon: FacebookIcon, color: 'text-blue-600', value: facebook, isPublic: isFacebookPublic, onValueChange: setFacebook, onIsPublicChange: setIsFacebookPublic },
    { id: 'teams', label: 'Teams', Icon: TeamsIcon, color: 'text-indigo-500', value: teams, isPublic: isTeamsPublic, onValueChange: setTeams, onIsPublicChange: setIsTeamsPublic },
    { id: 'mail', label: 'Email', Icon: MailIcon, color: 'text-gray-500', value: mail, isPublic: isMailPublic, onValueChange: setMail, onIsPublicChange: setIsMailPublic },
  ];

  const socialLinksForDisplay = currentUser ? [
    { id: 'viber', Icon: ViberIcon, value: currentUser.viber, isPublic: currentUser.isViberPublic, color: 'text-purple-600' },
    { id: 'whatsApp', Icon: WhatsAppIcon, value: currentUser.whatsApp, isPublic: currentUser.isWhatsAppPublic, color: 'text-green-500' },
    { id: 'instagram', Icon: InstagramIcon, value: currentUser.instagram, isPublic: currentUser.isInstagramPublic, color: 'text-pink-500' },
    { id: 'facebook', Icon: FacebookIcon, value: currentUser.facebook, isPublic: currentUser.isFacebookPublic, color: 'text-blue-600' },
    { id: 'teams', Icon: TeamsIcon, value: currentUser.teams, isPublic: currentUser.isTeamsPublic, color: 'text-indigo-500' },
    { id: 'mail', Icon: MailIcon, value: currentUser.mail, isPublic: currentUser.isMailPublic, color: 'text-gray-500' },
  ].filter(link => {
      if(!link.value) return false;
      if(link.id === 'mail') return true;
      return !!link.isPublic;
  }) : [];

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row items-center sm:items-start text-center sm:text-left gap-6">
                        <div className="relative flex-shrink-0 group">
                            {isProfilePicUpdating ? <div className="w-24 h-24 rounded-full bg-gray-200 animate-pulse"></div> :
                                currentUser?.profilePictureUrl ? <img src={currentUser.profilePictureUrl} alt="Profile" className="w-24 h-24 rounded-full object-cover" /> : <UserCircleIcon className="w-24 h-24 text-gray-400" />}
                            <button onClick={() => profilePictureInputRef.current?.click()} className="absolute bottom-0 right-0 bg-gray-700 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                <CameraIcon className="w-4 h-4" />
                            </button>
                            <input type="file" ref={profilePictureInputRef} onChange={handleProfilePictureChange} accept="image/*" className="hidden" />
                        </div>
                        <div className="flex-grow">
                            <h1 className="text-3xl font-bold text-accent-700 dark:text-accent-600 flex items-center justify-center sm:justify-start">
                                {currentUser?.username}
                                <span className={`ml-2 w-3 h-3 rounded-full ${currentUser?.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} title={currentUser?.isOnline ? 'Online' : 'Offline'}></span>
                            </h1>
                            <div className="mt-3 text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                <p>Email: <strong className="font-semibold text-gray-800 dark:text-gray-200">{currentUser?.email}</strong></p>
                                {currentUser?.country && <p>Country: <strong className="font-semibold text-gray-800 dark:text-gray-200">{currentUser.country}</strong></p>}
                                {currentUser?.city && <p>City: <strong className="font-semibold text-gray-800 dark:text-gray-200">{currentUser.city}</strong></p>}
                                <p>Membership: <strong className="font-semibold text-green-600 dark:text-green-400">{getMembershipDisplay(currentUser)}</strong></p>
                            </div>
                             <button onClick={handleToggleOnlineStatus} disabled={isBioUpdating} className={`mt-2 px-3 py-1.5 text-xs font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600`}>
                                {currentUser?.isOnline ? 'Go Offline' : 'Go Online'}
                            </button>
                            {!currentUser?.isEmailVerified && (
                                <button onClick={() => setIsVerificationModalOpen(true)} className={`mt-2 ml-2 px-3 py-1.5 text-xs font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600`}>
                                    Verify Email
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                        <h3 className="font-bold text-lg text-gray-700 dark:text-gray-200 mb-2">Welcome Message</h3>
                        {isEditingBio ? (
                            <div className="animate-fade-in-down">
                                <textarea
                                    value={editableBioText}
                                    onChange={handleBioTextChange}
                                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 focus:ring-accent-500 focus:border-accent-500"
                                    rows={4}
                                    placeholder="Tell us about yourself..."
                                    aria-label="Edit your welcome message"
                                    disabled={isBioUpdating}
                                />
                                <div className="mt-2 flex justify-end space-x-2">
                                    <button onClick={handleCancelEditBio} disabled={isBioUpdating} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md shadow-sm">Cancel</button>
                                    <button onClick={handleSaveBio} disabled={isBioUpdating} className="px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-md shadow-sm">{isBioUpdating ? "Saving..." : "Save Message"}</button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600 min-h-[100px]">
                                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                  {currentUser?.welcomeMessage?.trim() ||
                                   currentUser?.bio?.trim() ||
                                   "No welcome message set."}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
                <div className="space-y-4 pt-0 md:pt-6 md:border-l md:pl-6 border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-lg text-gray-700 dark:text-gray-200">Social Links</h3>
                        {!isEditingSocials && 
                            <button onClick={() => setIsEditingSocials(true)} className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500">
                                <PencilIcon className="w-3 h-3 mr-1" /> Edit
                            </button>
                        }
                    </div>
                    {socialsError && !isEditingSocials && <p className="text-red-500 dark:text-red-400 text-sm text-center">{socialsError}</p>}
                    {isEditingSocials ? (
                        <div className="space-y-4 animate-fade-in-down">
                            {socialsError && <p className="text-red-500 dark:text-red-400 text-sm text-center">{socialsError}</p>}
                            {/* FIX: Replaced spread operator with explicit props to avoid passing unwanted properties like 'color' and to fix type errors. */}
                            {socialLinksConfig.map(link => (
                                <SocialInput
                                    key={link.id}
                                    id={link.id}
                                    label={link.label}
                                    Icon={link.Icon}
                                    value={link.value}
                                    onValueChange={link.onValueChange}
                                    isPublic={link.isPublic}
                                    onIsPublicChange={link.onIsPublicChange}
                                    isSaving={isSocialsSaving}
                                />
                            ))}
                            <div className="flex justify-end space-x-2 pt-2">
                                <button onClick={handleCancelEditSocials} disabled={isSocialsSaving} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md shadow-sm">Cancel</button>
                                <button onClick={handleSaveSocials} disabled={isSocialsSaving} className="px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-md shadow-sm">{isSocialsSaving ? "Saving..." : "Save Socials"}</button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {socialLinksForDisplay.length > 0 ? (
                                // FIX: Destructured props in the map callback to potentially help with TypeScript type inference, addressing a confusing "key" prop error.
                                socialLinksForDisplay.map(({ id, Icon, value, isPublic, color }) => (
                                    <SocialLinkDisplay
                                        key={id}
                                        Icon={Icon}
                                        value={value!}
                                        isPublic={!!isPublic}
                                        color={color}
                                    />
                                ))
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400 italic px-2">No public social links available.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-start gap-3">
              <button onClick={handleEditBioClick} className="inline-flex items-center whitespace-nowrap px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-gray-800"><PencilIcon className="w-4 h-4 mr-1.5" /> Edit Welcome Message</button>
              <button onClick={handleOpenEditDetailsModal} className="inline-flex items-center whitespace-nowrap px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:focus:ring-offset-gray-800"><PencilIcon className="w-4 h-4 mr-1.5" /> Edit Profile Details</button>
              <button onClick={() => setIsInboxModalOpen(true)} className="relative inline-flex items-center whitespace-nowrap px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 dark:focus:ring-offset-gray-800">
                <ChatBubbleLeftRightIcon className="w-4 h-4 mr-1.5" /> Inbox
                {chatNotificationCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white ring-2 ring-white dark:ring-gray-800">
                        {chatNotificationCount > 9 ? '9+' : chatNotificationCount}
                    </span>
                )}
              </button>
              <button
                onClick={handleOpenDonationModal}
                className="inline-flex items-center whitespace-nowrap gap-1.5 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 dark:focus:ring-offset-gray-800"
              >
                <HeartIcon className="w-4 h-4" /> Donate
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">My Photos</h2>
                <button onClick={handleUploadButtonClick} disabled={isUploading} className="inline-flex items-center text-accent-600 bg-gray-200 hover:bg-gray-300 dark:text-accent-400 dark:bg-gray-700 dark:hover:bg-gray-600 font-bold px-4 py-2 rounded-lg shadow-md transition duration-300 text-sm disabled:opacity-50">
                    <UploadIcon className="w-4 h-4 mr-2 inline" />{isUploading ? "Uploading..." : "Upload New Photo"}
                </button>
            </div>
            <input type="file" ref={uploadInputRef} onChange={handleFileSelected} className="hidden" accept="image/*" disabled={isUploading} />
            {isPhotosLoading ? <p>Loading photos...</p> : <PhotoGrid photos={photos} onViewPhoto={handleViewPhoto} onDeletePhoto={handleDelete} onSendPhoto={handleSend} onTogglePhotoPublicStatus={handleTogglePublic} />}
          </div>
        </div>

        <div className="xl:col-span-1 space-y-6">
          <div ref={searchContainerRef} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sm:p-6 border border-gray-200 dark:border-gray-700 sticky top-6 z-20">
            <h3 className="font-bold text-lg text-gray-700 dark:text-gray-200 mb-4">Find Members</h3>
            <div className="relative mb-2">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><SearchIcon className="h-5 w-5 text-gray-400 dark:text-gray-500" /></div>
                <input type="search" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search members..." className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 dark:focus:placeholder-gray-500 focus:ring-1 focus:ring-accent-500 focus:border-accent-500 sm:text-sm" />
            </div>
            <div className="mt-3 space-y-2 sm:space-y-0 sm:flex sm:space-x-4 sm:flex-wrap">
              <div className="flex items-center basis-1/2 sm:basis-auto">
                <input id="filter-online" type="checkbox" checked={filterOnlineOnly} onChange={(e) => setFilterOnlineOnly(e.target.checked)} className="h-4 w-4 text-accent-600 border-gray-300 dark:border-gray-600 rounded focus:ring-accent-500" />
                <label htmlFor="filter-online" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Online Only</label>
              </div>
              <div className="flex items-center basis-1/2 sm:basis-auto">
                <input id="filter-city-toggle" type="checkbox" checked={filterByCity} onChange={(e) => setFilterByCity(e.target.checked)} className="h-4 w-4 text-accent-600 border-gray-300 dark:border-gray-600 rounded focus:ring-accent-500" />
                <label htmlFor="filter-city-toggle" className="ml-2 text-sm text-gray-700 dark:text-gray-300">Filter by City</label>
              </div>
              {filterByCity && <input type="text" value={cityFilterValue} onChange={e => setCityFilterValue(e.target.value)} placeholder="Enter city" className="mt-2 sm:mt-0 block w-full sm:w-auto px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-accent-500 focus:border-accent-500"/>}
            </div>
            <div className="mt-2">
              {isSearching && searchResults.length > 0 && (
                <div className="grid grid-cols-3 gap-2 px-2 pb-2 border-b dark:border-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400">
                    <div className="truncate font-bold">Username</div>
                    <div className="truncate font-bold">City</div>
                    <div className="text-right truncate font-bold">Last Active</div>
                </div>
              )}
              <div className="h-56 overflow-y-auto custom-scrollbar">
                {isSearching && searchResults.length > 0 ? (
                  <ul className="divide-y dark:divide-gray-700">
                    {searchResults.map(user => (
                      <li key={user.id} className="py-2 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer grid grid-cols-3 gap-2 items-center text-sm" onClick={() => handleUserClick(user)}>
                          <span className="flex items-center truncate text-gray-800 dark:text-gray-100">{user.username}{user.isOnline && <span className="ml-2 w-2 h-2 bg-green-500 rounded-full" title="Online"></span>}</span>
                          <span className="truncate text-gray-600 dark:text-gray-400">{user.city || 'N/A'}</span>
                          <span className="truncate text-gray-500 dark:text-gray-400 text-right">{user.updatedAt ? new Date(user.updatedAt).toLocaleDateString() : "N/A"}</span>
                      </li>
                    ))}
                  </ul>
                ) : isSearching ? (
                  <div className="flex items-center justify-center h-full"><p className="text-sm text-gray-500 p-4 text-center">No users found.</p></div>
                ) : (
                  <div className="flex items-center justify-center h-full"><p className="text-sm text-gray-500 p-4 text-center">Start a search to find members.</p></div>
                )}
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-4 sticky top-80">
            <h3 className="font-bold text-lg mb-2">New Members (Last 24h)</h3>
            <div className="h-64 overflow-y-auto custom-scrollbar">
              {newMembers.length > 0 ? (
                <>
                  <div className="grid grid-cols-3 gap-2 px-2 pb-2 border-b dark:border-gray-700 text-xs font-bold text-gray-500 dark:text-gray-400">
                    <div className="truncate font-bold">Username</div>
                    <div className="truncate font-bold">City</div>
                    <div className="text-right truncate font-bold">Last Active</div>
                  </div>
                  <ul className="divide-y dark:divide-gray-700 mt-1">
                    {newMembers.map(user => (
                      <li key={user.id} className="py-2 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer grid grid-cols-3 gap-2 items-center text-sm" onClick={() => handleUserClick(user)}>
                          <span className="flex items-center truncate text-gray-800 dark:text-gray-100">{user.username}{user.isOnline && <span className="ml-2 w-2 h-2 bg-green-500 rounded-full" title="Online"></span>}</span>
                          <span className="truncate text-gray-600 dark:text-gray-400">{user.city || 'N/A'}</span>
                          <span className="truncate text-gray-500 dark:text-gray-400 text-right">{formatLastActive(user)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-gray-500 p-4 text-center">No new members in the last 24 hours.</p>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {selectedPhotoForModal && (
        <ViewMyPhotoModal isOpen={isViewPhotoModalOpen} onClose={handleCloseViewPhotoModal} photo={selectedPhotoForModal} onTogglePublic={handleTogglePublic} onDelete={handleDelete} onSend={handleSend} onReplace={handleReplace} onDeleteComment={handleDeleteComment} onDetailsReload={fetchUserPhotos}/>
      )}

      {isSendModalOpen && photoToSend && (
        <Modal isOpen={isSendModalOpen} onClose={handleCloseSendModal} title={`Send "${photoToSend.caption || "Untitled Photo"}"`}>
            <SendPhotoForm photo={photoToSend} onConfirmSend={handleConfirmSend} onCancel={handleCloseSendModal} availableUsers={allUsers} />
        </Modal>
      )}

      {currentUser && (
        <EditUserDetailsModal isOpen={isEditDetailsModalOpen} onClose={() => setIsEditDetailsModalOpen(false)} currentUser={currentUser} onSave={handleSaveUserDetails} onChangePasswordClick={handleOpenChangePasswordModal} />
      )}
      
      {currentUser && (
        <ChangePasswordModal isOpen={isChangePasswordModalOpen} onClose={() => setIsChangePasswordModalOpen(false)} onSavePassword={handleSavePassword} />
      )}
      
      {selectedUserForProfileModal && (
        <MemberProfileModal isOpen={isMemberProfileModalOpen} onClose={() => { setIsMemberProfileModalOpen(false); setSelectedUserForProfileModal(null); }} user={selectedUserForProfileModal} onStartConversation={handleStartConversation}/>
      )}

      {currentUser && (
        <SharedPhotosInboxModal 
            isOpen={isInboxModalOpen}
            onClose={() => setIsInboxModalOpen(false)}
            currentUser={currentUser}
            onViewSharedPhoto={handleViewSharedPhotoFromInbox}
            onRefreshNotifications={fetchAndCombineNotifications}
        />
      )}

      {isViewSharedPhotoModalOpen && selectedSharedPhotoItem && (
        <ViewSharedPhotoModal isOpen={isViewSharedPhotoModalOpen} onClose={handleCloseViewSharedPhotoModal} sharedPhotoItem={selectedSharedPhotoItem} />
      )}

      {currentUser && (
        <EmailVerificationModal isOpen={isVerificationModalOpen} onClose={() => setIsVerificationModalOpen(false)} currentUser={currentUser} />
      )}

      <Modal isOpen={isDonationModalOpen} onClose={handleCloseDonationModal} title={donationState === 'form' ? "Support DateAstrum.com" : "Thank You!"}>
        {donationState === 'form' ? (
          <div className="text-center space-y-6 p-4">
            <img src="/assets/img/SULogo.jpg" alt="DateAstrum Logo" className="h-24 w-24 mx-auto rounded-full object-cover shadow-lg" />
            <p className="text-lg text-gray-700 dark:text-gray-200">Your support helps us keep the community running and ad-free.</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Thank you for your generosity!</p>
            <div className="flex justify-center">
                <form action="https://www.paypal.com/donate" method="post" target="_blank" onSubmit={handlePaypalSubmit}>
                    <input type="hidden" name="hosted_button_id" value="HXEXRTZSZ2U94" />
                    <input type="image" src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif" name="submit" title="PayPal - The safer, easier way to pay online!" alt="Donate with PayPal button" />
                    <img alt="" src="https://www.paypal.com/en_GR/i/scr/pixel.gif" width="1" height="1" />
                </form>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-6 p-8">
            <h2 className="text-3xl font-bold text-accent-600">Thank You!</h2>
            <p className="text-lg text-gray-700 dark:text-gray-200">Your generosity is what keeps our community thriving. We appreciate your support!</p>
            <button onClick={handleCloseDonationModal} className="mt-4 px-6 py-2 bg-accent-600 text-white rounded-md">Close</button>
          </div>
        )}
      </Modal>

    </div>
  );
};

