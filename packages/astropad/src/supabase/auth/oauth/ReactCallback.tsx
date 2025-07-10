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
const StatusModal = React.memo(({ open, loading, error, success }: { 
  open: boolean, 
  loading: boolean, 
  error: string, 
  success: string
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

  // Handle OAuth callback processing
  const handleCallback = useCallback(async () => {
    try {
      setModalOpen(true);
      await oauthService.handleAuthCallback();
    } catch (err: any) {
      console.error('OAuth callback error:', err);
    }
  }, []);

  // Hide skeleton and process callback on component mount
  useEffect(() => {
    hideSkeleton();
    handleCallback();
  }, [handleCallback]);

  // Close modal when not loading and no active state
  useEffect(() => {
    if (!loading && !error && !success) {
      setModalOpen(false);
    }
  }, [loading, error, success]);

  return (
    <>
      <StatusModal 
        open={modalOpen}
        loading={loading}
        error={error}
        success={success}
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
          </div>
        </div>
      )}
    </>
  );
};