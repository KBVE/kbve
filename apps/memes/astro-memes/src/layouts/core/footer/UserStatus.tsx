import React, { useState, useEffect, useCallback } from 'react';
import { isAuthenticated, userProfile } from '../stores/userStore';

export const UserStatus: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAuthAction = useCallback((action: 'login' | 'register') => {
    try {
      window.location.href = action === 'login' ? '/auth/login' : '/auth/register';
    } catch (err) {
      setError(`Failed to navigate to ${action} page`);
      console.error('Navigation error:', err);
    }
  }, []);

  useEffect(() => {
    try {
      if (!isAuthenticated || !userProfile) {
        setError('Authentication store not available');
        return;
      }

      // Initialize store values
      setAuthenticated(isAuthenticated.get());
      setProfile(userProfile.get());

      // Subscribe to changes
      const unsubAuth = isAuthenticated.subscribe(setAuthenticated);
      const unsubProfile = userProfile.subscribe(setProfile);

      setMounted(true);

      return () => {
        unsubAuth();
        unsubProfile();
      };
    } catch (err) {
      setError('Failed to access authentication state');
      console.error('UserStatus store access error:', err);
    }
  }, []);

  if (!mounted) {
    return (
      <div className="mt-6 pt-6 border-t border-zinc-700">
        <div className="text-center">
          <div className="animate-pulse">
            <div className="h-4 bg-zinc-700/60 rounded w-48 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 pt-6 border-t border-zinc-700">
        <div className="text-center">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="mt-6 pt-6 border-t border-zinc-700">
        <div className="text-center">
          <p className="text-neutral-400 text-sm mb-3">
            Welcome, Guest! 👋 Join our meme community to create and share your content.
          </p>
          <div className="flex justify-center space-x-3">
            <button
              onClick={() => handleAuthAction('login')}
              className="px-4 py-2 text-xs font-medium text-emerald-400 border border-emerald-500/50 rounded-lg hover:bg-emerald-500/10 hover:text-emerald-300 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/20"
              aria-label="Login to your account"
            >
              Login
            </button>
            <button
              onClick={() => handleAuthAction('register')}
              className="px-4 py-2 text-xs font-medium text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/30"
              aria-label="Create a new account"
            >
              Register
            </button>
          </div>
        </div>
      </div>
    );
  }

  const displayName = profile?.username || profile?.email?.split('@')[0] || 'User';

  return (
    <div className="mt-6 pt-6 border-t border-zinc-700">
      <div className="text-center">
        <p className="text-neutral-400 text-sm">
          Welcome back, <span className="text-emerald-400 font-medium">{displayName}</span>! 
          Keep creating amazing memes! 🎭
        </p>
      </div>
    </div>
  );
};