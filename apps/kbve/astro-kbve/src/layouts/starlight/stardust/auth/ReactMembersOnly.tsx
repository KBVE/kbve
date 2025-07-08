import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { GithubSignInButton, DiscordSignInButton } from './ReactOAuthSignIn.tsx';
import { clsx } from 'src/utils/tw';
import { userAtom } from 'src/layouts/client/supabase/profile/userstate';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';

// Memoized Modal component to prevent unnecessary re-renders
const Modal = React.memo(({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) => {
  if (!open) return null;
  
  return (
    <div 
      className={clsx(
        "fixed inset-0 z-50 flex items-center justify-center p-4"
      )}
      style={{ backgroundColor: 'var(--backdrop-color)' }}
    >
      <div
        className={clsx(
          "rounded-3xl shadow-xl p-0 max-w-3xl w-full relative",
          "flex flex-col md:flex-row overflow-hidden",
          "border border-opacity-20 transition-all duration-300",
          "backdrop-blur-md hover:shadow-2xl"
        )}
        style={{ 
          backgroundColor: 'var(--sl-color-black)',
          color: 'var(--sl-color-white)',
          borderColor: 'var(--sl-color-gray-5)',
          boxShadow: '0 4px 32px 0 rgba(0,0,0,0.10) inset'
        }}
      >
        <button
          className={clsx(
            "absolute top-4 right-4 text-2xl z-10",
            "transition-all duration-200 hover:scale-110 active:scale-95"
          )}
          style={{ 
            color: 'var(--sl-color-gray-3)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--sl-color-white)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--sl-color-gray-3)';
          }}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
});

const MembersOnly: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  // Memoized callback to prevent unnecessary re-renders
  const handleCloseModal = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (data?.user) {
        setOpen(false);
      } else {
        setOpen(true);
      }
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  if (loading) return null;

  return (
    <Modal open={open} onClose={handleCloseModal}>
      {/* Left Side: Login/Register */}
      <div 
        className={clsx(
          "flex-1 flex flex-col items-center justify-center text-center",
          "border-r border-opacity-20 pr-8 py-12 relative"
        )}
        style={{ 
          backgroundColor: 'var(--sl-color-gray-6)',
          borderColor: 'var(--sl-color-gray-5)'
        }}
      >
        <div className={clsx("absolute inset-0 pointer-events-none z-0")}>
          <div 
            className={clsx("w-32 h-32 rounded-full blur-2xl absolute -top-10 -left-10 animate-pulse")}
            style={{ backgroundColor: 'var(--sl-color-accent)', opacity: 0.1 }}
          />
          <div 
            className={clsx("w-24 h-24 rounded-full blur-2xl absolute bottom-0 right-0 animate-pulse")}
            style={{ backgroundColor: 'var(--sl-color-accent)', opacity: 0.15 }}
          />
        </div>
        <div className={clsx("relative z-10 flex flex-col items-center")}>
          <div className={clsx("text-5xl mb-3 animate-bounce")}>🔒</div>
          <h2 
            className={clsx("text-2xl font-extrabold mb-2 drop-shadow")}
            style={{ color: 'var(--sl-color-accent)' }}
          >
            Members Only
          </h2>
          <p 
            className={clsx("mb-6 text-base max-w-xs")}
            style={{ color: 'var(--sl-color-gray-3)' }}
          >
            Unlock exclusive content by logging in or registering.<br />
            <span 
              className={clsx("inline-block mt-2 font-semibold")}
              style={{ color: 'var(--sl-color-accent)' }}
            >
              Join our community!
            </span>
          </p>
          <div className={clsx("flex gap-3 mt-2")}>
            <a
              href="/login"
              data-astro-prefetch
              className={clsx(
                "font-semibold py-2 px-6 rounded-full shadow transition-all duration-200",
                "transform hover:scale-105 active:scale-95",
                "focus:outline-none focus:ring-2 focus:ring-offset-2",
                "border-2 border-transparent hover:shadow-lg"
              )}
              style={{
                background: 'linear-gradient(135deg, var(--sl-color-accent), var(--sl-color-accent-high))',
                color: 'white',
                '--ring-color': 'var(--sl-color-accent)'
              } as React.CSSProperties}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
                e.currentTarget.style.boxShadow = '0 10px 25px rgba(6, 182, 212, 0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
              }}
            >
              Login
            </a>
            <a
              href="/register"
              data-astro-prefetch
              className={clsx(
                "font-semibold py-2 px-6 rounded-full shadow transition-all duration-200",
                "transform hover:scale-105 active:scale-95",
                "focus:outline-none focus:ring-2 focus:ring-offset-2",
                "border-2 border-opacity-30 hover:shadow-lg"
              )}
              style={{
                backgroundColor: 'var(--sl-color-gray-5)',
                color: 'var(--sl-color-white)',
                borderColor: 'var(--sl-color-gray-4)',
                '--ring-color': 'var(--sl-color-gray-4)'
              } as React.CSSProperties}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--sl-color-gray-4)';
                e.currentTarget.style.transform = 'translateY(-1px) scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--sl-color-gray-5)';
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
              }}
            >
              Register
            </a>
          </div>
        </div>
      </div>
      {/* Right Side: OAuth Auths */}
      <div 
        className={clsx(
          "flex-1 flex flex-col items-center justify-center text-center",
          "pl-8 py-12 relative"
        )}
        style={{ 
          backgroundColor: 'var(--sl-color-black)',
        }}
      >
        <div className={clsx("absolute inset-0 pointer-events-none z-0")}>
          <div 
            className={clsx("w-24 h-24 rounded-full blur-2xl absolute top-0 right-0 animate-pulse")}
            style={{ backgroundColor: 'var(--sl-color-accent)', opacity: 0.1 }}
          />
          <div 
            className={clsx("w-20 h-20 rounded-full blur-2xl absolute bottom-0 left-0 animate-pulse")}
            style={{ backgroundColor: 'var(--sl-color-accent)', opacity: 0.08 }}
          />
        </div>
        <div className={clsx("relative z-10 w-full flex flex-col items-center")}>
          <div 
            className={clsx("text-lg font-semibold mb-4")}
            style={{ color: 'var(--sl-color-gray-2)' }}
          >
            Or sign in with
          </div>
          <div className={clsx("flex flex-col gap-3 w-full max-w-xs")}>
            <DiscordSignInButton />
            <GithubSignInButton />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default MembersOnly;
