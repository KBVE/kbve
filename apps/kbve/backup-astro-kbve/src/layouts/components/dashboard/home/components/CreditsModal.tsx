import React, { useEffect, useCallback, useRef, memo, useState } from 'react';
import { clsx } from 'src/utils/tw';
import Portal from 'src/layouts/components/ui/Portal';
import { 
  X, 
  Wallet, 
  Star, 
  ExternalLink, 
  BookOpen, 
  Award, 
  Coins, 
  TrendingUp,
  Gift,
  Users,
  ShoppingCart
} from 'lucide-react';

interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentBalance: number;
  membershipTier: 'Guest' | 'Basic' | 'Premium' | 'VIP';
}

// Utility function to format numbers with K/M suffixes
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return (Math.floor(num / 100000) / 10) + 'M';
  } else if (num >= 1000) {
    return (Math.floor(num / 100) / 10) + 'K';
  } else {
    return num.toString();
  }
}

const CreditsModal: React.FC<CreditsModalProps> = memo(({ 
  isOpen, 
  onClose, 
  currentBalance, 
  membershipTier 
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  
  // Animation states
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  
  // Smoke animation states
  const [showSmoke, setShowSmoke] = useState(false);
  const [smokePosition, setSmokePosition] = useState({ x: 0, y: 0 });
  const [smokeFading, setSmokeFading] = useState(false);

  // Function to trigger smoke animation at click position
  const triggerSmokeEffect = useCallback((clientX: number, clientY: number) => {
    setSmokePosition({ x: clientX, y: clientY });
    setShowSmoke(true);
    setSmokeFading(false);
    
    // Start fade-out after 1.2s to let the gif play most of its loop
    setTimeout(() => {
      setSmokeFading(true);
    }, 1500);
    
    // Hide smoke completely after fade animation (1.5s total)
    setTimeout(() => {
      setShowSmoke(false);
      setSmokeFading(false);
    }, 1800);
  }, []);

  // Memoized event handlers to prevent unnecessary re-renders
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !isClosing && isVisible) {
      e.preventDefault();
      // We'll call handleClose directly here to avoid circular dependency
      if (isClosing || !isOpen || !isVisible) return;
      
      setIsClosing(true);
      setIsVisible(false);
      
      // Clear any existing timeout
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
      
      // Wait for animation to complete before calling onClose
      closeTimeoutRef.current = setTimeout(() => {
        setIsClosing(false);
        // Restore body scroll immediately when closing
        document.body.style.overflow = '';
        document.removeEventListener('keydown', handleKeyDown);
        onClose();
        closeTimeoutRef.current = null;
      }, 350);
    }
  }, [isClosing, isVisible, isOpen, onClose]);

  // Enhanced close handler with animation - now prevents double calls
  const handleClose = useCallback((clientX?: number, clientY?: number) => {
    // Prevent multiple calls or calls when already closing
    if (isClosing || !isOpen || !isVisible) return;
    
    // Trigger smoke effect if click coordinates are provided
    if (clientX !== undefined && clientY !== undefined) {
      triggerSmokeEffect(clientX, clientY);
    }
    
    setIsClosing(true);
    setIsVisible(false);
    
    // Clear any existing timeout
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    
    // Wait for animation to complete before calling onClose
    closeTimeoutRef.current = setTimeout(() => {
      setIsClosing(false);
      // Restore body scroll immediately when closing
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      onClose();
      closeTimeoutRef.current = null;
    }, 350);
  }, [onClose, isClosing, isOpen, isVisible, handleKeyDown, triggerSmokeEffect]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === e.currentTarget && !isClosing && isVisible) {
      handleClose(e.clientX, e.clientY);
    }
  }, [isClosing, handleClose, isVisible]);

  const handleModalClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Close button handler with additional protection
  const handleCloseButtonClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isClosing) {
      handleClose(e.clientX, e.clientY);
    }
  }, [handleClose, isClosing]);

  // Memoized utility functions
  const getTierColor = useCallback((tier: string) => {
    switch (tier) {
      case 'VIP': return 'text-purple-400';
      case 'Premium': return 'text-yellow-400';
      case 'Basic': return 'text-green-400';
      default: return 'text-zinc-400';
    }
  }, []);

  const getTierBadge = useCallback((tier: string) => {
    switch (tier) {
      case 'VIP': return 'bg-purple-500/10 border-purple-500/20';
      case 'Premium': return 'bg-yellow-500/10 border-yellow-500/20';
      case 'Basic': return 'bg-green-500/10 border-green-500/20';
      default: return 'bg-zinc-500/10 border-zinc-500/20';
    }
  }, []);
  // Effect to handle animation states and modal lifecycle
  useEffect(() => {
    if (isOpen && !isClosing) {
      // Opening the modal
      setIsVisible(true);
      
      // Store current focus to restore later
      previousFocusRef.current = document.activeElement as HTMLElement;
      
      // Add modal classes and prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      
      // Add keyboard event listener for ESC key
      document.addEventListener('keydown', handleKeyDown);
      
      // Ensure any existing modal containers are properly configured
      const modalRoot = document.getElementById('modal-root');
      if (modalRoot) {
        modalRoot.classList.remove('pointer-events-none');
        modalRoot.classList.add('pointer-events-auto');
      }

      // Focus the modal container after a short delay
      const focusTimeout = setTimeout(() => {
        if (modalRef.current) {
          modalRef.current.focus();
        }
      }, 100);

      return () => {
        clearTimeout(focusTimeout);
      };
    } else if (!isOpen && !isClosing) {
      // Modal is fully closed, cleanup
      setIsVisible(false);
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      
      // Restore focus to previous element
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
      
      // Disable pointer events on modal container when modal is closed
      const modalRoot = document.getElementById('modal-root');
      if (modalRoot) {
        setTimeout(() => {
          if (modalRoot.children.length === 0) {
            modalRoot.classList.remove('pointer-events-auto');
            modalRoot.classList.add('pointer-events-none');
          }
        }, 50);
      }
    }
  }, [isOpen, isClosing, handleKeyDown]);

  // Cleanup effect for component unmounting - only handle timeout cleanup
  useEffect(() => {
    return () => {
      // Clean up any pending timeouts when component unmounts
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  // Preload smoke animation for better performance
  useEffect(() => {
    const img = new Image();
    img.src = '/assets/images/ui/animation/smoke/smoke2.gif';
  }, []);

  // Don't render anything if modal should not be visible
  if (!isOpen && !isVisible) return null;

  return (
    <Portal>
      {/* Smoke animation effect */}
      {showSmoke && (
        <div
          className="fixed pointer-events-none z-[100000]"
          style={{
            left: smokePosition.x - 64, // Center the 128px (w-32) wide animation
            top: smokePosition.y - 64,  // Center the 128px (h-32) tall animation
          }}
        >
          <img
            src="/assets/images/ui/animation/smoke/smoke2.gif"
            alt=""
            className={clsx(
              "w-32 h-32 object-contain transition-opacity duration-300",
              "sepia saturate-200 hue-rotate-180 brightness-125", // Cyan color overlay
              smokeFading ? "opacity-0" : "opacity-90"
            )}
            style={{
              imageRendering: 'auto',
              filter: 'drop-shadow(0 0 16px rgba(6, 182, 212, 0.6)) brightness(1.2)',
              mixBlendMode: 'screen'
            }}
          />
        </div>
      )}
      
      <div 
        className={clsx(
          "fixed inset-0 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm",
          "z-[99999] transition-all duration-[350ms] ease-out",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
      >
        <div 
          ref={modalRef}
          className={clsx(
            "bg-zinc-900 rounded-xl border border-zinc-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl",
            "relative z-[99999] focus:outline-none mx-4 md:mx-0",
            "transition-all duration-[350ms] ease-out transform",
            isVisible 
              ? "opacity-100 scale-100 translate-y-0" 
              : "opacity-0 scale-90 translate-y-8"
          )}
          onClick={handleModalClick}
          tabIndex={-1}
          role="document"
        >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h2 id="modal-title" className="text-xl font-bold text-white">Credits Overview</h2>
              <p id="modal-description" className="text-sm text-zinc-400">Your digital currency on KBVE</p>
            </div>
          </div>
          <button
            onClick={handleCloseButtonClick}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors duration-200"
            aria-label="Close modal"
            type="button"
            disabled={isClosing}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Balance Section */}
        <div className="p-6 border-b border-zinc-700">
          <div className="bg-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-zinc-400 text-sm">Current Balance</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {formatNumber(currentBalance)}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  Exact: {currentBalance.toLocaleString()} credits
                </p>
              </div>
              <div className="text-right">
                <p className="text-zinc-400 text-sm">Membership Tier</p>
                <div className={clsx(
                  "inline-flex items-center px-3 py-1 rounded-full text-sm border mt-1",
                  getTierBadge(membershipTier)
                )}>
                  <Star className="w-4 h-4 mr-1" />
                  <span className={getTierColor(membershipTier)}>
                    {membershipTier}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* What are Credits Section */}
        <div className="p-6 border-b border-zinc-700">
          <h3 className="text-lg font-semibold text-white mb-3 flex items-center">
            <Coins className="w-5 h-5 text-cyan-400 mr-2" />
            What are Credits?
          </h3>
          <p className="text-zinc-300 text-sm leading-relaxed mb-4">
            Credits are KBVE's digital currency that you can earn and spend across our platform. 
            Use them to access premium features, unlock exclusive content, participate in the IGBC 
            ecosystem, and much more!
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <Gift className="w-5 h-5 text-green-400 mb-2" />
              <h4 className="text-white font-medium mb-1">Earn Credits</h4>
              <p className="text-zinc-400 text-xs">Complete tasks, participate in events, refer friends</p>
            </div>
            <div className="bg-zinc-800/50 rounded-lg p-4">
              <ShoppingCart className="w-5 h-5 text-blue-400 mb-2" />
              <h4 className="text-white font-medium mb-1">Spend Credits</h4>
              <p className="text-zinc-400 text-xs">Premium features, exclusive content, marketplace items</p>
            </div>
          </div>
        </div>

        {/* Quick Links Section */}
        <div className="p-6 border-b border-zinc-700">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
            <ExternalLink className="w-5 h-5 text-cyan-400 mr-2" />
            Quick Links
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <a
              href="/igbc"
              data-astro-prefetch
              className="flex items-center space-x-3 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors duration-200 group"
            >
              <Award className="w-5 h-5 text-yellow-400 group-hover:text-yellow-300" />
              <div>
                <p className="text-white font-medium text-sm">IGBC</p>
                <p className="text-zinc-400 text-xs">Interactive Global Business Community</p>
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-400 ml-auto" />
            </a>
            
            <a
              href="/docs/credits"
              data-astro-prefetch
              className="flex items-center space-x-3 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors duration-200 group"
            >
              <BookOpen className="w-5 h-5 text-blue-400 group-hover:text-blue-300" />
              <div>
                <p className="text-white font-medium text-sm">Credits Documentation</p>
                <p className="text-zinc-400 text-xs">Learn how credits work</p>
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-400 ml-auto" />
            </a>
            
            <a
              href="/marketplace"
              data-astro-prefetch
              className="flex items-center space-x-3 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors duration-200 group"
            >
              <ShoppingCart className="w-5 h-5 text-green-400 group-hover:text-green-300" />
              <div>
                <p className="text-white font-medium text-sm">Marketplace</p>
                <p className="text-zinc-400 text-xs">Spend your credits here</p>
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-400 ml-auto" />
            </a>
            
            <a
              href="/earn"
              data-astro-prefetch
              className="flex items-center space-x-3 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors duration-200 group"
            >
              <TrendingUp className="w-5 h-5 text-purple-400 group-hover:text-purple-300" />
              <div>
                <p className="text-white font-medium text-sm">Earn More Credits</p>
                <p className="text-zinc-400 text-xs">Discover earning opportunities</p>
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-400 ml-auto" />
            </a>
            
            <a
              href="/referrals"
              data-astro-prefetch
              className="flex items-center space-x-3 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors duration-200 group"
            >
              <Users className="w-5 h-5 text-cyan-400 group-hover:text-cyan-300" />
              <div>
                <p className="text-white font-medium text-sm">Referral Program</p>
                <p className="text-zinc-400 text-xs">Invite friends, earn credits</p>
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-400 ml-auto" />
            </a>
            
            <a
              href="/support"
              data-astro-prefetch
              className="flex items-center space-x-3 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors duration-200 group"
            >
              <BookOpen className="w-5 h-5 text-orange-400 group-hover:text-orange-300" />
              <div>
                <p className="text-white font-medium text-sm">Support</p>
                <p className="text-zinc-400 text-xs">Need help with credits?</p>
              </div>
              <ExternalLink className="w-4 h-4 text-zinc-400 ml-auto" />
            </a>
          </div>
        </div>

        {/* Membership Benefits */}
        <div className="p-6">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
            <Star className="w-5 h-5 text-cyan-400 mr-2" />
            Membership Benefits
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-white text-sm">Basic (0+ credits)</span>
              </div>
              <span className="text-zinc-400 text-xs">Access to basic features</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <span className="text-white text-sm">Premium (500+ credits)</span>
              </div>
              <span className="text-zinc-400 text-xs">Enhanced features & priority support</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span className="text-white text-sm">VIP (1000+ credits)</span>
              </div>
              <span className="text-zinc-400 text-xs">Exclusive access & premium benefits</span>
            </div>
          </div>
        </div>
        </div>
      </div>
    </Portal>
  );
});

// Add display name for better debugging
CreditsModal.displayName = 'CreditsModal';

export default CreditsModal;
