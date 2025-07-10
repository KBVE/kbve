/** @jsxImportSource react */
import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { oauthService, supabase } from '@kbve/astropad';

const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};

// Hide skeleton loader when component mounts
const hideSkeleton = () => {
  const skeleton = document.querySelector('[data-skeleton="callback"]') as HTMLElement;
  if (skeleton) {
    skeleton.style.display = 'none';
  }
};

// Status Modal component for displaying callback status
const StatusModal = React.memo(({ open, loading, error, success, fallbackStatus, fallbackAttempts }: { 
  open: boolean, 
  loading: boolean, 
  error: string, 
  success: string,
  fallbackStatus?: string,
  fallbackAttempts?: number
}) => {
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm" style={{ backgroundColor: 'var(--backdrop-color)' }}>
      <div className="rounded-xl shadow-lg p-8 max-w-sm w-full flex flex-col items-center relative backdrop-blur-md" 
           style={{ 
             backgroundColor: 'var(--sl-color-gray-6)', 
             color: 'var(--sl-color-white)',
             border: '1px solid var(--sl-color-gray-5)'
           }}>
        {loading && (
          <>
            <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 mb-4" 
                 style={{ borderTopColor: 'var(--sl-color-accent)', borderBottomColor: 'var(--sl-color-accent)' }}></div>
            <div className="text-lg font-semibold mb-2">Processing OAuth callback…</div>
            <div className="text-sm opacity-80">Please wait while we complete your authentication.</div>
            {fallbackStatus && (
              <div className="text-xs opacity-60 mt-3 text-center">
                {fallbackStatus}
              </div>
            )}
            {fallbackAttempts && fallbackAttempts > 0 && (
              <div className="text-xs opacity-40 mt-1">
                Fallback attempt: {fallbackAttempts}/3
              </div>
            )}
          </>
        )}
        {!loading && success && (
          <>
            <div className="text-4xl mb-4">✅</div>
            <div className="text-lg font-semibold mb-2 text-green-400">{success}</div>
            <div className="text-sm opacity-80">You will be redirected automatically.</div>
          </>
        )}
        {!loading && error && (
          <>
            <div className="text-4xl mb-4">❌</div>
            <div className="text-lg font-semibold mb-2 text-red-400">{error}</div>
            <div className="text-sm opacity-80">You will be redirected to the login page.</div>
            {fallbackStatus && (
              <div className="text-xs opacity-60 mt-3 text-center border-t border-gray-500 pt-3">
                <strong>Fallback Status:</strong><br />
                {fallbackStatus}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export const ReactCallback = () => {
  const loading = useStore(oauthService.loadingAtom);
  const error = useStore(oauthService.errorAtom);
  const success = useStore(oauthService.successAtom);
  const provider = useStore(oauthService.providerAtom);

  const [modalOpen, setModalOpen] = useState(false);
  const [fallbackAttempts, setFallbackAttempts] = useState(0);
  const [fallbackStatus, setFallbackStatus] = useState<string>('');
  const [timeoutReached, setTimeoutReached] = useState(false);
  const [authSubscription, setAuthSubscription] = useState<any>(null);

  // Primary OAuth callback processing
  const handleCallback = useCallback(async () => {
    try {
      setModalOpen(true);
      setFallbackStatus('Processing primary callback...');
      await oauthService.handleAuthCallback();
    } catch (err: any) {
      console.error('Primary OAuth callback error:', err);
      setFallbackStatus('Primary callback failed, activating fallbacks...');
    }
  }, []);

  // Fallback 0: Auth subscription listener
  const fallbackAuthSubscription = useCallback(() => {
    if (authSubscription) return; // Prevent multiple subscriptions
    
    setFallbackStatus('Fallback: Setting up auth state listener...');
    
    const subscription = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change detected:', event, session);
      
      if (event === 'SIGNED_IN' && session) {
        setFallbackStatus('Auth subscription detected sign-in! Redirecting...');
        oauthService.successAtom.set("Authentication successful via subscription! Redirecting...");
        
        // Clean up subscription
        if (authSubscription) {
          authSubscription.data.subscription.unsubscribe();
          setAuthSubscription(null);
        }
        
        setTimeout(() => {
          window.location.href = `${window.location.origin}/profile/`;
        }, 1000);
      } else if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        setFallbackStatus('Auth subscription detected sign-out or failed refresh...');
        // Continue to next fallback
        setTimeout(() => {
          fallbackSessionCheck();
        }, 2000);
      }
    });
    
    setAuthSubscription(subscription);
    
    // Set a timeout for this fallback - if no auth change within 5 seconds, try next fallback
    setTimeout(() => {
      if (authSubscription && !success && !error) {
        setFallbackStatus('Auth subscription timeout, trying direct session check...');
        fallbackSessionCheck();
      }
    }, 5000);
  }, [authSubscription, success, error]);

  // Fallback method references to avoid circular dependencies
  const fallbackUrlParamsCheckRef = useCallback(async () => {
    try {
      setFallbackStatus('Fallback: Checking URL parameters...');
      
      const url = new URL(window.location.href);
      const accessToken = url.searchParams.get('access_token');
      const refreshToken = url.searchParams.get('refresh_token');
      const tokenType = url.searchParams.get('token_type');
      
      if (accessToken && refreshToken) {
        setFallbackStatus('Found tokens in URL, setting session...');
        
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        
        if (error) throw error;
        
        if (data.session) {
          oauthService.successAtom.set("Session restored from URL tokens! Redirecting...");
          setTimeout(() => {
            window.location.href = `${window.location.origin}/profile/`;
          }, 1000);
        }
      } else {
        setFallbackStatus('No auth tokens found in URL...');
        
        // Try final fallback after delay
        setTimeout(() => {
          fallbackTimeoutRedirect();
        }, 3000);
      }
    } catch (err: any) {
      console.error('URL params fallback error:', err);
      setFallbackStatus('URL fallback failed, initiating timeout redirect...');
      
      setTimeout(() => {
        fallbackTimeoutRedirect();
      }, 2000);
    }
  }, []);

  // Fallback timeout redirect
  const fallbackTimeoutRedirect = useCallback(() => {
    setTimeoutReached(true);
    setFallbackStatus('Authentication timeout reached. Redirecting to login...');
    
    oauthService.errorAtom.set("Authentication callback timed out. Please try signing in again.");
    
    setTimeout(() => {
      window.location.href = `${window.location.origin}/login/`;
    }, 3000);
  }, []);

  // Fallback 1: Direct session check
  const fallbackSessionCheck = useCallback(async () => {
    if (fallbackAttempts >= 3) return; // Limit fallback attempts
    
    try {
      setFallbackAttempts(prev => prev + 1);
      setFallbackStatus(`Fallback ${fallbackAttempts + 1}: Checking session directly...`);
      
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      if (session) {
        oauthService.successAtom.set("Session found via fallback! Redirecting...");
        setTimeout(() => {
          window.location.href = `${window.location.origin}/profile/`;
        }, 1000);
      } else {
        setFallbackStatus(`Fallback ${fallbackAttempts + 1}: No session found, trying next fallback...`);
        
        // Try next fallback after a delay
        setTimeout(() => {
          fallbackUrlParamsCheckRef();
        }, 2000);
      }
    } catch (err: any) {
      console.error(`Fallback ${fallbackAttempts + 1} error:`, err);
      setFallbackStatus(`Fallback ${fallbackAttempts + 1} failed, trying next...`);
      
      // Try next fallback after a delay
      setTimeout(() => {
        fallbackUrlParamsCheckRef();
      }, 2000);
    }
  }, [fallbackAttempts, fallbackUrlParamsCheckRef]);

  // Fallback 2: Check URL parameters for auth tokens
  const fallbackUrlParamsCheck = useCallback(async () => {
    try {
      setFallbackStatus('Fallback: Checking URL parameters...');
      
      const url = new URL(window.location.href);
      const accessToken = url.searchParams.get('access_token');
      const refreshToken = url.searchParams.get('refresh_token');
      const tokenType = url.searchParams.get('token_type');
      
      if (accessToken && refreshToken) {
        setFallbackStatus('Found tokens in URL, setting session...');
        
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        
        if (error) throw error;
        
        if (data.session) {
          oauthService.successAtom.set("Session restored from URL tokens! Redirecting...");
          setTimeout(() => {
            window.location.href = `${window.location.origin}/profile/`;
          }, 1000);
        }
      } else {
        setFallbackStatus('No auth tokens found in URL...');
        
        // Try final fallback after delay
        setTimeout(() => {
          fallbackTimeoutRedirect();
        }, 3000);
      }
    } catch (err: any) {
      console.error('URL params fallback error:', err);
      setFallbackStatus('URL fallback failed, initiating timeout redirect...');
      
      setTimeout(() => {
        fallbackTimeoutRedirect();
      }, 2000);
    }
  }, []);

  // Hide skeleton and process callback on component mount
  useEffect(() => {
    hideSkeleton();
    // Start watching auth state changes as a fallback mechanism
    oauthService.watchAuthState();
    handleCallback();

    // Set up fallback timer - if primary callback doesn't work within 6 seconds, start auth subscription fallback
    const fallbackTimer = setTimeout(() => {
      if (!success && !error) {
        setFallbackStatus('Primary callback taking too long, starting auth subscription fallback...');
        fallbackAuthSubscription();
      }
    }, 6000);

    // Cleanup function
    return () => {
      oauthService.unwatchAuthState();
      clearTimeout(fallbackTimer);
      // Clean up auth subscription if it exists
      if (authSubscription) {
        authSubscription.data.subscription.unsubscribe();
        setAuthSubscription(null);
      }
    };
  }, [handleCallback, success, error, fallbackAuthSubscription, authSubscription]);

  // Close modal when success or handle fallback progression
  useEffect(() => {
    if (success) {
      // Keep modal open for a moment to show success message
      setTimeout(() => setModalOpen(false), 2000);
    } else if (error && !timeoutReached) {
      // On error, start fallback sequence after a delay, beginning with auth subscription
      setTimeout(() => {
        fallbackAuthSubscription();
      }, 2000);
    }
  }, [success, error, timeoutReached, fallbackAuthSubscription]);

  return (
    <>
      <StatusModal 
        open={modalOpen}
        loading={loading}
        error={error}
        success={success}
        fallbackStatus={fallbackStatus}
        fallbackAttempts={fallbackAttempts}
      />
      
      {/* Fallback content for when modal is not shown */}
      {!modalOpen && (
        <div className="flex items-center justify-center min-h-[200px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 mx-auto mb-4" 
                 style={{ borderTopColor: 'var(--sl-color-accent)', borderBottomColor: 'var(--sl-color-accent)' }}></div>
            <div className="text-sm opacity-80" style={{ color: 'var(--sl-color-white)' }}>
              Processing authentication...
            </div>
            {fallbackStatus && (
              <div className="text-xs opacity-60 mt-2" style={{ color: 'var(--sl-color-white)' }}>
                {fallbackStatus}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};