import React, { useState, useEffect, useCallback } from 'react';
import Modal from './Modal';
import { apiUpdatePhotoShareStatus } from '../services/apiService';
import { SharedPhotoItem, SharedPhotoStatus } from '../shared_types';
import { useAuth } from '../hooks/useAuth';

interface ViewSharedPhotoModalProps {
    isOpen: boolean;
    onClose: (updatedStatus: SharedPhotoStatus) => void;
    sharedPhotoItem: SharedPhotoItem;
}

const ViewSharedPhotoModal: React.FC<ViewSharedPhotoModalProps> = ({ isOpen, onClose, sharedPhotoItem }) => {
    const { currentUser } = useAuth();
    const [timeLeft, setTimeLeft] = useState(sharedPhotoItem.durationSeconds);
    const [isFadingOut, setIsFadingOut] = useState(false);

    const updateShareStatus = useCallback(async (status: 'viewed' | 'expired') => {
        if (!currentUser) return;
        try {
            await apiUpdatePhotoShareStatus(sharedPhotoItem.id, status, currentUser.id);
        } catch (error) {
            console.error(`Failed to update share status to ${status}:`, error);
        }
    }, [sharedPhotoItem.id, currentUser]);

    const handleCloseWithFade = useCallback((status: SharedPhotoStatus) => {
        setIsFadingOut(true);
        setTimeout(() => {
            onClose(status);
            setIsFadingOut(false);
        }, 300); // Match modal fade-out duration
    }, [onClose]);

    // FIX: Replaced NodeJS.Timeout with inferred type from setInterval and improved effect cleanup logic to resolve browser type errors and enhance safety.
    useEffect(() => {
        if (isOpen) {
            setTimeLeft(sharedPhotoItem.durationSeconds);
            if (sharedPhotoItem.status === 'accepted') {
                updateShareStatus('viewed');
            }

            const timer = setInterval(() => {
                setTimeLeft(prevTime => {
                    if (prevTime <= 1) {
                        clearInterval(timer);
                        updateShareStatus('expired');
                        handleCloseWithFade('expired');
                        return 0;
                    }
                    return prevTime - 1;
                });
            }, 1000);

            return () => {
                clearInterval(timer);
            };
        }
    }, [isOpen, sharedPhotoItem.durationSeconds, sharedPhotoItem.status, updateShareStatus, handleCloseWithFade]);

    if (!isOpen && !isFadingOut) return null;

    return (
        <Modal 
            isOpen={isOpen} 
            onClose={() => handleCloseWithFade(timeLeft <= 0 ? 'expired' : sharedPhotoItem.status)} 
            title={`From @${sharedPhotoItem.senderUsername}: ${sharedPhotoItem.photoCaption || 'Shared Photo'}`}
            isFadingOut={isFadingOut}
        >
            <div className="text-center p-2 relative bg-rose-50 dark:bg-gray-800 rounded-b-lg">
                <div className="mb-4 bg-rose-100 dark:bg-rose-900/50 border-l-4 border-rose-500 dark:border-rose-400 text-rose-800 dark:text-rose-200 p-3 rounded-md text-left">
                    <p className="font-semibold text-sm">Privacy Advisory</p>
                    <p className="text-xs">
                        This is a temporary view. Please respect the sender's privacy. Do not copy or save this content.
                    </p>
                </div>

                {sharedPhotoItem.photoDataUrl ? (
                    <img
                        src={sharedPhotoItem.photoDataUrl}
                        alt={sharedPhotoItem.photoCaption || 'Shared content'}
                        className="max-w-full max-h-[60vh] object-contain mx-auto rounded-md mb-3 shadow-lg"
                    />
                ) : (
                    <div className="h-60 flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded-md">
                      <p className="text-gray-500 dark:text-gray-400">Photo data is not available.</p>
                    </div>
                )}

                <div className="mt-4 p-3 bg-white dark:bg-gray-700/50 rounded-lg shadow-inner">
                    {timeLeft > 0 ? (
                        <p className="text-lg font-bold text-rose-600 dark:text-rose-400">
                            Closes in: <span className="text-2xl tabular-nums w-10 inline-block">{timeLeft}s</span>
                        </p>
                    ) : (
                        <p className="text-lg font-bold text-red-600 dark:text-red-500">Viewing time expired.</p>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ViewSharedPhotoModal;