/** @jsxImportSource react */
import React, { useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { logoutService } from '@kbve/astropad';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LogOut, AlertTriangle, X, Loader2, Smile } from 'lucide-react';


const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};

interface ReactLogoutProps {
  variant?: 'default' | 'home';
  className?: string;
}

export const ReactLogout: React.FC<ReactLogoutProps> = ({ 
  variant = 'default',
  className 
}) => {
  const loading = useStore(logoutService.loadingAtom);
  const error = useStore(logoutService.errorAtom);
  const success = useStore(logoutService.successAtom);
  const status = useStore(logoutService.statusAtom);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [hasConfirmHash, setHasConfirmHash] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null); // null = checking, true/false = result

  // Shared button styles to ensure identical styling
  const buttonBaseStyles = 'h-10 px-4 min-w-[80px] rounded-md text-sm font-medium flex items-center justify-center gap-2 leading-none transition-all duration-200 ease-in-out hover:scale-105 active:scale-95 focus:outline-none group cursor-pointer';

  // Check for hash and handle automatic logout
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Start fade transition when React component mounts
      const container = document.querySelector('.logout-container');
      const skeleton = document.querySelector('[data-skeleton="logout"]');
      
      if (container && skeleton) {
        // Add hydrated class to container to show React component
        container.classList.add('hydrated');
        
        // Start fade out of skeleton
        skeleton.classList.add('fade-out');
        
        // Remove skeleton from DOM after fade completes
        setTimeout(() => {
          (skeleton as HTMLElement).style.display = 'none';
        }, 300);
      }

      const hash = window.location.hash;
      const hasConfirm = hash === '#confirm';
      setHasConfirmHash(hasConfirm);
      
      if (hasConfirm) {
        // Check login status first before showing confirmation
        checkLoginStatus();
      } else {
        // Automatically logout
        handleLogout();
      }
    }
  }, []);

  const checkLoginStatus = async () => {
    try {
      const loggedIn = await logoutService.isUserLoggedIn();
      setIsLoggedIn(loggedIn);
      
      if (loggedIn) {
        setShowConfirmation(true);
      }
      // If not logged in, component will show the "silly goose" message
    } catch (error) {
      console.error('Error checking login status:', error);
      setIsLoggedIn(false);
    }
  };

  const handleLogout = useCallback(async () => {
    if (variant === 'home') {
      await logoutService.logoutAndRedirectHome();
    } else {
      await logoutService.logoutUser();
    }
  }, [variant]);

  const handleConfirmLogout = useCallback(() => {
    setShowConfirmation(false);
    // Clear the hash when confirming logout
    if (typeof window !== 'undefined') {
      window.location.hash = '';
    }
    handleLogout();
  }, [handleLogout]);

  const handleGoToLogin = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.href = `${window.location.origin}/login`;
    }
  }, []);

  const handleGoToRegister = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.href = `${window.location.origin}/register`;
    }
  }, []);

  const handleCancelLogout = useCallback(() => {
    setShowConfirmation(false);
    // Redirect to previous page or home when canceling
    if (typeof window !== 'undefined') {
      window.history.back();
    }
  }, []);

  const getStatusMessage = () => {
    switch (status) {
      case 'loading':
        return 'Logging you out…';
      case 'success':
        return success || 'Logged out! Redirecting…';
      case 'error':
        return error || 'Logout failed. Redirecting…';
      default:
        return '';
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'loading':
        return 'text-[var(--sl-color-accent)]';
      case 'success':
        return 'text-[var(--sl-color-accent)]';
      case 'error':
        return 'text-red-500'; // Using standard Tailwind red since no red in starlight vars
      default:
        return '';
    }
  };

  // If logout is in progress, show status
  if (status !== 'idle') {
    return (
      <div className={cn(
        'flex items-center justify-center p-4',
        className
      )}>
        <div className="text-center">
          {status === 'loading' && (
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--sl-color-accent)]" />
          )}
          <p className={cn('text-sm', getStatusColor())}>
            {getStatusMessage()}
          </p>
        </div>
      </div>
    );
  }

  // Show confirmation dialog only if hash is #confirm
  if (hasConfirmHash) {
    // Still checking login status
    if (isLoggedIn === null) {
      return (
        <div className={cn('text-center space-y-4', className)}>
          <div className="flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[var(--sl-color-accent)]" />
          </div>
          <p className="text-sm" style={{ color: 'var(--sl-color-gray-3)' }}>
            Checking login status...
          </p>
        </div>
      );
    }

    // User is not logged in - show "silly goose" message
    if (!isLoggedIn) {
      return (
        <div className={cn('text-center space-y-4', className)}>
          <div 
            className="flex items-center justify-center w-12 h-12 mx-auto rounded-full border"
            style={{ 
              backgroundColor: 'color-mix(in srgb, var(--sl-color-accent) 10%, transparent)',
              borderColor: 'color-mix(in srgb, var(--sl-color-accent) 20%, transparent)'
            }}
          >
            <AlertTriangle className="w-6 h-6 text-[var(--sl-color-accent)]" />
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2 flex items-center justify-center gap-2" style={{ color: 'var(--sl-color-white)' }}>
              You silly goose! <Smile className="w-5 h-5 text-[var(--sl-color-accent)]" />
            </h3>
            <p className="text-sm" style={{ color: 'var(--sl-color-gray-3)' }}>
              You're already logged out. Would you like to sign in or create a new account?
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-3 items-baseline justify-items-center">
            <button
              onClick={handleGoToLogin}
              aria-label="Go to login"
              className={cn(
                buttonBaseStyles,
                'border hover:shadow-md focus:ring-2 focus:ring-offset-2 focus:ring-[var(--sl-color-accent)]'
              )}
              style={{
                backgroundColor: 'color-mix(in srgb, var(--sl-color-gray-5) 60%, transparent)',
                color: 'var(--sl-color-white)',
                borderColor: 'var(--sl-color-gray-4)'
              }}
            >
              <LogOut className="w-4 h-4 align-middle rotate-180" />
              Login
            </button>
            <button
              onClick={handleGoToRegister}
              aria-label="Go to register"
              className={cn(
                buttonBaseStyles,
                'border hover:shadow-md focus:ring-2 focus:ring-offset-2 focus:ring-[var(--sl-color-accent)]'
              )}
              style={{
                backgroundColor: 'color-mix(in srgb, var(--sl-color-accent) 80%, transparent)',
                color: 'var(--sl-color-white)',
                borderColor: 'var(--sl-color-accent)'
              }}
            >
              <X className="w-4 h-4 align-middle rotate-45" />
              Register
            </button>
          </div>
        </div>
      );
    }

    // User IS logged in - show normal confirmation
    if (showConfirmation) {
      return (
        <div className={cn('text-center space-y-4', className)}>
          <div 
            className="flex items-center justify-center w-12 h-12 mx-auto rounded-full border"
            style={{ 
              backgroundColor: 'color-mix(in srgb, #ef4444 10%, transparent)', // red-500 with transparency
              borderColor: 'color-mix(in srgb, #ef4444 20%, transparent)'
            }}
          >
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--sl-color-white)' }}>
              Confirm Logout
            </h3>
            <p className="text-sm" style={{ color: 'var(--sl-color-gray-3)' }}>
              Are you sure you want to log out? You'll need to sign in again to access your account.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-3 items-baseline justify-items-center">
            <button
              onClick={handleCancelLogout}
              aria-label="Cancel logout"
              className={cn(
                buttonBaseStyles,
                'border hover:shadow-md focus:ring-2 focus:ring-offset-2 focus:ring-[var(--sl-color-accent)]'
              )}
              style={{
                backgroundColor: 'color-mix(in srgb, var(--sl-color-gray-5) 60%, transparent)',
                color: 'var(--sl-color-white)',
                borderColor: 'var(--sl-color-gray-4)'
              }}
            >
              <X className="w-4 h-4 align-middle" />
              Cancel
            </button>
            <button
              onClick={handleConfirmLogout}
              aria-label="Confirm logout"
              className={cn(
                buttonBaseStyles,
                'border bg-red-600 text-white hover:bg-red-700 border-red-600 hover:border-red-700',
                'hover:shadow-lg focus:ring-2 focus:ring-offset-2 focus:ring-red-500'
              )}
            >
              <LogOut className="w-4 h-4 align-middle" />
              Logout
            </button>
          </div>
        </div>
      );
    }
  }

  // If no hash confirmation and not in progress, return null (auto logout already triggered)
  return null;
};