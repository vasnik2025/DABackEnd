import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Modal from './Modal';
import PhotoGrid from './PhotoGrid';
import { apiGetUserPhotos } from '../services/apiService';
import { User, Photo } from '../../shared_types';
import { UserCircleIcon } from './icons/UserCircleIcon';
import { ChatBubbleLeftRightIcon } from './icons/ChatBubbleLeftRightIcon';
import ViewPublicPhotoModal from './ViewPublicPhotoModal';
import { useAuth } from '../hooks/useAuth';
import { ViberIcon } from './icons/ViberIcon';
import { WhatsAppIcon } from './icons/WhatsAppIcon';
import { InstagramIcon } from './icons/InstagramIcon';
import { FacebookIcon } from './icons/FacebookIcon';
import { TeamsIcon } from './icons/TeamsIcon';
import { MailIcon } from './icons/MailIcon';

interface MemberProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onStartConversation: (user: User) => void;
}

const DETAIL_INTEREST_OPTIONS = ['Full Swap', 'Soft Swap', 'Same room', 'Cuckold'] as const;

type DetailInterest = typeof DETAIL_INTEREST_OPTIONS[number];

const normalizeInterests = (interestsCsv?: string | null): string[] => {
  if (!interestsCsv) return [];

  const tokens = interestsCsv
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  if (!tokens.length) return [];

  const recognized = DETAIL_INTEREST_OPTIONS.filter(option =>
    tokens.some(token => token.toLowerCase() === option.toLowerCase())
  );

  const extras = tokens.filter(token => {
    const normalized = token.toLowerCase();
    if (normalized === 'other') return false;
    return !DETAIL_INTEREST_OPTIONS.some(option => option.toLowerCase() === normalized);
  });

  const uniqueExtras = Array.from(new Set(extras));

  return [...recognized, ...uniqueExtras];
};

const DetailCard = ({ label, value }: { label: string; value: React.ReactNode }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="bg-white/70 dark:bg-gray-700/60 border border-rose-100 dark:border-gray-600 rounded-2xl p-4 shadow-sm">
      <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wide">{label}</p>
      <div className="mt-1 text-base font-semibold text-gray-900 dark:text-gray-100 whitespace-pre-line break-words">{value}</div>
    </div>
  );
};

const getMembershipStatus = (user: User): string => {
  const getTrialDaysRemaining = (expiryDateString?: string | null): number | null => {
    if (!expiryDateString) return null;
    const expiryDate = new Date(expiryDateString);
    const today = new Date();
    const diffTime = expiryDate.getTime() - today.getTime();
    if (diffTime < 0) return 0;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  if (user.membershipType === 'unlimited' || user.membershipType === 'platinum') {
    return 'Premium';
  }
  if (user.membershipType === 'trial') {
    const days = getTrialDaysRemaining(user.membershipExpiryDate);
    if (days !== null && days > 0) {
      return 'Trial';
    }
  }
  return 'Free';
};

const MemberProfileModal: React.FC<MemberProfileModalProps> = ({
  isOpen,
  onClose,
  user,
  onStartConversation,
}) => {
  const { currentUser } = useAuth();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [selectedPhotoForModal, setSelectedPhotoForModal] = useState<Photo | null>(null);
  const [isViewPublicPhotoModalOpen, setIsViewPublicPhotoModalOpen] = useState(false);
  const isViewingOwnProfile = currentUser?.id === user.id;
  const viewerMembershipType = String(
    currentUser?.membershipType ?? (currentUser as any)?.MembershipType ?? '',
  ).trim().toLowerCase();
  const viewerMembershipExpiry = currentUser?.membershipExpiryDate
    ? new Date(currentUser.membershipExpiryDate)
    : null;
  const viewerMembershipExpired =
    viewerMembershipExpiry instanceof Date && !Number.isNaN(viewerMembershipExpiry.getTime())
      ? viewerMembershipExpiry.getTime() <= Date.now()
      : false;
  const viewerIsPlatinum =
    (viewerMembershipType === 'platinum' || viewerMembershipType === 'unlimited') &&
    !viewerMembershipExpired;
  const isViewerLimitedToSinglePhoto = !isViewingOwnProfile && !viewerIsPlatinum;
  const visiblePhotos = useMemo(
    () => (isViewerLimitedToSinglePhoto ? photos.slice(0, 1) : photos),
    [photos, isViewerLimitedToSinglePhoto],
  );
  const hiddenPhotoCount = isViewerLimitedToSinglePhoto ? Math.max(photos.length - visiblePhotos.length, 0) : 0;

  const fetchUserPublicPhotos = useCallback(async () => {
    if (!user) return;
    setIsLoadingPhotos(true);
    setPhotoError(null);
    try {
      const userPhotos = await apiGetUserPhotos(user.id);
      setPhotos(userPhotos.filter(p => p.isPublic === true));
    } catch (error: any) {
      console.error("Failed to fetch user's public photos:", error);
      setPhotoError(error.message || "Could not load photos.");
    } finally {
      setIsLoadingPhotos(false);
    }
  }, [user]);

  useEffect(() => {
    if (isOpen && user) {
      fetchUserPublicPhotos();
    } else {
      setPhotos([]);
    }
  }, [isOpen, user, fetchUserPublicPhotos]);

  const handleViewPhoto = useCallback((photo: Photo) => {
    setSelectedPhotoForModal(photo);
    setIsViewPublicPhotoModalOpen(true);
  }, []);

  const handleCloseViewPublicPhotoModal = useCallback(() => {
    setIsViewPublicPhotoModalOpen(false);
    setSelectedPhotoForModal(null);
  }, []);

  const socialLinks = [
    { key: 'viber', handle: user.viber, isPublic: user.isViberPublic, Icon: ViberIcon, color: 'text-purple-600' },
    { key: 'whatsApp', handle: user.whatsApp, isPublic: user.isWhatsAppPublic, Icon: WhatsAppIcon, color: 'text-green-500' },
    { key: 'instagram', handle: user.instagram, isPublic: user.isInstagramPublic, Icon: InstagramIcon, color: 'text-pink-600' },
    { key: 'facebook', handle: user.facebook, isPublic: user.isFacebookPublic, Icon: FacebookIcon, color: 'text-blue-600' },
    { key: 'teams', handle: user.teams, isPublic: user.isTeamsPublic, Icon: TeamsIcon, color: 'text-indigo-500' },
    { key: 'mail', handle: user.mail, isPublic: user.isMailPublic, Icon: MailIcon, color: 'text-gray-500' }
  ].filter(link => link.handle && link.isPublic);

  const formatAge = () => {
    if (user.partner1Age && user.partner2Age) {
      return `${user.partner1Age} & ${user.partner2Age}`;
    }
    if (user.age) {
      return user.age;
    }
    return null;
  };

  const formatLocation = () => {
    if (user.city && user.country) {
      return `${user.city}, ${user.country}`;
    }
    return user.city || user.country || null;
  };

  const interests = useMemo(() => normalizeInterests(user.interestsCsv), [user.interestsCsv]);

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={`${user.username}'s Profile`}>
        <div className="space-y-6">
          {/* User Details Section */}
          <div className="flex flex-col sm:flex-row items-center p-4 bg-rose-50 dark:bg-gray-700/50 rounded-lg">
            {user.profilePictureUrl ? (
              <img src={user.profilePictureUrl} alt={user.username} className="w-24 h-24 rounded-full object-cover mr-0 sm:mr-6 mb-4 sm:mb-0 border-2 border-rose-300 dark:border-rose-600"/>
            ) : (
              <UserCircleIcon className="w-24 h-24 text-gray-400 dark:text-gray-500 mr-0 sm:mr-6 mb-4 sm:mb-0"/>
            )}
            <div className="text-center sm:text-left">
              <h3 className="text-2xl font-bold text-rose-700 dark:text-rose-500 flex items-center justify-center sm:justify-start">
                {user.username}
                {user.isOnline && <span className="ml-2 w-3 h-3 bg-green-500 rounded-full" title="Online"></span>}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">{user.email}</p>
              {user.welcomeMessage && <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 max-h-20 overflow-y-auto custom-scrollbar">{user.welcomeMessage}</p>}
            </div>
          </div>

          {/* Details Grid */}
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <DetailCard label="Relationship" value={user.relationshipStatus || 'Not shared'} />
              <DetailCard label="Years Together" value={user.yearsTogether === 0 ? '< 1 year' : user.yearsTogether} />
              <DetailCard label="Age(s)" value={formatAge() || 'Not shared'} />
              <DetailCard label="Gender" value={user.gender || 'Not shared'} />
              <DetailCard label="Location" value={formatLocation() || 'Not shared'} />
              <DetailCard label="Membership" value={getMembershipStatus(user)} />
            </div>

            <div className="bg-white/70 dark:bg-gray-700/60 border border-rose-100 dark:border-gray-600 rounded-2xl p-4 shadow-sm">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">Interests</h4>
              {interests.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {interests.map(item => (
                    <span key={item} className="inline-flex items-center rounded-full bg-rose-100/90 text-rose-700 px-3 py-1 text-sm font-medium dark:bg-rose-800/40 dark:text-rose-200">{item}</span>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">This member hasn't shared interests yet.</p>
              )}
            </div>
          </div>

          {/* Social Links Section */}
          {socialLinks.length > 0 && (
            <div>
              <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Contact Info</h4>
              <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                <ul className="space-y-2">
                  {socialLinks.map(({ key, handle, Icon, color }) => (
                    <li key={key} className="flex items-center">
                      <Icon className={`w-5 h-5 mr-3 flex-shrink-0 ${color}`}/>
                      <span className="text-gray-700 dark:text-gray-200 truncate">{handle}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Public Photos Section */}
          <div>
            <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Public Photos</h4>
            {isLoadingPhotos ? (
              <p className="text-center text-gray-500 dark:text-gray-400">Loading photos...</p>
            ) : photoError ? (
              <p className="text-center text-red-500 dark:text-red-400">{photoError}</p>
            ) : visiblePhotos.length > 0 ? (
              <div className="max-h-80 overflow-y-auto custom-scrollbar border border-gray-200 dark:border-gray-700 rounded-md p-2">
                <PhotoGrid photos={visiblePhotos} onViewPhoto={handleViewPhoto} showActions={false}/>
              </div>
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 py-4">This member has no public photos.</p>
            )}
            {hiddenPhotoCount > 0 && (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-700/60 dark:bg-rose-900/40 dark:text-rose-100">
                This couple shared {hiddenPhotoCount} more photo{hiddenPhotoCount === 1 ? '' : 's'}. Upgrade to Platinum to unlock their full gallery.
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row justify-end space-y-3 sm:space-y-0 sm:space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => onStartConversation(user)}
              className="flex items-center justify-center px-4 py-2 text-sm font-medium text-rose-600 bg-rose-100 hover:bg-rose-200 dark:text-rose-300 dark:bg-rose-800/50 dark:hover:bg-rose-700/50 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-500 dark:focus:ring-offset-gray-800"
            >
              <ChatBubbleLeftRightIcon className="w-4 h-4 mr-2"/>
              Message
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 dark:focus:ring-offset-gray-800"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
      {selectedPhotoForModal && currentUser && (
        <ViewPublicPhotoModal
          isOpen={isViewPublicPhotoModalOpen}
          onClose={handleCloseViewPublicPhotoModal}
          photo={selectedPhotoForModal}
          currentUser={currentUser}
        />
      )}
    </>
  );
};

export default MemberProfileModal;
