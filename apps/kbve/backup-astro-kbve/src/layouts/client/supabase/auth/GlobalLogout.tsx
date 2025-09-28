import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';

const GlobalLogout: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [retryCount, setRetryCount] = useState(0);

  const clearAuthData = useCallback(() => {
    if (typeof window !== 'undefined') {
      // Clear all auth-related items from localStorage
      const authKeys = ['isMember', 'sb-access-token', 'sb-refresh-token'];
      authKeys.forEach(key => {
        localStorage.removeItem(key);
        // Also check for prefixed versions
        const prefixedKey = `sb-${key}`;
        localStorage.removeItem(prefixedKey);
      });
      
      // Clear session storage
      sessionStorage.clear();
      
      // Clear cookies related to Supabase
      document.cookie.split(";").forEach((c) => {
        const cookie = c.trim();
        if (cookie.startsWith('sb-')) {
          document.cookie = cookie.split("=")[0] + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
        }
      });
    }
  }, []);

  const performLogout = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      
      if (error) throw error;
      
      clearAuthData();
      setStatus('success');
      
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
    } catch (error: any) {
      console.error('Logout error:', error);
      
      if (retryCount < 2) {
        setRetryCount(prev => prev + 1);
        setTimeout(() => performLogout(), 1000);
      } else {
        // Even if logout fails, clear local data and redirect
        clearAuthData();
        setStatus('error');
        setErrorMsg(error?.message || 'Logout failed, but local session cleared.');
        
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    }
  }, [retryCount, clearAuthData]);

  useEffect(() => {
    performLogout();
  }, []);

  if (status === 'loading') return (
    <div className="flex flex-col items-center justify-center space-y-4 p-8" role="status" aria-live="polite">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neutral-600 dark:border-neutral-300"></div>
      <p className="text-neutral-600 dark:text-neutral-300">Logging you out…</p>
    </div>
  );
  
  if (status === 'success') return (
    <div className="flex flex-col items-center justify-center space-y-4 p-8" role="status" aria-live="polite">
      <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <p className="text-green-500 font-medium">Logged out successfully!</p>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">Redirecting to login…</p>
    </div>
  );
  
  if (status === 'error') return (
    <div className="flex flex-col items-center justify-center space-y-4 p-8" role="alert" aria-live="assertive">
      <svg className="w-12 h-12 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      <p className="text-red-500 font-medium">Logout Issue</p>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 text-center max-w-md">{errorMsg}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">Redirecting to home…</p>
    </div>
  );
  
  return null;
};

export default GlobalLogout;
