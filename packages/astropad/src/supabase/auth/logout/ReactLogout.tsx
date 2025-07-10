/** @jsxImportSource react */
import React, { useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { logoutService } from '@kbve/astropad';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { LogOut, AlertTriangle, X, Loader2 } from 'lucide-react';


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

  // Shared button styles to ensure identical styling
  const buttonBaseStyles = 'h-10 px-4 min-w-[80px] rounded-md text-sm font-medium flex items-center justify-center gap-2 leading-none transition-all duration-200 ease-in-out hover:scale-105 active:scale-95 focus:outline-none group';

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
        // Show confirmation dialog
        setShowConfirmation(true);
      } else {
        // Automatically logout
        handleLogout();
      }
    }
  }, []);

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
        return 'text-[var(--sl-color-red)]';
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
  if (hasConfirmHash && showConfirmation) {
    return (
      <div className={cn(
        'text-center space-y-4',
        className
      )}>
        <div 
          className="flex items-center justify-center w-12 h-12 mx-auto rounded-full border"
          style={{ 
            backgroundColor: 'color-mix(in srgb, var(--sl-color-red) 10%, transparent)',
            borderColor: 'color-mix(in srgb, var(--sl-color-red) 20%, transparent)'
          }}
        >
          <AlertTriangle className="w-6 h-6" style={{ color: 'var(--sl-color-red)' }} />
        </div>
        
        <div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--sl-color-text)' }}>
            Confirm Logout
          </h3>
          <p className="text-sm" style={{ color: 'var(--sl-color-text-accent)' }}>
            Are you sure you want to log out? You'll need to sign in again to access your account.
          </p>
        </div>
        
        <div className="grid grid-cols-2 gap-3 items-baseline justify-items-center">
          <button
            onClick={handleCancelLogout}
            aria-label="Cancel logout"
            className={cn(
              buttonBaseStyles,
              'hover:shadow-md focus:ring-2 focus:ring-offset-2'
            )}
            style={{
              backgroundColor: 'color-mix(in srgb, var(--sl-color-gray-5) 80%, transparent)',
              color: 'var(--sl-color-text)',
              borderColor: 'color-mix(in srgb, var(--sl-color-gray-4) 60%, transparent)',
              '--tw-ring-color': 'var(--sl-color-accent)',
              '--tw-ring-offset-color': 'var(--sl-color-bg)'
            } as React.CSSProperties}
          >
            <X className="w-4 h-4 align-middle" />
            Cancel
          </button>
          <button
            onClick={handleConfirmLogout}
            aria-label="Confirm logout"
            className={cn(
              buttonBaseStyles,
              'hover:shadow-lg focus:ring-2 focus:ring-offset-2'
            )}
            style={{
              backgroundColor: 'var(--sl-color-red)',
              color: 'var(--sl-color-white)',
              borderColor: 'var(--sl-color-red)',
              '--tw-ring-color': 'var(--sl-color-red)',
              '--tw-ring-offset-color': 'var(--sl-color-bg)',
              '--tw-shadow-color': 'color-mix(in srgb, var(--sl-color-red) 25%, transparent)'
            } as React.CSSProperties}
          >
            <LogOut className="w-4 h-4 align-middle" />
            Logout
          </button>
        </div>
      </div>
    );
  }

  // If no hash confirmation and not in progress, return null (auto logout already triggered)
  return null;
};