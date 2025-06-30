import React, { useEffect } from 'react';
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

const CreditsModal: React.FC<CreditsModalProps> = ({ 
  isOpen, 
  onClose, 
  currentBalance, 
  membershipTier 
}) => {
  // Effect to manage body scroll and cleanup when modal state changes
  useEffect(() => {
    if (isOpen) {
      // Add modal classes and prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
      document.body.classList.add('modal-open');
      
      // Ensure any existing modal containers are properly configured
      const modalRoot = document.getElementById('modal-root');
      if (modalRoot) {
        modalRoot.style.pointerEvents = 'auto';
        modalRoot.classList.add('modal-active');
      }
    } else {
      // Restore body scroll and remove classes when modal is closed
      document.body.style.overflow = 'unset';
      document.body.classList.remove('modal-open');
      
      // Disable pointer events on modal container when modal is closed
      const modalRoot = document.getElementById('modal-root');
      if (modalRoot) {
        modalRoot.classList.remove('modal-active');
        // Add a delay to allow for exit animations
        setTimeout(() => {
          if (modalRoot.children.length === 0) {
            modalRoot.style.pointerEvents = 'none';
          }
        }, 300);
      }
    }

    // Cleanup function
    return () => {
      document.body.style.overflow = 'unset';
      document.body.classList.remove('modal-open');
      const modalRoot = document.getElementById('modal-root');
      if (modalRoot) {
        modalRoot.classList.remove('modal-active');
        if (modalRoot.children.length === 0) {
          modalRoot.style.pointerEvents = 'none';
        }
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'VIP': return 'text-purple-400';
      case 'Premium': return 'text-yellow-400';
      case 'Basic': return 'text-green-400';
      default: return 'text-zinc-400';
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'VIP': return 'bg-purple-500/10 border-purple-500/20';
      case 'Premium': return 'bg-yellow-500/10 border-yellow-500/20';
      case 'Basic': return 'bg-green-500/10 border-green-500/20';
      default: return 'bg-zinc-500/10 border-zinc-500/20';
    }
  };

  return (
    <Portal>
      <div 
        className={clsx(
          "fixed inset-0 bg-black/50 flex items-center justify-center p-4",
          "z-[99999] modal-backdrop",
          "backdrop-blur-sm"
        )}
        onClick={handleBackdropClick}
        style={{ zIndex: 999999 }}
      >
        <div 
          className={clsx(
            "bg-zinc-900 rounded-xl border border-zinc-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl",
            "relative z-[99999] modal-content",
            "transform transition-all duration-300 ease-out",
            "animate-in fade-in-0 zoom-in-95"
          )}
          onClick={(e) => e.stopPropagation()}
          style={{ zIndex: 999999 }}
        >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-zinc-700">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center">
              <Wallet className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Credits Overview</h2>
              <p className="text-sm text-zinc-400">Your digital currency on KBVE</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors duration-200"
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
};

export default CreditsModal;
