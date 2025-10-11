/** @jsxImportSource react */
import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { oauthService, supabase } from '@kbve/astropad';

const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};

export const GithubSignInButton: React.FC = () => {
  const loading = useStore(oauthService.loadingAtom);
  const provider = useStore(oauthService.providerAtom);
  const isLoading = loading && provider === 'github';

  const handleClick = useCallback(() => {
    oauthService.signInWithGithub();
  }, []);

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-label="Sign in with GitHub"
      aria-busy={isLoading}
      aria-disabled={loading}
      className={cn(
        "group relative overflow-hidden",
        "flex items-center justify-center gap-3 w-full py-2.5 px-5 min-h-[42px] rounded-xl font-medium transition-all ease-out duration-300",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        loading && "opacity-50 cursor-not-allowed"
      )}
      style={{
        // Use Starlight CSS variables for proper theming
        backgroundColor: 'var(--sl-color-gray-6)',
        borderColor: 'var(--sl-color-gray-5)',
        color: 'var(--sl-color-white)',
        border: '1px solid var(--sl-color-gray-5)',
        '--tw-ring-color': 'var(--sl-color-accent)',
      } as React.CSSProperties}
      onMouseEnter={(e) => {
        const target = e.currentTarget as HTMLElement;
        target.style.backgroundColor = 'var(--sl-color-gray-5)';
        target.style.borderColor = 'var(--sl-color-gray-4)';
      }}
      onMouseLeave={(e) => {
        const target = e.currentTarget as HTMLElement;
        target.style.backgroundColor = 'var(--sl-color-gray-6)';
        target.style.borderColor = 'var(--sl-color-gray-5)';
      }}
      type="button"
    >
      <span className="absolute right-0 w-8 h-32 -mt-12 bg-white/30 dark:bg-white/20 opacity-10 rotate-12 translate-x-12 group-hover:-translate-x-40 transition-all duration-1000 ease-out pointer-events-none"></span>
      
      {isLoading ? (
        <div className="relative flex items-center justify-center gap-3">
          <div
            className="w-4 h-4 border-2 rounded-full animate-spin"
            style={{
              borderColor: 'var(--sl-color-gray-3)',
              borderTopColor: 'var(--sl-color-white)',
            }}
          ></div>
          <span className="text-sm font-medium leading-relaxed">Connecting...</span>
        </div>
      ) : (
        <div className="relative flex items-center justify-center gap-3">
          <img
            className="w-4 h-4 transition-transform duration-300 group-hover:scale-110 drop-shadow-sm"
            src="https://kbve.com/assets/icons/svg/github.svg"
            alt="GitHub"
            aria-hidden="true"
          />
          <span className="text-sm font-medium leading-relaxed">Continue with GitHub</span>
        </div>
      )}
    </button>
  );
};

export const DiscordSignInButton: React.FC = () => {
  const loading = useStore(oauthService.loadingAtom);
  const provider = useStore(oauthService.providerAtom);
  const isLoading = loading && provider === 'discord';

  const handleClick = useCallback(() => {
    oauthService.signInWithDiscord();
  }, []);

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-label="Sign in with Discord"
      aria-busy={isLoading}
      aria-disabled={loading}
      className={cn(
        "group relative overflow-hidden",
        "flex items-center justify-center gap-3 w-full py-2.5 px-5 min-h-[42px] rounded-xl font-medium transition-all ease-out duration-300",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        loading && "opacity-50 cursor-not-allowed"
      )}
      style={{
        // Discord brand colors with Starlight integration
        backgroundColor: '#5865F2',
        borderColor: 'var(--sl-color-gray-4)',
        color: 'var(--sl-color-white)',
        border: '1px solid var(--sl-color-gray-4)',
        '--tw-ring-color': 'var(--sl-color-accent)',
      } as React.CSSProperties}
      onMouseEnter={(e) => {
        const target = e.currentTarget as HTMLElement;
        target.style.backgroundColor = '#4752c4';
        target.style.borderColor = 'var(--sl-color-accent)';
      }}
      onMouseLeave={(e) => {
        const target = e.currentTarget as HTMLElement;
        target.style.backgroundColor = '#5865F2';
        target.style.borderColor = 'var(--sl-color-gray-4)';
      }}
      type="button"
    >
      <span className="absolute right-0 w-8 h-32 -mt-12 bg-white/30 dark:bg-white/20 opacity-10 rotate-12 translate-x-12 group-hover:-translate-x-40 transition-all duration-1000 ease-out pointer-events-none"></span>

      {isLoading ? (
        <div className="relative flex items-center justify-center gap-3">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          <span className="text-sm font-medium leading-relaxed">Connecting...</span>
        </div>
      ) : (
        <div className="relative flex items-center justify-center gap-3">
          <img
            className="w-4 h-4 transition-transform duration-300 group-hover:scale-110 drop-shadow-sm"
            src="https://kbve.com/assets/icons/svg/discord.svg"
            alt="Discord"
            aria-hidden="true"
          />
          <span className="text-sm font-medium leading-relaxed">Continue with Discord</span>
        </div>
      )}
    </button>
  );
};

export const TwitchSignInButton: React.FC = () => {
  const loading = useStore(oauthService.loadingAtom);
  const provider = useStore(oauthService.providerAtom);
  const isLoading = loading && provider === 'twitch';

  const handleClick = useCallback(() => {
    oauthService.signInWithTwitch();
  }, []);

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      aria-label="Sign in with Twitch"
      aria-busy={isLoading}
      aria-disabled={loading}
      className={cn(
        "group relative overflow-hidden",
        "flex items-center justify-center gap-3 w-full py-2.5 px-5 min-h-[42px] rounded-xl font-medium transition-all ease-out duration-300",
        "focus:outline-none focus:ring-2 focus:ring-offset-2",
        loading && "opacity-50 cursor-not-allowed"
      )}
      style={{
        // Twitch brand colors with Starlight integration
        backgroundColor: '#9146FF',
        borderColor: 'var(--sl-color-gray-4)',
        color: 'var(--sl-color-white)',
        border: '1px solid var(--sl-color-gray-4)',
        '--tw-ring-color': 'var(--sl-color-accent)',
      } as React.CSSProperties}
      onMouseEnter={(e) => {
        const target = e.currentTarget as HTMLElement;
        target.style.backgroundColor = '#7d3ed8';
        target.style.borderColor = 'var(--sl-color-accent)';
      }}
      onMouseLeave={(e) => {
        const target = e.currentTarget as HTMLElement;
        target.style.backgroundColor = '#9146FF';
        target.style.borderColor = 'var(--sl-color-gray-4)';
      }}
      type="button"
    >
      <span className="absolute right-0 w-8 h-32 -mt-12 bg-white/30 dark:bg-white/20 opacity-10 rotate-12 translate-x-12 group-hover:-translate-x-40 transition-all duration-1000 ease-out pointer-events-none"></span>

      {isLoading ? (
        <div className="relative flex items-center justify-center gap-3">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          <span className="text-sm font-medium leading-relaxed">Connecting...</span>
        </div>
      ) : (
        <div className="relative flex items-center justify-center gap-3">
          <img
            className="w-4 h-4 transition-transform duration-300 group-hover:scale-110 drop-shadow-sm"
            src="https://kbve.com/assets/icons/svg/twitch.svg"
            alt="Twitch"
            aria-hidden="true"
          />
          <span className="text-sm font-medium leading-relaxed">Continue with Twitch</span>
        </div>
      )}
    </button>
  );
};

export const SolanaSignInButton: React.FC<{ 
  captchaToken?: string | null; 
  captchaRef?: React.RefObject<any>;
}> = ({ captchaToken, captchaRef }) => {
  const loading = useStore(oauthService.loadingAtom);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipTimeoutId, setTooltipTimeoutId] = useState<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (captchaToken && showTooltip) {
      const timeoutId = setTimeout(() => {
        setShowTooltip(false);
      }, 1500); 
      
      setTooltipTimeoutId(timeoutId);
      
      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
    }
  }, [captchaToken, showTooltip]);

  const handleSolanaSignIn = useCallback(async () => {
    if (!captchaToken) {
      setShowTooltip(true);
      
      if (tooltipTimeoutId) {
        clearTimeout(tooltipTimeoutId);
        setTooltipTimeoutId(null);
      }
      
      if (captchaRef?.current && typeof window !== 'undefined') {
        try {
          let captchaElement = captchaRef.current;
          
          if (captchaElement && typeof captchaElement.scrollIntoView !== 'function') {
            // HCaptcha might wrap the actual DOM element, try to find it
            const captchaContainer = document.querySelector('[data-hcaptcha-widget-id]') || 
                                   document.querySelector('.h-captcha') ||
                                   document.querySelector('[id*="hcaptcha"]');
            
            if (captchaContainer && typeof captchaContainer.scrollIntoView === 'function') {
              captchaElement = captchaContainer;
            }
          }
          
          if (captchaElement && typeof captchaElement.scrollIntoView === 'function') {
            captchaElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
            
            captchaElement.style.outline = '3px solid #fbbf24';
            captchaElement.style.outlineOffset = '4px';
            captchaElement.style.borderRadius = '8px';
            
            setTimeout(() => {
              captchaElement.style.outline = '';
              captchaElement.style.outlineOffset = '';
              captchaElement.style.borderRadius = '';
            }, 3000);
          }
        } catch (error) {
          console.error('🚨 Error scrolling to captcha:', error);
        }
      }
      
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithWeb3({
        chain: 'solana',
        statement: 'I accept the Terms of Service at https://kbve.com/legal/',
        options: {
          url: typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback',
          captchaToken
        }
      });

      if (error) throw error;
      
      if (data && data.session?.user) {
        if (captchaRef?.current) {
          captchaRef.current.resetCaptcha();
        }
        // Redirect to profile page on successful authentication
        if (typeof window !== 'undefined') {
          window.location.href = `${window.location.origin}/profile/`;
        }
      }
    } catch (error: any) {
      console.error('Solana sign-in error:', error);
      oauthService.errorAtom.set(error.message || 'Solana sign-in failed');
      
      if (captchaRef?.current) {
        captchaRef.current.resetCaptcha();
      }
    }
  }, [captchaToken, captchaRef, tooltipTimeoutId]);

  const handleMouseEnter = useCallback(() => {
    if (!captchaToken) {
      setShowTooltip(true);
      
      if (tooltipTimeoutId) {
        clearTimeout(tooltipTimeoutId);
        setTooltipTimeoutId(null);
      }
    }
  }, [captchaToken, tooltipTimeoutId]);

  const handleMouseLeave = useCallback(() => {
    if (!captchaToken && showTooltip) {
      const timeoutId = setTimeout(() => {
        setShowTooltip(false);
      }, 1000); 
      
      setTooltipTimeoutId(timeoutId);
    }
  }, [captchaToken, showTooltip]);

  const isDisabled = !captchaToken || loading;

  return (
    <div className="relative w-full">
      <button
        onClick={handleSolanaSignIn}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        disabled={isDisabled}
        className={cn(
          "group relative overflow-hidden",
          "flex items-center justify-center gap-3 w-full py-2.5 px-5 min-h-[48px] rounded-xl font-semibold transition-all ease-out duration-300",
          "focus:outline-none focus:ring-2 focus:ring-offset-2",
          isDisabled && "opacity-50 cursor-not-allowed"
        )}
        style={{
          // Solana brand gradient with Starlight integration
          background: 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)',
          borderColor: 'var(--sl-color-gray-4)',
          color: 'var(--sl-color-white)',
          border: '1px solid var(--sl-color-gray-4)',
          '--tw-ring-color': 'var(--sl-color-accent)',
          textShadow: '0 1px 2px rgba(0,0,0,0.5)'
        } as React.CSSProperties}
        onMouseEnter={(e) => {
          const target = e.currentTarget as HTMLElement;
          target.style.background = 'linear-gradient(135deg, #8438E6 0%, #12D182 100%)';
          target.style.borderColor = 'var(--sl-color-accent)';
        }}
        onMouseLeave={(e) => {
          const target = e.currentTarget as HTMLElement;
          target.style.background = 'linear-gradient(135deg, #9945FF 0%, #14F195 100%)';
          target.style.borderColor = 'var(--sl-color-gray-4)';
        }}
        type="button"
      >
        {/* ✨ Shimmer effect */}
        <span
          className="absolute right-0 w-10 h-32 -mt-12 bg-white/40 dark:bg-white/20 opacity-10 rotate-12 blur-sm translate-x-12 group-hover:-translate-x-40 transition-transform duration-1000 ease-out pointer-events-none"
        ></span>
        
        {loading ? (
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span className="text-sm font-medium leading-relaxed">Connecting...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <svg
              className="w-5 h-5 transition-transform duration-300 group-hover:scale-110 drop-shadow"
              fill="currentColor"
              viewBox="0 0 397.7 311.7"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="solana-gradient-1" x1="360.8791" y1="351.4553" x2="141.213" y2="-69.2936" gradientTransform="matrix(1 0 0 -1 0 314)">
                  <stop offset="0" stopColor="#00FFA3" />
                  <stop offset="1" stopColor="#DC1FFF" />
                </linearGradient>
                <linearGradient id="solana-gradient-2" x1="264.8291" y1="401.6014" x2="45.163" y2="-19.1475" gradientTransform="matrix(1 0 0 -1 0 314)">
                  <stop offset="0" stopColor="#00FFA3" />
                  <stop offset="1" stopColor="#DC1FFF" />
                </linearGradient>
                <linearGradient id="solana-gradient-3" x1="312.5484" y1="376.688" x2="92.8822" y2="-44.061" gradientTransform="matrix(1 0 0 -1 0 314)">
                  <stop offset="0" stopColor="#00FFA3" />
                  <stop offset="1" stopColor="#DC1FFF" />
                </linearGradient>
              </defs>
              <path fill="url(#solana-gradient-1)" d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z" />
              <path fill="url(#solana-gradient-2)" d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z" />
              <path fill="url(#solana-gradient-3)" d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4c5.8,0,8.7-7,4.6-11.1L333.1,120.1z" />
            </svg>
            <span className="text-sm font-semibold tracking-wide">Continue with Solana</span>
          </div>
        )}
      </button>
      
      {showTooltip && !captchaToken && (
        <div 
          className="absolute z-[9999] px-3 py-2 text-sm rounded-lg shadow-lg pointer-events-none border whitespace-nowrap
            bg-red-600 text-white border-red-500"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 'calc(100% + 8px)',
            minWidth: '220px',
            textAlign: 'center'
          }}
        >
          <div className="font-semibold mb-1 text-sm">⚠️ Captcha Required</div>
          <div className="text-xs leading-relaxed">Complete the hCaptcha challenge below to continue with Solana</div>
          <div 
            className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent border-t-red-600"
          />
        </div>
      )}
    </div>
  );
};

export const ReactOAuth: React.FC<{
  showGithub?: boolean;
  showDiscord?: boolean;
  showTwitch?: boolean;
  showSolana?: boolean;
  captchaToken?: string | null;
  captchaRef?: React.RefObject<any>;
  title?: string;
  description?: string;
}> = ({
  showGithub = true,
  showDiscord = true,
  showTwitch = true,
  showSolana = true,
  captchaToken,
  captchaRef,
  title = "Continue with your preferred method",
  description = "Sign in quickly using one of these options"
}) => {
  const error = useStore(oauthService.errorAtom);
  const success = useStore(oauthService.successAtom);

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold mb-2 leading-relaxed text-[var(--sl-color-white)]">{title}</h2>
        <p className="text-sm leading-relaxed text-[var(--sl-color-gray-3)]">{description}</p>
      </div>

      {error && (
        <div 
          className="p-3 rounded-lg text-center text-sm font-medium mb-4 border leading-relaxed"
          style={{
            backgroundColor: 'var(--sl-color-red-high)',
            borderColor: 'var(--sl-color-red-low)',
            color: 'var(--sl-color-red-low)'
          }}
        >
          {error}
        </div>
      )}
      {success && (
        <div 
          className="p-3 rounded-lg text-center text-sm font-medium mb-4 border leading-relaxed"
          style={{
            backgroundColor: 'var(--sl-color-green-high)',
            borderColor: 'var(--sl-color-green-low)',
            color: 'var(--sl-color-green-low)'
          }}
        >
          {success}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {showGithub && <GithubSignInButton />}
        {showDiscord && <DiscordSignInButton />}
        {showTwitch && <TwitchSignInButton />}
        {showSolana && (
          <SolanaSignInButton
            captchaToken={captchaToken}
            captchaRef={captchaRef}
          />
        )}
      </div>
    </div>
  );
};

export { oauthService };

export const signInWithGithub = () => oauthService.signInWithGithub();
export const signInWithDiscord = () => oauthService.signInWithDiscord();
export const signInWithTwitch = () => oauthService.signInWithTwitch();
