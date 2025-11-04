import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import { User, UserUpdatePayload } from '../../shared_types';

const BASE_INTEREST_OPTIONS = ['Full Swap', 'Soft Swap', 'Same room', 'Cuckold'] as const;

interface EditUserDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onSave: (updatedData: UserUpdatePayload) => Promise<void>;
  onChangePasswordClick: () => void;
}

type InterestOption = typeof BASE_INTEREST_OPTIONS[number];

const EditUserDetailsModal: React.FC<EditUserDetailsModalProps> = ({ isOpen, onClose, currentUser, onSave, onChangePasswordClick }) => {
  const [formData, setFormData] = useState<Partial<User>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<InterestOption[]>([]);
  const [isOtherSelected, setIsOtherSelected] = useState(false);
  const [otherInterest, setOtherInterest] = useState('');

  useEffect(() => {
    if (currentUser && isOpen) {
      setFormData({
        welcomeMessage: currentUser.welcomeMessage || '',
        relationshipStatus: currentUser.relationshipStatus || undefined,
        yearsTogether: currentUser.yearsTogether || undefined,
        partner1Age: currentUser.partner1Age || undefined,
        partner2Age: currentUser.partner2Age || undefined,
        city: currentUser.city || '',
        country: currentUser.country || '',
      });

      const interestValue = currentUser.interestsCsv || '';
      if (interestValue) {
        const parts = interestValue
          .split(',')
          .map(part => part.trim())
          .filter(Boolean);

        const recognized: InterestOption[] = [];
        const customParts: string[] = [];
        let sawOtherLabel = false;

        parts.forEach(part => {
          const match = BASE_INTEREST_OPTIONS.find(option => option.toLowerCase() === part.toLowerCase());
          if (match) {
            if (!recognized.includes(match)) {
              recognized.push(match);
            }
            return;
          }

          if (part.toLowerCase() === 'other') {
            sawOtherLabel = true;
            return;
          }

          customParts.push(part);
        });

        setSelectedInterests(recognized);
        if (customParts.length > 0) {
          setIsOtherSelected(true);
          setOtherInterest(customParts.join(', '));
        } else {
          setIsOtherSelected(sawOtherLabel);
          setOtherInterest('');
        }
      } else {
        setSelectedInterests([]);
        setIsOtherSelected(false);
        setOtherInterest('');
      }
      setError('');
    }
  }, [currentUser, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const toggleInterest = (option: InterestOption) => {
    setSelectedInterests(prev => {
      if (prev.includes(option)) {
        return prev.filter(item => item !== option);
      }
      return [...prev, option];
    });
    setError('');
  };

  const handleOtherToggle = () => {
    setIsOtherSelected(prev => {
      const next = !prev;
      if (!next) {
        setOtherInterest('');
      }
      return next;
    });
    setError('');
  };

  const handleOtherInterestChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOtherInterest(e.target.value);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');

    try {
      const trimmedOtherInterest = otherInterest.trim();
      if (isOtherSelected && !trimmedOtherInterest) {
        setError('Please describe your interest.');
        setIsSaving(false);
        return;
      }

      const orderedSelections = BASE_INTEREST_OPTIONS.filter(option => selectedInterests.includes(option));
      // FIX: Explicitly type `interestValues` as `string[]` to allow pushing a generic string.
      const interestValues: string[] = [...orderedSelections];
      if (isOtherSelected && trimmedOtherInterest) {
        interestValues.push(trimmedOtherInterest);
      }

      const payload: UserUpdatePayload = {
        welcomeMessage: formData.welcomeMessage || null,
        relationshipStatus: formData.relationshipStatus || null,
        yearsTogether: formData.yearsTogether ? Number(formData.yearsTogether) : null,
        partner1Age: formData.partner1Age ? Number(formData.partner1Age) : null,
        partner2Age: formData.partner2Age ? Number(formData.partner2Age) : null,
        city: formData.city || null,
        country: formData.country || null,
        interestsCsv: interestValues.length ? interestValues.join(', ') : null,
      };

      await onSave(payload);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const relationshipOptions = ['Marriage', 'Relationship Without Marriage', 'Just Sex Friends'];
  const yearsOptions = Array.from({ length: 31 }, (_, i) => i); // 0 to 30 years

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Profile Details">
      <div className="bg-rose-50 dark:bg-gray-800/50 p-6 rounded-lg">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <p className="text-red-500 text-sm bg-red-100 dark:bg-red-900 p-3 rounded-md text-center">{error}</p>}
          
          <div>
            <label htmlFor="welcomeMessage" className="block text-sm font-medium text-rose-700 dark:text-rose-300">Welcome Message</label>
            <textarea
              id="welcomeMessage"
              name="welcomeMessage"
              value={formData.welcomeMessage || ''}
              onChange={handleChange}
              rows={3}
              className="mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <label htmlFor="relationshipStatus" className="block text-sm font-medium text-rose-700 dark:text-rose-300">Relationship</label>
              <select
                id="relationshipStatus"
                name="relationshipStatus"
                value={formData.relationshipStatus ?? ''}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 h-[42px]"
              >
                <option value="">Select Status</option>
                {relationshipOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="yearsTogether" className="block text-sm font-medium text-rose-700 dark:text-rose-300">Years Together</label>
              <select
                id="yearsTogether"
                name="yearsTogether"
                value={formData.yearsTogether ?? ''}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 h-[42px]"
              >
                  <option value="">Select Years</option>
                  {yearsOptions.map(year => <option key={year} value={year}>{year === 0 ? '< 1 year' : `${year} years`}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="partner1Age" className="block text-sm font-medium text-rose-700 dark:text-rose-300">Partner 1 Age</label>
              <input
                type="number"
                id="partner1Age"
                name="partner1Age"
                value={formData.partner1Age ?? ''}
                onChange={handleChange}
                placeholder="e.g. 40"
                className="mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="partner2Age" className="block text-sm font-medium text-rose-700 dark:text-rose-300">Partner 2 Age</label>
              <input
                type="number"
                id="partner2Age"
                name="partner2Age"
                value={formData.partner2Age ?? ''}
                onChange={handleChange}
                placeholder="e.g. 45"
                className="mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="md:col-span-2">
              <span className="block text-sm font-medium text-rose-700 dark:text-rose-300">Interests</span>
              <div className="mt-2 space-y-2">
                {BASE_INTEREST_OPTIONS.map(option => (
                  <label key={option} className="flex items-center space-x-3 text-sm text-gray-800 dark:text-gray-200">
                    <input
                      type="checkbox"
                      value={option}
                      checked={selectedInterests.includes(option)}
                      onChange={() => toggleInterest(option)}
                      className="text-rose-500 focus:ring-rose-500"
                    />
                    <span>{option}</span>
                  </label>
                ))}
                <label className="flex items-center space-x-3 text-sm text-gray-800 dark:text-gray-200">
                  <input
                    type="checkbox"
                    value="Other"
                    checked={isOtherSelected}
                    onChange={handleOtherToggle}
                    className="text-rose-500 focus:ring-rose-500"
                  />
                  <span>Other</span>
                </label>
              </div>
              {isOtherSelected && (
                <div className="mt-3">
                  <label htmlFor="interestOther" className="block text-sm font-medium text-rose-700 dark:text-rose-300">Tell us more</label>
                  <input
                    type="text"
                    id="interestOther"
                    value={otherInterest}
                    onChange={handleOtherInterestChange}
                    placeholder="Describe your interest"
                    className="mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  />
                  <p className="text-xs text-rose-400 dark:text-rose-500 mt-1">We'll save exactly what you type here.</p>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="city" className="block text-sm font-medium text-rose-700 dark:text-rose-300">City</label>
              <input
                type="text"
                id="city"
                name="city"
                value={formData.city || ''}
                onChange={handleChange}
                placeholder="e.g. Athens"
                className="mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label htmlFor="country" className="block text-sm font-medium text-rose-700 dark:text-rose-300">Country</label>
              <input
                type="text"
                id="country"
                name="country"
                value={formData.country || ''}
                onChange={handleChange}
                placeholder="e.g. Greece"
                className="mt-1 block w-full rounded-md border-rose-300 dark:border-rose-600 shadow-sm focus:border-rose-500 focus:ring-rose-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>

          <div className="pt-5 flex justify-end items-center space-x-3">
            <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200">
              Cancel
            </button>
            <button type="button" onClick={onChangePasswordClick} disabled={isSaving} className="px-4 py-2 text-sm font-medium rounded-md border border-transparent hover:bg-gray-100 dark:hover:bg-gray-600 text-rose-700 dark:text-rose-200">
              Change Password
            </button>
            <button type="submit" disabled={isSaving} className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md shadow-sm disabled:opacity-50">
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default EditUserDetailsModal;