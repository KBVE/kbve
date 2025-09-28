import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'src/utils/tw';
import { userAtom } from 'src/layouts/client/supabase/profile/userstate';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';

// Memoized Modal component to prevent unnecessary re-renders
const Modal = React.memo(({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) => {
  if (!open) return null;
  
  return (
    <div 
      className={clsx(
        "fixed inset-0 z-50 flex items-center justify-center"
      )}
      style={{ backgroundColor: 'var(--backdrop-color)' }}
    >
      <div 
        className={clsx(
          "rounded-2xl shadow-xl p-8 max-w-md w-full relative backdrop-blur-md",
          "border border-opacity-20"
        )}
        style={{ 
          backgroundColor: 'var(--sl-color-black)',
          color: 'var(--sl-color-white)',
          borderColor: 'var(--sl-color-gray-5)'
        }}
      >
        <button
          className={clsx(
            "absolute top-3 right-3 text-xl transition-colors duration-200",
            "hover:scale-105 active:scale-95"
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

const ReactGuestOnly: React.FC = () => {
  const user = useStore(userAtom);
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Memoize the display name to prevent unnecessary recalculations
  const displayName = useMemo(() => {
    return user?.user_metadata?.display_name || user?.email || 'User';
  }, [user?.user_metadata?.display_name, user?.email]);

  // Memoized callback to prevent unnecessary re-renders
  const handleCloseModal = useCallback(() => {
    setOpen(false);
  }, []);

  // Optimized user checking effect with loading state
  useEffect(() => {
    if (!user) {
      setIsLoading(true);
      supabase.auth.getUser()
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching user:', error);
            setOpen(false);
          } else if (data?.user) {
            userAtom.set(data.user);
            setOpen(true);
          } else {
            setOpen(false);
          }
        })
        .catch((error) => {
          console.error('Unexpected error:', error);
          setOpen(false);
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setOpen(true);
      setIsLoading(false);
    }
  }, [user]);

  // Optimized logout handler with loading state
  const handleLogout = useCallback(async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error signing out:', error);
      } else {
        userAtom.set(null);
        window.location.reload();
      }
    } catch (error) {
      console.error('Unexpected error during logout:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Optimized profile navigation handler
  const handleProfile = useCallback(() => {
    window.location.href = '/profile';
  }, []);

  // Don't render anything while loading
  if (isLoading) {
    return (
      <Modal open={true} onClose={handleCloseModal}>
        <div className={clsx("flex flex-col items-center text-center")}>
          <div 
            className={clsx(
              "animate-spin rounded-full h-8 w-8 border-b-2 mb-4",
              "border-transparent"
            )}
            style={{ borderBottomColor: 'var(--sl-color-accent)' }}
          ></div>
          <p style={{ color: 'var(--sl-color-gray-3)' }}>Loading...</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={handleCloseModal}>
      <div className={clsx("flex flex-col items-center text-center")}>
        <div className={clsx("text-3xl mb-2")}>👋</div>
        <h2 
          className={clsx("text-xl font-bold mb-2")}
          style={{ color: 'var(--sl-color-accent)' }}
        >
          Hey, {displayName}!
        </h2>
        <p 
          className={clsx("mb-4")}
          style={{ color: 'var(--sl-color-gray-3)' }}
        >
          Opps, you seem to already be logged in.<br />
          Would you like to go to your profile or log out before trying to login/register?
        </p>
        <div className={clsx("flex gap-3 mt-2")}>
          <button
            className={clsx(
              "font-semibold py-2 px-5 rounded-full shadow transition-all duration-200",
              "transform hover:scale-105 active:scale-95",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
              "focus:outline-none focus:ring-2 focus:ring-offset-2",
              isLoading && "pointer-events-none"
            )}
            style={{
              background: 'linear-gradient(135deg, var(--sl-color-accent), var(--sl-color-accent-high))',
              color: 'white',
              '--ring-color': 'var(--sl-color-accent)'
            } as React.CSSProperties}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)';
                e.currentTarget.style.boxShadow = '0 10px 25px rgba(6, 182, 212, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
              }
            }}
            onClick={handleProfile}
            disabled={isLoading}
          >
            Go to Profile
          </button>
          <button
            className={clsx(
              "font-semibold py-2 px-5 rounded-full shadow transition-all duration-200",
              "transform hover:scale-105 active:scale-95",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none",
              "focus:outline-none focus:ring-2 focus:ring-offset-2",
              "border border-opacity-30",
              isLoading && "pointer-events-none"
            )}
            style={{
              backgroundColor: 'var(--sl-color-gray-5)',
              color: 'var(--sl-color-white)',
              borderColor: 'var(--sl-color-gray-4)',
              '--ring-color': 'var(--sl-color-gray-4)'
            } as React.CSSProperties}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = 'var(--sl-color-gray-4)';
                e.currentTarget.style.transform = 'translateY(-1px) scale(1.02)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = 'var(--sl-color-gray-5)';
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
              }
            }}
            onClick={handleLogout}
            disabled={isLoading}
          >
            {isLoading ? (
              <span className={clsx("flex items-center gap-2")}>
                <div 
                  className={clsx("animate-spin rounded-full h-4 w-4 border-b-2 border-transparent")}
                  style={{ borderBottomColor: 'var(--sl-color-white)' }}
                ></div>
                Logging out...
              </span>
            ) : (
              'Logout'
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ReactGuestOnly;
