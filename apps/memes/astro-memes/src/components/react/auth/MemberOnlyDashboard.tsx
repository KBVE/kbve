import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { userAtom, syncSupabaseUser } from '../../../layouts/client/supabase/profile/userstate';
import OAuthLogin from '../../../layouts/core/auth/OAuthLogin';

interface MemberOnlyDashboardProps {
  /** Custom message for non-authenticated users */
  message?: string;
  /** Whether to show the OAuth login component */
  showOAuth?: boolean;
  /** Custom CSS classes */
  className?: string;
}

const MemberOnlyDashboard: React.FC<MemberOnlyDashboardProps> = ({ 
  message = "Please sign in to access your dashboard.",
  showOAuth = true,
  className = ""
}) => {
  const user = useStore(userAtom);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      await syncSupabaseUser();
      setIsLoading(false);
    };
    
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 ${className}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p className="text-zinc-400 text-sm">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className={`bg-gradient-to-br from-blue-800/50 to-purple-800/50 border border-blue-500/30 rounded-lg p-6 backdrop-blur-sm ${className}`}>
        <h2 className="text-2xl font-semibold text-white mb-4">📊 Member Dashboard</h2>
        <p className="text-neutral-300 mb-6">Welcome back, {user.username || user.email}!</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-zinc-700/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-blue-400 mb-1">42</div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide">Memes Created</div>
          </div>
          
          <div className="bg-zinc-700/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-400 mb-1">1.2K</div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide">Total Views</div>
          </div>
          
          <div className="bg-zinc-700/30 rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-purple-400 mb-1">89</div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide">Likes Received</div>
          </div>
        </div>
        
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
          <p className="text-blue-400 text-sm">
            🎯 Your dashboard is ready! Start creating and sharing amazing memes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 border border-red-500/20 rounded-lg p-8 backdrop-blur-sm ${className}`}>
      <div className="text-center">
        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h3 className="text-xl font-bold text-white mb-2">Dashboard Access Required</h3>
        <p className="text-zinc-300 mb-6">{message}</p>

        {showOAuth && (
          <div className="bg-zinc-700/30 rounded-lg p-6">
            <h4 className="text-lg font-semibold text-white mb-4">Sign in to continue</h4>
            <OAuthLogin showTitle={false} className="mb-4" />
            
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
    </div>
  );
};

export default MemberOnlyDashboard;
