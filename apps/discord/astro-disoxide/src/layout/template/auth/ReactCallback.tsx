/** @jsxImportSource react */

import React, { useEffect, useState } from 'react';
import { supabase } from '../supabase';
import { userClientService } from '../userClient';

interface CallbackState {
  status: 'loading' | 'success' | 'error';
  message?: string;
}

export const ReactCallback: React.FC = () => {
  const [state, setState] = useState<CallbackState>({ status: 'loading' });

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        console.log('[ReactCallback] Processing auth callback...');
        
        // Get the URL hash or search params
        const urlParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        
        console.log('[ReactCallback] URL params:', Object.fromEntries(urlParams));
        console.log('[ReactCallback] Hash params:', Object.fromEntries(hashParams));

        // Check for error in URL
        const error = urlParams.get('error') || hashParams.get('error');
        const errorDescription = urlParams.get('error_description') || hashParams.get('error_description');
        
        if (error) {
          throw new Error(errorDescription || error);
        }

        // Handle the auth callback with Supabase
        const { data, error: authError } = await supabase.auth.getSession();
        
        if (authError) {
          throw authError;
        }

        if (data?.session) {
          console.log('[ReactCallback] Session established, syncing user...');
          
          // Sync the user data
          await userClientService.syncSupabaseUser();
          
          setState({ 
            status: 'success', 
            message: 'Authentication successful! Redirecting...' 
          });

          // Get the return URL from localStorage or default to home
          const returnTo = localStorage.getItem('auth_return_to') || '/';
          localStorage.removeItem('auth_return_to');
          
          // Small delay to show success message, then redirect
          setTimeout(() => {
            window.location.href = returnTo;
          }, 1500);
          
        } else {
          throw new Error('No session created during authentication');
        }
        
      } catch (error: any) {
        console.error('[ReactCallback] Auth callback failed:', error);
        setState({ 
          status: 'error', 
          message: error.message || 'Authentication failed' 
        });
        
        // Redirect to login page after showing error
        setTimeout(() => {
          window.location.href = '/login?error=' + encodeURIComponent(error.message || 'Authentication failed');
        }, 3000);
      }
    };

    // Process the callback when component mounts
    handleAuthCallback();
  }, []);

  // Render based on current state
  if (state.status === 'loading') {
    return null; // Let the static HTML show the loading state
  }

  if (state.status === 'success') {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999
      }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '4px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '50%',
            borderTopColor: 'white',
            animation: 'spin 1s ease-in-out infinite',
            margin: '0 auto 20px'
          }} />
          <h2>Success!</h2>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999
      }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <h2>Authentication Failed</h2>
          <p>{state.message}</p>
          <p style={{ fontSize: '14px', opacity: 0.8 }}>
            Redirecting to login page...
          </p>
        </div>
      </div>
    );
  }

  return null;
};

export default ReactCallback;