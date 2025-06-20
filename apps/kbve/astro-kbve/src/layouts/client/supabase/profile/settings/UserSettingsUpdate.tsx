import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { userAtom, syncSupabaseUser } from '../userstate';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';
import { clsx, twMerge } from 'src/utils/tw';
import { User, Mail, Phone, Save, Edit3 } from 'lucide-react';

const UserSettingsUpdate: React.FC = () => {
  const user = useStore(userAtom);
  const [updating, setUpdating] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    displayName: '',
    username: ''
  });

  // Initialize form with current user data
  useEffect(() => {
    if (user) {
      setFormData({
        email: user.email || '',
        phone: user.phone || '',
        displayName: user.user_metadata?.display_name || '',
        username: user.user_metadata?.username || ''
      });
    }
  }, [user]);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const handleUpdateUser = async () => {
    setUpdating(true);
    
    try {
      // Prepare update data
      const updateData: any = {};
      
      // Only include fields that have changed
      if (formData.email !== (user?.email || '')) {
        updateData.email = formData.email;
      }
      
      if (formData.phone !== (user?.phone || '')) {
        updateData.phone = formData.phone;
      }

      // Update user_metadata
      const userData: any = {};
      if (formData.displayName !== (user?.user_metadata?.display_name || '')) {
        userData.display_name = formData.displayName;
      }
      if (formData.username !== (user?.user_metadata?.username || '')) {
        userData.username = formData.username;
      }

      if (Object.keys(userData).length > 0) {
        updateData.data = userData;
      }

      // Only proceed if there are changes
      if (Object.keys(updateData).length === 0) {
        showMessage('No changes to save.', 'error');
        return;
      }

      const { data, error } = await supabase.auth.updateUser(updateData);

      if (error) {
        showMessage(`Failed to update profile: ${error.message}`, 'error');
      } else {
        showMessage('Profile updated successfully!', 'success');
        // Sync user data to update the store
        await syncSupabaseUser();
      }
    } catch (err) {
      showMessage('An unexpected error occurred while updating your profile.', 'error');
    } finally {
      setUpdating(false);
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div
      className={twMerge(
        'rounded-2xl p-6 shadow-xl',
        'bg-white dark:bg-neutral-800',
        'border border-neutral-300 dark:border-neutral-600',
        'backdrop-blur-sm'
      )}
    >
      {/* Message Display */}
      {message && (
        <div
          className={twMerge(
            'p-3 rounded-lg border mb-4',
            message.type === 'success' 
              ? 'bg-green-100 border-green-300 text-green-800 dark:bg-green-900/50 dark:border-green-600 dark:text-green-300'
              : 'bg-red-100 border-red-300 text-red-800 dark:bg-red-900/50 dark:border-red-600 dark:text-red-300'
          )}
        >
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <Edit3 className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">
          Update Profile Information
        </h3>
      </div>

      <div className="space-y-6">
        {/* Email Field */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
            <Mail className="w-4 h-4" />
            Email Address
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            placeholder="Enter your email address"
            className={twMerge(
              'w-full p-3 rounded-lg border',
              'bg-neutral-50 dark:bg-neutral-700',
              'border-neutral-300 dark:border-neutral-600',
              'text-neutral-900 dark:text-neutral-100',
              'placeholder-neutral-500 dark:placeholder-neutral-400',
              'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent',
              'transition-colors duration-200'
            )}
          />
          {!user.email && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              Adding an email will require verification
            </p>
          )}
        </div>

        {/* Phone Field */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
            <Phone className="w-4 h-4" />
            Phone Number
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="Enter your phone number"
            className={twMerge(
              'w-full p-3 rounded-lg border',
              'bg-neutral-50 dark:bg-neutral-700',
              'border-neutral-300 dark:border-neutral-600',
              'text-neutral-900 dark:text-neutral-100',
              'placeholder-neutral-500 dark:placeholder-neutral-400',
              'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent',
              'transition-colors duration-200'
            )}
          />
        </div>

        {/* Display Name Field */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
            <User className="w-4 h-4" />
            Display Name
          </label>
          <input
            type="text"
            value={formData.displayName}
            onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
            placeholder="Enter your display name"
            className={twMerge(
              'w-full p-3 rounded-lg border',
              'bg-neutral-50 dark:bg-neutral-700',
              'border-neutral-300 dark:border-neutral-600',
              'text-neutral-900 dark:text-neutral-100',
              'placeholder-neutral-500 dark:placeholder-neutral-400',
              'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent',
              'transition-colors duration-200'
            )}
          />
        </div>

        {/* Username Field */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
            <User className="w-4 h-4" />
            Username
          </label>
          <input
            type="text"
            value={formData.username}
            onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
            placeholder="Enter your username"
            className={twMerge(
              'w-full p-3 rounded-lg border',
              'bg-neutral-50 dark:bg-neutral-700',
              'border-neutral-300 dark:border-neutral-600',
              'text-neutral-900 dark:text-neutral-100',
              'placeholder-neutral-500 dark:placeholder-neutral-400',
              'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent',
              'transition-colors duration-200'
            )}
          />
          <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
            Username will be used for profile identification
          </p>
        </div>

        {/* Save Button */}
        <div className="pt-4 border-t border-neutral-200 dark:border-neutral-700">
          <button
            onClick={handleUpdateUser}
            disabled={updating}
            className={twMerge(
              'inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium',
              'bg-gradient-to-r from-blue-500 to-blue-600 text-white',
              'hover:from-blue-600 hover:to-blue-700 transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'shadow-lg hover:shadow-xl transition-shadow duration-200'
            )}
          >
            <Save className="w-4 h-4" />
            {updating ? 'Updating...' : 'Save Changes'}
          </button>
        </div>

        {/* Information Notice */}
        <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-1">Profile Update Notes:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Email changes require verification before taking effect</li>
              <li>Phone number changes may require SMS verification</li>
              <li>Display name and username updates are immediate</li>
              <li>Web3 wallet address cannot be changed</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserSettingsUpdate;
