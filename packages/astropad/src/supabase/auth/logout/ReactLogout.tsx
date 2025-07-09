/** @jsxImportSource react */
import React, { useState, useCallback, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { logoutService } from '@kbve/astropad';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};

interface ReactLogoutProps {
  variant?: 'default' | 'home';
  className?: string;
}

const ReactLogout: React.FC<ReactLogoutProps> = ({ 
  variant = 'default',
  className 
}) => {
  const loading = useStore(logoutService.loadingAtom);
  const error = useStore(logoutService.errorAtom);
  const success = useStore(logoutService.successAtom);
  const status = useStore(logoutService.statusAtom);

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [hasConfirmHash, setHasConfirmHash] = useState(false);

  // Check for hash and handle automatic logout
  useEffect(() => {
    if (typeof window !== 'undefined') {
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
        return 'text-slate-400';
      case 'success':
        return 'text-cyan-400';
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
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-500 mx-auto mb-2"></div>
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
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold text-slate-200 mb-2">
              Confirm Logout
            </h3>
            <p className="text-sm text-slate-400">
              Are you sure you want to log out? You'll need to sign in again to access your account.
            </p>
          </div>
          
          <div className="flex gap-3 justify-center">
            <button
              onClick={handleCancelLogout}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium',
                'bg-slate-700 text-slate-300 hover:bg-slate-600',
                'border border-slate-600 hover:border-slate-500',
                'transition-colors duration-200'
              )}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmLogout}
              className={cn(
                'px-4 py-2 rounded-md text-sm font-medium',
                'bg-red-600 text-white hover:bg-red-700',
                'border border-red-500 hover:border-red-400',
                'transition-colors duration-200'
              )}
            >
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

export default ReactLogout;