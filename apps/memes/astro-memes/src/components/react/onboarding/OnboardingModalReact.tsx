import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { 
  userAtom, 
  usernameAtom, 
  userMemeProfileAtom,
  isUserOnboarded,
  syncSupabaseUser,
  syncUserMemeProfile,
  userIdAtom 
} from '../../../layouts/client/supabase/profile/userstate';

interface OnboardingModalProps {
  /** Whether to disable the modal from showing (for specific pages) */
  disabled?: boolean;
}

const OnboardingModalReact: React.FC<OnboardingModalProps> = ({ disabled = false }) => {
  const user = useStore(userAtom);
  const username = useStore(usernameAtom);
  const profile = useStore(userMemeProfileAtom);
  const userId = useStore(userIdAtom);
  
  const [isVisible, setIsVisible] = useState(false);
  const [isSkipped, setIsSkipped] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  // Sync user data on mount
  useEffect(() => {
    syncSupabaseUser();
  }, []);

  // Sync profile when userId changes
  useEffect(() => {
    if (userId) {
      syncUserMemeProfile(userId);
    }
  }, [userId]);

  // Check onboarding status whenever relevant data changes
  useEffect(() => {
    if (disabled || hasChecked) return;

    // Check if user has skipped onboarding in this session
    const skippedInSession = localStorage.getItem('meme:onboarding:skipped') === 'true';
    if (skippedInSession) {
      setIsSkipped(true);
      setHasChecked(true);
      return;
    }

    // Don't show modal on onboarding page itself
    if (typeof window !== 'undefined' && window.location.pathname.includes('/onboarding')) {
      setHasChecked(true);
      return;
    }

    // Give some time for atoms to sync
    const checkTimer = setTimeout(() => {
      // Only show modal if user exists but is not onboarded
      if (user && !isUserOnboarded()) {
        setIsVisible(true);
      }
      setHasChecked(true);
    }, 1500); // Slightly longer delay for better UX

    return () => clearTimeout(checkTimer);
  }, [user, username, profile, disabled, hasChecked]);

  const handleSkip = () => {
    localStorage.setItem('meme:onboarding:skipped', 'true');
    setIsVisible(false);
    setIsSkipped(true);
  };

  const handleClose = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleSkip();
    }
  };

  if (disabled || isSkipped || !isVisible || !user) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm transition-all duration-300"
      onClick={handleClose}
    >
      <div 
        className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 max-w-md w-full mx-4 transform transition-all duration-300"
        onClick={e => e.stopPropagation()}
      >
        <div className="text-center">
          {/* Welcome Emoji */}
          <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-green-500 rounded-full flex items-center justify-center text-3xl text-white mx-auto mb-4 shadow-lg">
            👋
          </div>
          
          {/* Title */}
          <h3 className="text-2xl font-bold text-neutral-900 dark:text-white mb-2">
            Welcome to Meme.sh!
          </h3>
          
          {/* Description */}
          <p className="text-neutral-600 dark:text-neutral-400 mb-6">
            It looks like you're new here! Let's set up your profile so you can start discovering and sharing amazing memes.
          </p>
          
          {/* User Info */}
          {user.user_metadata?.avatar_url && (
            <div className="flex flex-col items-center gap-2 mb-4">
              <img
                src={user.user_metadata.avatar_url}
                alt="Your Avatar"
                className="w-12 h-12 rounded-full border-2 border-emerald-400 shadow-md object-cover"
              />
              <div className="text-sm text-neutral-600 dark:text-neutral-400">
                {user.user_metadata?.display_name || user.email}
              </div>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <a 
              href="/onboarding/" 
              className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-white font-semibold rounded-xl transition-all duration-300 hover:scale-105 text-center"
            >
              Set Up Profile
            </a>
            <button 
              onClick={handleSkip}
              className="flex-1 px-6 py-3 border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 font-semibold rounded-xl transition-all duration-300 hover:scale-105"
            >
              Skip for Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OnboardingModalReact;
