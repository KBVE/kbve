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
      // Hide the skeleton when React component mounts
      const skeleton = document.querySelector('[data-skeleton="logout"]');
      if (skeleton) {
        (skeleton as HTMLElement).style.display = 'none';
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
        return 'text-red-400';
      default:
        return '';
    }
  };

  // If logout is in progress, show status
  if (status !== 'idle') {
    return (
      <div className={cn(
        'flex items-center justify-center p-4 rounded-lg',
        'bg-slate-800 border border-slate-700',
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
        'p-4 rounded-lg border',
        'bg-slate-900 border-slate-700',
        className
      )}>
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-slate-200 mb-2">
              Confirm Logout
            </h3>
            <p className="text-sm text-slate-400">
              Are you sure you want to log out? You'll need to sign in again to access your account.
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-3 items-baseline justify-items-center">
            <button
              onClick={handleCancelLogout}
              aria-label="Cancel logout"
              className={cn(
                buttonBaseStyles,
                'bg-slate-700 text-slate-300 hover:bg-slate-600',
                'border border-slate-600 hover:border-slate-500',
                'hover:shadow-md',
                'focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900'
              )}
            >
              <X className="w-4 h-4 align-middle" />
              Cancel
            </button>
            <button
              onClick={handleConfirmLogout}
              aria-label="Confirm logout"
              className={cn(
                buttonBaseStyles,
                'bg-red-600 text-white hover:bg-red-700',
                'border border-red-600 hover:border-red-700',
                'hover:shadow-lg hover:shadow-red-500/25',
                'focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900'
              )}
            >
              <LogOut className="w-4 h-4 align-middle" />
              Logout
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If no hash confirmation and not in progress, return null (auto logout already triggered)
  return null;
};