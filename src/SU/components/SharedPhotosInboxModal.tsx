import React, { useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import { apiGetReceivedShares, apiGetSentShares, apiUpdatePhotoShareStatus } from '../services/apiService';
import { User, SharedPhotoItem } from '../shared_types';
import { BellIcon } from './icons/BellIcon';

interface SharedPhotosInboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onViewSharedPhoto: (item: SharedPhotoItem) => void;
  onRefreshNotifications: () => void;
}

const SharedPhotosInboxModal: React.FC<SharedPhotosInboxModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onViewSharedPhoto,
  onRefreshNotifications,
}) => {
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [receivedShares, setReceivedShares] = useState<SharedPhotoItem[]>([]);
  const [sentShares, setSentShares] = useState<SharedPhotoItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!currentUser) return;
    setIsLoading(true);
    setError(null);
    try {
      const [received, sent] = await Promise.all([
        apiGetReceivedShares(currentUser.id),
        apiGetSentShares(currentUser.id),
      ]);
      setReceivedShares(received);
      setSentShares(sent);
    } catch (err: any) {
      setError(err.message || 'Failed to load shared photos.');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('received');
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handleUpdateStatus = async (item: SharedPhotoItem, status: 'accepted' | 'denied') => {
    try {
        const updatedItem = await apiUpdatePhotoShareStatus(item.id, status, currentUser.id);
        if(status === 'accepted' && updatedItem) {
          onViewSharedPhoto(updatedItem);
        }
        await fetchData();
        onRefreshNotifications();
    } catch (error: any) {
        setError(error.message || `Failed to ${status} share.`);
    }
  };

  const renderItem = (item: SharedPhotoItem, type: 'received' | 'sent') => {
    const isPendingReceived = type === 'received' && item.status === 'pending';
    const isViewable = type === 'received' && (item.status === 'accepted' || item.status === 'viewed');
    
    return (
      <li key={item.id} className="flex items-center justify-between p-3 bg-white dark:bg-gray-800/50 rounded-xl shadow-sm border border-rose-100 dark:border-gray-700">
        <div className="flex items-center space-x-4 overflow-hidden">
            <img src={item.photoDataUrl} alt="Shared thumbnail" className="w-16 h-16 object-cover rounded-lg flex-shrink-0 bg-gray-200" />
          <div className="overflow-hidden">
            <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">
              {type === 'received' ? `From @${item.senderUsername}` : `To @${item.recipientUsername}`}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 capitalize">Status: {item.status}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
            {isPendingReceived && (
              <>
                <button onClick={() => handleUpdateStatus(item, 'accepted')} className="px-3 py-1 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md shadow-sm">Accept</button>
                <button onClick={() => handleUpdateStatus(item, 'denied')} className="px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md shadow-sm">Deny</button>
              </>
            )}
            {isViewable && (
                 <button onClick={() => onViewSharedPhoto(item)} className="px-6 py-2 text-sm font-bold text-white bg-gradient-to-r from-rose-400 to-pink-500 hover:from-rose-500 hover:to-pink-600 rounded-lg shadow-md transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900">View</button>
            )}
        </div>
      </li>
    );
  };
  
  const currentList = activeTab === 'received' ? receivedShares : sentShares;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="">
      <div className="bg-rose-50 dark:bg-gray-800 p-5 sm:p-6 rounded-lg">
        <div className="flex items-start justify-between mb-4">
            <div className="flex items-center space-x-4">
                <div className="p-3 bg-rose-200 dark:bg-rose-900/50 rounded-lg shadow-inner">
                    <BellIcon className="w-6 h-6 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Shared Photos Inbox</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Photos others sent to you, and photos you sent to others.</p>
                </div>
            </div>
            <button onClick={onClose} className="p-1 text-gray-400 rounded-full hover:bg-rose-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-rose-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        
        <div className="border-b border-rose-200 dark:border-gray-700 mb-4">
            <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                <button
                    onClick={() => setActiveTab('received')}
                    className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'received' 
                        ? 'border-rose-500 text-rose-600 dark:text-rose-400' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-300 dark:hover:border-gray-600'
                    }`}
                >
                    Received
                </button>
                <button
                    onClick={() => setActiveTab('sent')}
                    className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                        activeTab === 'sent' 
                        ? 'border-rose-500 text-rose-600 dark:text-rose-400' 
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:hover:text-gray-300 dark:hover:border-gray-600'
                    }`}
                >
                    Sent
                </button>
            </nav>
        </div>
        
        {error && <p className="text-center text-red-500 dark:text-red-400">{error}</p>}
        
        <div className="max-h-[50vh] min-h-[20vh] overflow-y-auto pr-2 custom-scrollbar">
            {isLoading && <p className="text-center text-gray-500 dark:text-gray-400 py-8">Loading...</p>}
            {!isLoading && !error && (
            <ul className="space-y-3">
                {currentList.length > 0 ? (
                    currentList.map(item => renderItem(item, activeTab))
                ) : (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-10">No {activeTab} photos.</p>
                )}
            </ul>
            )}
        </div>
      </div>
    </Modal>
  );
};

export default SharedPhotosInboxModal;