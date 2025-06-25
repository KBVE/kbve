import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { userAtom, syncSupabaseUser } from '../../../layouts/client/supabase/profile/userstate';
import OAuthLogin from '../../../layouts/core/auth/OAuthLogin';

interface ReactMemberOnlyProps {
  children: React.ReactNode;
  /** Custom message for non-authenticated users */
  message?: string;
  /** Whether to show the OAuth login component */
  showOAuth?: boolean;
}

const ReactMemberOnly: React.FC<ReactMemberOnlyProps> = ({ 
  children, 
  message = "You need to be logged in to access this content.",
  showOAuth = true 
}) => {
  const user = useStore(userAtom);
  const [isLoading, setIsLoading] = useState(true);

  // Sync user data on mount and check authentication
  useEffect(() => {
    const checkAuth = async () => {
      await syncSupabaseUser();
      setIsLoading(false);
    };
    
    checkAuth();
  }, []);

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p className="text-zinc-400 text-sm">Checking access...</p>
        </div>
      </div>
    );
  }

  // If user is authenticated, show the protected content
  if (user) {
    return <>{children}</>;
  }

  // If user is not authenticated, show login/register prompt
  return (
    <div className="bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 border border-red-500/20 rounded-lg p-8 backdrop-blur-sm">
      <div className="text-center">
        {/* Access Denied Icon */}
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        {/* Message */}
        <h3 className="text-xl font-bold text-white mb-2">
          Authentication Required
        </h3>
        <p className="text-zinc-300 mb-6">
          {message}
        </p>

        {/* Action Buttons */}
        <div className="space-y-4">
          {showOAuth && (
            <div className="bg-zinc-700/30 rounded-lg p-6">
              <h4 className="text-lg font-semibold text-white mb-4">
                Sign in to continue
              </h4>
              
              {/* OAuth Component */}
              <OAuthLogin showTitle={false} className="mb-4" />
              
              {/* Manual fallback buttons */}
              <div className="space-y-3">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-zinc-600"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-zinc-700 text-neutral-400">or</span>
                  </div>
                </div>
                
                <button 
                  onClick={() => window.location.href = '/auth/login'}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Go to Login Page
                </button>
                
                <button 
                  onClick={() => window.location.href = '/auth/register'}
                  className="w-full bg-zinc-600 hover:bg-zinc-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Create New Account
                </button>
              </div>
            </div>
          )}

          {!showOAuth && (
            <div className="space-x-4">
              <button 
                onClick={() => window.location.href = '/auth/login'}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
              >
                Login
              </button>
              <button 
                onClick={() => window.location.href = '/auth/register'}
                className="bg-zinc-600 hover:bg-zinc-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
              >
                Register
              </button>
            </div>
          )}
        </div>

        {/* Help Text */}
        <div className="mt-6 pt-6 border-t border-zinc-700/50">
          <p className="text-xs text-zinc-500">
            Need help? Visit our{' '}
            <a href="/support" className="text-emerald-400 hover:text-emerald-300 underline">
              Support Center
            </a>
            {' '}or{' '}
            <a href="/contact" className="text-emerald-400 hover:text-emerald-300 underline">
              Contact Us
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ReactMemberOnly;
