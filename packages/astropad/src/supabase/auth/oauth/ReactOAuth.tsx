/** @jsxImportSource react */
import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { oauthService, supabase } from '@kbve/astropad';

// Utility function to combine clsx and twMerge
const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};

// Individual OAuth Button Components
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
        "flex items-center justify-center gap-2 w-full py-2 px-4 min-h-[44px] rounded-lg bg-black text-white font-semibold shadow-md border border-gray-700 hover:bg-gray-800 hover:border-gray-600 transition-all duration-200",
        loading && "opacity-50 cursor-not-allowed"
      )}
      type="button"
    >
      {isLoading ? (
        <>
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          Connecting...
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.43 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.11-.75.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.7.42.36.79 1.09.79 2.2 0 1.59-.01 2.87-.01 3.26 0 .31.21.68.8.56C20.71 21.45 24 17.12 24 12.02 24 5.74 18.27.5 12 .5z"/>
          </svg>
          Continue with GitHub
        </>
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
        "flex items-center justify-center gap-2 w-full py-2 px-4 min-h-[44px] rounded-lg bg-[#5865F2] text-white font-semibold shadow-md border border-[#4752c4] hover:bg-[#4752c4] hover:border-[#3c4399] transition-all duration-200",
        loading && "opacity-50 cursor-not-allowed"
      )}
      type="button"
    >
      {isLoading ? (
        <>
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
          Connecting...
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276c-.598.3428-1.2205.6447-1.8733.8923a.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
          </svg>
          Continue with Discord
        </>
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

  // Clear any existing timeout when captcha is solved
  useEffect(() => {
    if (captchaToken && showTooltip) {
      // Delay hiding the tooltip when captcha is solved to give user feedback
      const timeoutId = setTimeout(() => {
        setShowTooltip(false);
      }, 1500); // 1.5 second delay after captcha is solved
      
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
      
      // Clear any existing timeout
      if (tooltipTimeoutId) {
        clearTimeout(tooltipTimeoutId);
        setTooltipTimeoutId(null);
      }
      
      // Scroll to captcha and highlight it
      if (captchaRef?.current) {
        try {
          // Try to get the actual DOM element from the HCaptcha ref
          let captchaElement = captchaRef.current;
          
          // If it's a React component ref, try to get the DOM element
          if (captchaElement && typeof captchaElement.scrollIntoView !== 'function') {
            // HCaptcha might wrap the actual DOM element, try to find it
            const captchaContainer = document.querySelector('[data-hcaptcha-widget-id]') || 
                                   document.querySelector('.h-captcha') ||
                                   document.querySelector('[id*="hcaptcha"]');
            
            if (captchaContainer && typeof captchaContainer.scrollIntoView === 'function') {
              captchaElement = captchaContainer;
            }
          }
          
          // Scroll to the element if it has scrollIntoView method
          if (captchaElement && typeof captchaElement.scrollIntoView === 'function') {
            captchaElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
            
            // Add temporary outline to captcha
            captchaElement.style.outline = '3px solid #fbbf24';
            captchaElement.style.outlineOffset = '4px';
            captchaElement.style.borderRadius = '8px';
            
            // Remove outline after 3 seconds
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
          url: `${window.location.origin}/auth/callback`,
          captchaToken
        }
      });

      if (error) throw error;
      
      if (data && data.session?.user) {
        // Reset captcha on successful sign-in
        if (captchaRef?.current) {
          captchaRef.current.resetCaptcha();
        }
        // Redirect to profile page on successful authentication
        window.location.href = `${window.location.origin}/profile/`;
      }
    } catch (error: any) {
      console.error('Solana sign-in error:', error);
      oauthService.errorAtom.set(error.message || 'Solana sign-in failed');
      
      // Reset captcha on error
      if (captchaRef?.current) {
        captchaRef.current.resetCaptcha();
      }
    }
  }, [captchaToken, captchaRef, tooltipTimeoutId]);

  const handleMouseEnter = useCallback(() => {
    if (!captchaToken) {
      setShowTooltip(true);
      
      // Clear any existing timeout when user hovers
      if (tooltipTimeoutId) {
        clearTimeout(tooltipTimeoutId);
        setTooltipTimeoutId(null);
      }
    }
  }, [captchaToken, tooltipTimeoutId]);

  const handleMouseLeave = useCallback(() => {
    if (!captchaToken && showTooltip) {
      // Add a delay before hiding tooltip on mouse leave
      const timeoutId = setTimeout(() => {
        setShowTooltip(false);
      }, 1000); // 1 second delay before hiding on mouse leave
      
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
          "flex items-center justify-center gap-2 w-full py-2 px-4 min-h-[44px] rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-md border border-purple-400 transition-all duration-200",
          isDisabled 
            ? "opacity-50 cursor-not-allowed border-purple-300" 
            : "hover:from-purple-600 hover:to-pink-600 hover:border-purple-300"
        )}
        type="button"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            Connecting...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 397.7 311.7" aria-hidden="true">
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
            Continue with Solana
          </>
        )}
      </button>
      
      {/* Tooltip that appears on hover when disabled */}
      {showTooltip && !captchaToken && (
        <div 
          className="absolute z-[9999] px-3 py-2 text-sm text-white bg-black rounded shadow-lg pointer-events-none"
          style={{
            left: '50%',
            transform: 'translateX(-50%)',
            bottom: 'calc(100% + 8px)',
            minWidth: '200px',
            textAlign: 'center'
          }}
        >
          <div className="text-yellow-300 font-semibold mb-1">⚠️ Captcha Required</div>
          <div>Complete the hCaptcha challenge {captchaRef ? 'below' : ''} to continue</div>
          {/* Tooltip arrow */}
          <div 
            className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid black'
            }}
          />
        </div>
      )}
    </div>
  );
};

// Main OAuth Component that can be used as a complete OAuth section
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
      {/* Header */}
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
        <p className="text-zinc-400 text-sm">{description}</p>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-center text-sm mb-4">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-center text-sm mb-4">
          {success}
        </div>
      )}

      {/* OAuth Buttons */}
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

// Export individual components for flexibility
export { oauthService };

// Backward compatibility exports
export const signInWithGithub = () => oauthService.signInWithGithub();
export const signInWithDiscord = () => oauthService.signInWithDiscord();
