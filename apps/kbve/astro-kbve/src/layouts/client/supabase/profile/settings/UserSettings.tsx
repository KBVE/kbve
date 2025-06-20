import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { userAtom, userLoadingAtom, userErrorAtom, syncSupabaseUser } from '../userstate';
import { clsx, twMerge } from 'src/utils/tw';
import { Settings, Mail, Shield, User, Save } from 'lucide-react';
import UserLinkIdentity from './UserLinkIdentity';
import UserSettingsUpdate from './UserSettingsUpdate';

const UserSettings: React.FC = () => {
  const user = useStore(userAtom);
  const loading = useStore(userLoadingAtom);
  const error = useStore(userErrorAtom);
  
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const loadUserData = async () => {
      userLoadingAtom.set(true);
      userErrorAtom.set("");
      try {
        await syncSupabaseUser();
      } catch (err) {
        userErrorAtom.set(err instanceof Error ? err.message : 'Failed to load user data');
      } finally {
        userLoadingAtom.set(false);
      }
    };
    
    loadUserData();
  }, []);

  const showMessage = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center text-neutral-600 dark:text-neutral-300">
          Loading settings...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-red-500 text-center">{error}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center text-neutral-600 dark:text-neutral-300">
          Please log in to access settings.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Message Display */}
      {message && (
        <div
          className={twMerge(
            'p-4 rounded-lg border',
            message.type === 'success' 
              ? 'bg-green-100/50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-600 dark:text-green-300'
              : 'bg-red-100/50 border-red-300 text-red-800 dark:bg-red-900/30 dark:border-red-600 dark:text-red-300'
          )}
        >
          {message.text}
        </div>
      )}

      {/* Account Information Section */}
      <div
        className={twMerge(
          'rounded-2xl p-6 shadow-xl',
          'bg-white dark:bg-neutral-800',
          'border border-neutral-300 dark:border-neutral-600',
          'backdrop-blur-sm'
        )}
      >
        <div className="flex items-center gap-3 mb-6">
          <User className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
          <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">
            Account Information
          </h3>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
                User ID
              </label>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-700 rounded-lg font-mono text-sm text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-600">
                {user.id}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
                Account Created
              </label>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-700 rounded-lg text-sm text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-600">
                {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Email Settings Section */}
      <div
        className={twMerge(
          'rounded-2xl p-6 shadow-xl',
          'bg-white dark:bg-neutral-800',
          'border border-neutral-300 dark:border-neutral-600',
          'backdrop-blur-sm'
        )}
      >
        <div className="flex items-center gap-3 mb-6">
          <Mail className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">
            Email Settings
          </h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
              Email Address
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 p-3 bg-neutral-50 dark:bg-neutral-700 rounded-lg text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-600">
                {user.email || 'No email address set'}
              </div>
              {user.email_confirmed_at ? (
                <span className="px-3 py-1 bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 rounded-full text-xs font-medium border border-green-200 dark:border-green-700">
                  Verified
                </span>
              ) : (
                <span className="px-3 py-1 bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200 rounded-full text-xs font-medium border border-amber-200 dark:border-amber-700">
                  Unverified
                </span>
              )}
            </div>
          </div>

          {!user.email_confirmed_at && user.email && (
            <button
              onClick={async () => {
                setSaving(true);
                try {
                  const { error } = await import('src/layouts/client/supabase/supabaseClient').then(
                    ({ supabase }) => supabase.auth.resend({ 
                      type: 'signup', 
                      email: user.email! 
                    })
                  );
                  if (error) {
                    showMessage('Failed to resend verification email: ' + error.message, 'error');
                  } else {
                    showMessage('Verification email sent! Please check your inbox.', 'success');
                  }
                } catch (err) {
                  showMessage('An unexpected error occurred.', 'error');
                } finally {
                  setSaving(false);
                }
              }}
              disabled={saving}
              className={twMerge(
                'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
                'bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium',
                'hover:from-purple-600 hover:to-purple-700 transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-offset-2',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              <Mail className="w-4 h-4" />
              {saving ? 'Sending...' : 'Resend Verification Email'}
            </button>
          )}
        </div>
      </div>

      {/* Security Section */}
      <div
        className={twMerge(
          'rounded-2xl p-6 shadow-xl',
          'bg-white dark:bg-neutral-800',
          'border border-neutral-300 dark:border-neutral-600',
          'backdrop-blur-sm'
        )}
      >
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-6 h-6 text-green-600 dark:text-green-400" />
          <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">
            Security & Authentication
          </h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
              Authentication Method
            </label>
            <div className="p-3 bg-neutral-50 dark:bg-neutral-700 rounded-lg border border-neutral-200 dark:border-neutral-600">
              {user.app_metadata?.provider === 'web3' ? (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 dark:bg-purple-800 dark:text-purple-200 rounded text-xs font-medium border border-purple-200 dark:border-purple-700">
                    Web3
                  </span>
                  <span className="text-sm text-neutral-900 dark:text-neutral-100">
                    {user.user_metadata?.custom_claims?.chain === 'solana' ? 'Solana Wallet' : 'Web3 Wallet'}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-800 dark:text-blue-200 rounded text-xs font-medium border border-blue-200 dark:border-blue-700">
                    OAuth
                  </span>
                  <span className="text-sm capitalize text-neutral-900 dark:text-neutral-100">
                    {user.app_metadata?.provider || 'Standard'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Show wallet address for Web3 users */}
          {user.user_metadata?.custom_claims?.address && (
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
                Connected Wallet
              </label>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-700 rounded-lg font-mono text-sm break-all text-neutral-900 dark:text-neutral-100 border border-neutral-200 dark:border-neutral-600">
                {user.user_metadata.custom_claims.address}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Web3 Identity Linking Section - Only for Web3 users without email */}
      <UserLinkIdentity />

      {/* User Profile Update Section */}
      <UserSettingsUpdate />
    </div>
  );
};

export default UserSettings;
