import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { isAuthenticated, isLoading, userProfile } from '../stores/userStore';
import { supabase } from '../supabaseClient';
import { userActions } from '../stores/userStore';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requireAuth?: boolean;
  redirectTo?: string;
  loading?: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  fallback,
  requireAuth = true,
  redirectTo = '/auth/login',
  loading
}) => {
  const isAuthenticatedValue = useStore(isAuthenticated);
  const isLoadingValue = useStore(isLoading);
  const profile = useStore(userProfile);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // Check if user is already authenticated
    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session check error:', error);
          userActions.setError(error.message);
          return;
        }

        if (session?.user) {
          userActions.setAuth(session, {
            id: session.user.id,
            email: session.user.email!,
            username: session.user.user_metadata?.username,
            avatar_url: session.user.user_metadata?.avatar_url,
            full_name: session.user.user_metadata?.full_name,
          });
        } else {
          userActions.logout();
        }
      } catch (err) {
        console.error('Auth check error:', err);
        userActions.setError(err instanceof Error ? err.message : 'Authentication check failed');
      } finally {
        setInitializing(false);
      }
    };

    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        userActions.setAuth(session, {
          id: session.user.id,
          email: session.user.email!,
          username: session.user.user_metadata?.username,
          avatar_url: session.user.user_metadata?.avatar_url,
          full_name: session.user.user_metadata?.full_name,
        });
      } else if (event === 'SIGNED_OUT') {
        userActions.logout();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Show loading state
  if (initializing || isLoadingValue) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-emerald-900">
        {loading || (
          <div className="flex flex-col items-center space-y-4">
            <Loader2 size={48} className="text-emerald-400 animate-spin" />
            <p className="text-neutral-400">Loading...</p>
          </div>
        )}
      </div>
    );
  }

  // Handle authentication requirement
  if (requireAuth && !isAuthenticatedValue) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    // Redirect to login
    if (typeof window !== 'undefined') {
      window.location.href = redirectTo;
    }
    return null;
  }

  // Handle case where auth is not required but user is authenticated
  if (!requireAuth && isAuthenticatedValue) {
    return <>{children}</>;
  }

  // Render children if conditions are met
  return <>{children}</>;
};

export default AuthGuard;
