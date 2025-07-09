/** @jsxImportSource react */
import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { oauthService, supabase } from '@kbve/astropad';

// import { oauthService } from './ServiceOAuth';
// import { supabase } from '../../states/supabaseClient';

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
      className={cn(
        "group relative overflow-hidden",
        "flex items-center justify-center gap-3 w-full py-2.5 px-5 min-h-[42px] rounded font-medium transition-all ease-out duration-300",
        "bg-[#24292f] hover:bg-gradient-to-r hover:from-[#24292f] hover:to-[#2f363d] text-white",
        "hover:ring-2 hover:ring-offset-2 hover:ring-[var(--sl-color-accent)]/50",
        "dark:bg-[#24292f] dark:hover:from-[#24292f] dark:hover:to-[#2f363d] dark:text-white",
        "bg-[#f6f8fa] hover:from-[#f6f8fa] hover:to-[#e1e4e8] text-[#24292f] hover:ring-[#24292f]/20",
        loading && "opacity-50 cursor-not-allowed"
      )}
      type="button"
    >
      <span className="absolute right-0 w-8 h-32 -mt-12 transition-all duration-1000 transform translate-x-12 bg-white opacity-10 rotate-12 group-hover:-translate-x-40 ease"></span>
      
      {isLoading ? (
        <div className="relative flex items-center justify-center gap-3">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          <span className="text-sm font-medium leading-relaxed">Connecting...</span>
        </div>
      ) : (
        <div className="relative flex items-center justify-center gap-3">
          <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110 drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.43 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.11-.75.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.7.42.36.79 1.09.79 2.2 0 1.59-.01 2.87-.01 3.26 0 .31.21.68.8.56C20.71 21.45 24 17.12 24 12.02 24 5.74 18.27.5 12 .5z"/>
          </svg>
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
      className={cn(
        "group relative overflow-hidden",
        "flex items-center justify-center gap-3 w-full py-2.5 px-5 min-h-[42px] rounded font-medium transition-all ease-out duration-300",
        "bg-[#5865F2] hover:bg-gradient-to-r hover:from-[#5865F2] hover:to-[#4752c4] text-white",
        "hover:ring-2 hover:ring-offset-2 hover:ring-[var(--sl-color-accent)]/50",
        "dark:bg-[#5865F2] dark:hover:from-[#5865F2] dark:hover:to-[#4752c4] dark:text-white",
        "bg-[#5865F2] hover:from-[#5865F2] hover:to-[#4752c4] text-white",
        loading && "opacity-50 cursor-not-allowed"
      )}
      type="button"
    >
      <span className="absolute right-0 w-8 h-32 -mt-12 transition-all duration-1000 transform translate-x-12 bg-white opacity-10 rotate-12 group-hover:-translate-x-40 ease"></span>
      
      {isLoading ? (
        <div className="relative flex items-center justify-center gap-3">
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          <span className="text-sm font-medium leading-relaxed">Connecting...</span>
        </div>
      ) : (
        <div className="relative flex items-center justify-center gap-3">
          <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110 drop-shadow-sm" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276c-.598.3428-1.2205.6447-1.8733.8923a.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
          </svg>
          <span className="text-sm font-medium leading-relaxed">Continue with Discord</span>
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
  const [tooltipTimeoutId, setTooltipTimeoutId] = useState<NodeJS.Timeout | null>(null);

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
          "flex items-center justify-center gap-3 w-full py-2.5 px-5 min-h-[42px] rounded font-medium transition-all ease-out duration-300",
          "bg-gradient-to-r from-[#9945FF] to-[#14F195] text-white",
          "hover:from-[#8A3FD9] hover:to-[#00D4AA]",
          "hover:ring-2 hover:ring-offset-2 hover:ring-[var(--sl-color-accent)]/50",
          isDisabled 
            ? "opacity-50 cursor-not-allowed" 
            : ""
        )}
        type="button"
      >
        <span className="absolute right-0 w-8 h-32 -mt-12 transition-all duration-1000 transform translate-x-12 bg-white opacity-10 rotate-12 group-hover:-translate-x-40 ease"></span>
        
        {loading ? (
          <div className="relative flex items-center justify-center gap-3">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            <span className="text-sm font-medium leading-relaxed">Connecting...</span>
          </div>
        ) : (
          <div className="relative flex items-center justify-center gap-3">
            <svg className="w-4 h-4 transition-transform duration-300 group-hover:scale-110 drop-shadow-sm" fill="currentColor" viewBox="0 0 397.7 311.7" aria-hidden="true">
              <defs>
                <linearGradient id="solana-gradient-1" gradientUnits="userSpaceOnUse" x1="360.8791" y1="351.4553" x2="141.213" y2="-69.2936" gradientTransform="matrix(1 0 0 -1 0 314)">
                  <stop offset="0" stopColor="#00FFA3"/>
                  <stop offset="1" stopColor="#DC1FFF"/>
                </linearGradient>
                <linearGradient id="solana-gradient-2" gradientUnits="userSpaceOnUse" x1="264.8291" y1="401.6014" x2="45.163" y2="-19.1475" gradientTransform="matrix(1 0 0 -1 0 314)">
                  <stop offset="0" stopColor="#00FFA3"/>
                  <stop offset="1" stopColor="#DC1FFF"/>
                </linearGradient>
                <linearGradient id="solana-gradient-3" gradientUnits="userSpaceOnUse" x1="312.5484" y1="376.688" x2="92.8822" y2="-44.061" gradientTransform="matrix(1 0 0 -1 0 314)">
                  <stop offset="0" stopColor="#00FFA3"/>
                  <stop offset="1" stopColor="#DC1FFF"/>
                </linearGradient>
              </defs>
              <path fill="url(#solana-gradient-1)" d="M64.6,237.9c2.4-2.4,5.7-3.8,9.2-3.8h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5
                c-5.8,0-8.7-7-4.6-11.1L64.6,237.9z"/>
              <path fill="url(#solana-gradient-2)" d="M64.6,3.8C67.1,1.4,70.4,0,73.8,0h317.4c5.8,0,8.7,7,4.6,11.1l-62.7,62.7c-2.4,2.4-5.7,3.8-9.2,3.8H6.5
                c-5.8,0-8.7-7-4.6-11.1L64.6,3.8z"/>
              <path fill="url(#solana-gradient-3)" d="M333.1,120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8,0-8.7,7-4.6,11.1l62.7,62.7c2.4,2.4,5.7,3.8,9.2,3.8h317.4
                c5.8,0,8.7-7,4.6-11.1L333.1,120.1z"/>
            </svg>
            <span className="text-sm font-medium leading-relaxed">Continue with Solana</span>
          </div>
        )}
      </button>
      
      {showTooltip && !captchaToken && (
        <div 
          className="absolute z-[9999] px-3 py-2 text-sm rounded shadow-lg pointer-events-none border"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 'calc(100% + 8px)',
            minWidth: '200px',
            textAlign: 'center',
            backgroundColor: 'var(--sl-color-gray-6, #272727)',
            color: 'var(--sl-color-white, #fff)',
            borderColor: 'var(--sl-color-gray-5, #383838)'
          }}
        >
          <div className="text-yellow-300 font-semibold mb-1.5 text-sm">⚠️ Captcha Required</div>
          <div className="text-xs leading-relaxed">Complete the hCaptcha challenge {captchaRef ? 'below' : ''} to continue</div>
          <div 
            className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid var(--sl-color-gray-6, #272727)'
            }}
          />
        </div>
      )}
    </div>
  );
};

export const ReactOAuth: React.FC<{
  showGithub?: boolean;
  showDiscord?: boolean;
  showSolana?: boolean;
  captchaToken?: string | null;
  captchaRef?: React.RefObject<any>;
  title?: string;
  description?: string;
}> = ({ 
  showGithub = true, 
  showDiscord = true, 
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
