import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { userActions } from '../stores/userStore';
import { Loader2, CheckCircle, XCircle, ArrowRight } from 'lucide-react';

interface CallbackProps {
  redirectTo?: string;
}

export const Callback: React.FC<CallbackProps> = ({ redirectTo = '/' }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<{ email?: string; username?: string } | null>(null);
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the hash from the URL
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        
        if (!accessToken) {
          throw new Error('No access token found in callback URL');
        }

        // Set the session with Supabase
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        });

        if (sessionError) {
          throw sessionError;
        }

        if (data.user) {
          // Update the user store
          userActions.setAuth(data.session, {
            id: data.user.id,
            email: data.user.email!,
            username: data.user.user_metadata?.username || data.user.user_metadata?.user_name || data.user.user_metadata?.name,
            avatar_url: data.user.user_metadata?.avatar_url,
            full_name: data.user.user_metadata?.full_name,
          });

          setUserInfo({
            email: data.user.email!,
            username: data.user.user_metadata?.username || data.user.user_metadata?.user_name || data.user.user_metadata?.name
          });

          setStatus('success');

          // Start countdown for redirect
          const timer = setInterval(() => {
            setCountdown((prev) => {
              if (prev <= 1) {
                clearInterval(timer);
                // Redirect to the specified page
                window.location.href = redirectTo;
                return 0;
              }
              return prev - 1;
            });
          }, 1000);

        } else {
          throw new Error('No user data received');
        }
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setStatus('error');

        // Redirect to home after error with delay
        setTimeout(() => {
          window.location.href = '/';
        }, 5000);
      }
    };

    handleCallback();
  }, [redirectTo]);

  const handleManualRedirect = () => {
    window.location.href = redirectTo;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-emerald-900 flex items-center justify-center p-4">
      <div className="bg-zinc-800/80 backdrop-blur-lg rounded-2xl shadow-2xl p-8 max-w-md w-full border border-zinc-700">
        <div className="text-center">
          {status === 'loading' && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <Loader2 size={48} className="text-emerald-400 animate-spin" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Authenticating...</h1>
                <p className="text-neutral-400">
                  We're securely signing you in. This will only take a moment.
                </p>
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <CheckCircle size={48} className="text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Welcome back!</h1>
                {userInfo && (
                  <p className="text-neutral-300 mb-2">
                    Signed in as {userInfo.username || userInfo.email}
                  </p>
                )}
                <p className="text-neutral-400">
                  Redirecting in {countdown} second{countdown !== 1 ? 's' : ''}...
                </p>
              </div>
              <button
                onClick={handleManualRedirect}
                className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-lg font-medium hover:from-emerald-600 hover:to-green-600 transition-all duration-200 transform hover:scale-105"
              >
                <span>Continue</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <XCircle size={48} className="text-red-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white mb-2">Authentication Failed</h1>
                <p className="text-neutral-400 mb-4">
                  {error || 'Something went wrong during sign in.'}
                </p>
                <p className="text-sm text-neutral-500">
                  Redirecting to home page in a few seconds...
                </p>
              </div>
              <button
                onClick={() => window.location.href = '/'}
                className="inline-flex items-center space-x-2 px-6 py-3 bg-zinc-700 text-white rounded-lg font-medium hover:bg-zinc-600 transition-all duration-200"
              >
                <span>Return Home</span>
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};