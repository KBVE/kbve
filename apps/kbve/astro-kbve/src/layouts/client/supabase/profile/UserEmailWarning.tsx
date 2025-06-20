import React from 'react';
import { useStore } from '@nanostores/react';
import { userAtom } from './userstate';
import { clsx, twMerge } from 'src/utils/tw';
import { AlertTriangle, Mail } from 'lucide-react';

const UserEmailWarning: React.FC = () => {
  const user = useStore(userAtom);

  // Check if user has a verified email
  const hasValidEmail = user?.email && user?.email_confirmed_at;
  const hasUnverifiedEmail = user?.email && !user?.email_confirmed_at;

  // Don't render if user has a valid verified email
  if (hasValidEmail) {
    return null;
  }

  return (
    <div
      className={twMerge(
        'flex flex-col items-center justify-center gap-4 p-6 rounded-xl',
        'bg-gradient-to-br from-amber-100/80 to-red-100/60 dark:from-amber-900/40 dark:to-red-900/30',
        'border-2 border-amber-300 dark:border-amber-600',
        'shadow-lg'
      )}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
        <Mail className="w-8 h-8 text-red-600 dark:text-red-400" />
      </div>
      
      <div className="text-center space-y-2">
        <h3 className="text-xl font-bold text-amber-800 dark:text-amber-200">
          Email Verification Required
        </h3>
        
        {!user?.email ? (
          <p className="text-amber-700 dark:text-amber-300">
            No email address found on your account. A verified email is required to access member features.
          </p>
        ) : hasUnverifiedEmail ? (
          <p className="text-amber-700 dark:text-amber-300">
            Your email address <span className="font-semibold">{user.email}</span> needs to be verified before you can access member features.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        {!user?.email ? (
          <a
            href="/settings"
            className={twMerge(
              'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
              'bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold',
              'hover:from-blue-600 hover:to-blue-700 transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2'
            )}
          >
            <Mail className="w-4 h-4" />
            Add Email Address
          </a>
        ) : (
          <button
            onClick={async () => {
              // Resend verification email
              const { error } = await import('src/layouts/client/supabase/supabaseClient').then(
                ({ supabase }) => supabase.auth.resend({ 
                  type: 'signup', 
                  email: user.email! 
                })
              );
              if (error) {
                alert('Failed to resend verification email: ' + error.message);
              } else {
                alert('Verification email sent! Please check your inbox.');
              }
            }}
            className={twMerge(
              'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg',
              'bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold',
              'hover:from-green-600 hover:to-green-700 transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-2'
            )}
          >
            <Mail className="w-4 h-4" />
            Resend Verification Email
          </button>
        )}
        
        <p className="text-xs text-amber-600 dark:text-amber-400 text-center">
          Member onboarding will be available once your email is verified.
        </p>
      </div>
    </div>
  );
};

export default UserEmailWarning;
