import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { userActions } from '../stores/userStore';
import { LogOut, Loader2 } from 'lucide-react';

interface LogoutButtonProps {
  onLogout?: () => void;
  redirectTo?: string;
  className?: string;
  variant?: 'button' | 'dropdown-item';
  showIcon?: boolean;
  children?: React.ReactNode;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({
  onLogout,
  redirectTo = '/',
  className = '',
  variant = 'button',
  showIcon = true,
  children
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      userActions.setLoading(true);

      // Sign out from Supabase
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        throw error;
      }

      // Update user store
      userActions.logout();

      // Call custom logout handler
      if (onLogout) {
        onLogout();
      } else {
        // Default redirect
        window.location.href = redirectTo;
      }
    } catch (err) {
      console.error('Logout error:', err);
      userActions.setError(err instanceof Error ? err.message : 'Failed to log out');
    } finally {
      setIsLoading(false);
      userActions.setLoading(false);
    }
  };

  const baseClasses = variant === 'dropdown-item' 
    ? 'w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors'
    : 'inline-flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all duration-200 disabled:bg-red-600/50 disabled:cursor-not-allowed';

  return (
    <button
      onClick={handleLogout}
      disabled={isLoading}
      className={`${baseClasses} ${className}`}
    >
      {isLoading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          <span>Signing out...</span>
        </>
      ) : (
        <>
          {showIcon && <LogOut size={16} />}
          <span>{children || 'Sign Out'}</span>
        </>
      )}
    </button>
  );
};

export default LogoutButton;
