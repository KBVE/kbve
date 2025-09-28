import React, { useState } from 'react';
import { useStore } from '@nanostores/react';
import { userAtom, syncSupabaseUser } from '../userstate';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';
import { clsx, twMerge } from 'src/utils/tw';
import { Link, Github, MessageCircle, Mail, AlertTriangle } from 'lucide-react';

const UserLinkIdentity: React.FC = () => {
  const user = useStore(userAtom);
  const [linking, setLinking] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showMessage = (text: string, type: 'success' | 'error' | 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 7000);
  };

  // Check if user is Web3 and has no email
  const isWeb3User = user?.app_metadata?.provider === 'web3';
  const hasEmail = user?.email;

  // Don't show this component if user already has email or isn't Web3
  if (!isWeb3User || hasEmail) {
    return null;
  }

  const handleLinkIdentity = async (provider: 'github' | 'discord') => {
    setLinking(provider);
    
    try {
      const { data, error } = await supabase.auth.linkIdentity({
        provider: provider,
        options: {
          redirectTo: window.location.origin + '/settings'
        }
      });

      if (error) {
        showMessage(`Failed to link ${provider}: ${error.message}`, 'error');
      } else if (data?.url) {
        showMessage(`Redirecting to ${provider} for account linking...`, 'info');
        window.location.href = data.url;
      }
    } catch (err) {
      showMessage(`An unexpected error occurred while linking ${provider}.`, 'error');
    } finally {
      setLinking(null);
    }
  };

  return (
    <div
      className={twMerge(
        'rounded-2xl p-6 shadow-xl',
        'bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50',
        'border-2 border-amber-300 dark:border-amber-600',
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
              : message.type === 'error'
              ? 'bg-red-100 border-red-300 text-red-800 dark:bg-red-900/50 dark:border-red-600 dark:text-red-300'
              : 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/50 dark:border-blue-600 dark:text-blue-300'
          )}
        >
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <Link className="w-6 h-6 text-amber-600 dark:text-amber-400" />
        <h3 className="text-xl font-semibold text-amber-900 dark:text-amber-100">
          Link Additional Identity
        </h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 bg-amber-100/50 dark:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-700">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-semibold mb-1">Web3 Account Detected</p>
            <p>
              Your account was created using a Web3 wallet and doesn't have an email address. 
              Link a social account to add email functionality and enable additional features.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-lg font-medium text-amber-900 dark:text-amber-100">
            Available Identity Providers
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* GitHub Link */}
            <button
              onClick={() => handleLinkIdentity('github')}
              disabled={linking !== null}
              className={twMerge(
                'flex items-center gap-3 p-4 rounded-lg border-2 transition-all duration-200',
                'bg-white dark:bg-neutral-800',
                'border-neutral-300 dark:border-neutral-600',
                'hover:border-neutral-400 dark:hover:border-neutral-500',
                'focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                linking === 'github' && 'border-amber-400 dark:border-amber-500'
              )}
            >
              <Github className="w-6 h-6 text-neutral-700 dark:text-neutral-300" />
              <div className="text-left">
                <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {linking === 'github' ? 'Linking GitHub...' : 'Link GitHub'}
                </div>
                <div className="text-sm text-neutral-600 dark:text-neutral-400">
                  Connect your GitHub account
                </div>
              </div>
            </button>

            {/* Discord Link */}
            <button
              onClick={() => handleLinkIdentity('discord')}
              disabled={linking !== null}
              className={twMerge(
                'flex items-center gap-3 p-4 rounded-lg border-2 transition-all duration-200',
                'bg-white dark:bg-neutral-800',
                'border-neutral-300 dark:border-neutral-600',
                'hover:border-neutral-400 dark:hover:border-neutral-500',
                'focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                linking === 'discord' && 'border-amber-400 dark:border-amber-500'
              )}
            >
              <MessageCircle className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              <div className="text-left">
                <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {linking === 'discord' ? 'Linking Discord...' : 'Link Discord'}
                </div>
                <div className="text-sm text-neutral-600 dark:text-neutral-400">
                  Connect your Discord account
                </div>
              </div>
            </button>
          </div>
        </div>

        <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-semibold mb-1">Benefits of Linking</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Add email address to your account</li>
                <li>Enable email notifications and recovery</li>
                <li>Access member features requiring verified email</li>
                <li>Keep your Web3 wallet as primary authentication</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserLinkIdentity;
