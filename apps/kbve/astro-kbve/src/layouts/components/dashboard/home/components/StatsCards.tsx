import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'src/utils/tw';
import { userAtom, userIdAtom, userBalanceAtom, syncUserBalance, syncSupabaseUser } from 'src/layouts/client/supabase/profile/userstate';
import { Wallet, Star, Calendar, TrendingUp, CreditCard, Clock } from 'lucide-react';
import CreditsModal from './CreditsModal';

interface UserStats {
  creditBalance: number;
  accountAge: string;
  activityLevel: 'Low' | 'Medium' | 'High';
  membershipTier: 'Guest' | 'Basic' | 'Premium' | 'VIP';
}

// Utility function to format large numbers with K/M suffixes (uses floor to prevent rounding up)
function formatNumber(num: number | null | undefined): string {
  const value = num || 0;
  
  if (value >= 1000000) {
    return (Math.floor(value / 100000) / 10) + 'M';
  } else if (value >= 1000) {
    return (Math.floor(value / 100) / 10) + 'K';
  } else {
    return value.toString();
  }
}

// Utility function to format exact number with commas for tooltips
function formatExactNumber(num: number | null | undefined): string {
  const value = num || 0;
  return value.toLocaleString();
}

const StatsCards = () => {
  const user = useStore(userAtom);
  const userId = useStore(userIdAtom);
  const userBalance = useStore(userBalanceAtom);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [visible, setVisible] = useState(false);
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState(false);

  const isGuest = useMemo(() => !user || !userId, [user, userId]);

  useEffect(() => {
    syncSupabaseUser();
    if (userId) {
      syncUserBalance(userId);
    }
  }, [userId]);

  useEffect(() => {
    const handleCrossFade = () => {
      const skeleton = document.querySelector('[data-skeleton="stats"]') as HTMLElement;
      if (skeleton) {
        skeleton.style.transition = 'opacity 0.5s ease-out';
        skeleton.style.opacity = '0';
        skeleton.style.pointerEvents = 'none';
        skeleton.style.zIndex = '-1'; 
        skeleton.style.visibility = 'hidden';
      }
      
      // Fade in this component with a small delay for smooth transition
      setTimeout(() => setVisible(true), 100);
    };

    const fetchUserStats = async () => {
      try {
        // Simulate loading time for better UX
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Handle user balance with proper type safety
        let creditBalance = 0;
        if (!isGuest && userBalance) {
          creditBalance = typeof userBalance === 'object' && 'credits' in userBalance 
            ? (userBalance as { credits: number }).credits 
            : typeof userBalance === 'number' 
            ? userBalance 
            : 0;
        }
        
        // Calculate account age
        let accountAge = 'New User';
        if (!isGuest && user?.created_at) {
          const createdDate = new Date(user.created_at);
          const daysSince = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysSince < 7) accountAge = 'New User';
          else if (daysSince < 30) accountAge = `${daysSince} days`;
          else if (daysSince < 365) accountAge = `${Math.floor(daysSince / 30)} months`;
          else accountAge = `${Math.floor(daysSince / 365)} years`;
        }

        // Determine membership tier based on credit balance
        let membershipTier: UserStats['membershipTier'] = 'Guest';
        if (!isGuest) {
          if (creditBalance >= 1000) membershipTier = 'VIP';
          else if (creditBalance >= 500) membershipTier = 'Premium';
          else membershipTier = 'Basic';
        }

        const activityLevel: UserStats['activityLevel'] = isGuest ? 'Low' : 'Medium';

        setStats({
          creditBalance,
          accountAge,
          activityLevel,
          membershipTier
        });

        handleCrossFade();
        setLoading(false);
      } catch (error) {
        console.error('Error fetching user stats:', error);
        handleCrossFade();
        setLoading(false);
      }
    };

    fetchUserStats();
  }, [user, userId, userBalance, isGuest]);

  const getTierColor = useMemo(() => {
    return (tier: string) => {
      switch (tier) {
        case 'VIP': return 'text-purple-400';
        case 'Premium': return 'text-yellow-400';
        case 'Basic': return 'text-green-400';
        default: return 'text-zinc-400';
      }
    };
  }, []);

  const getTierBadge = useMemo(() => {
    return (tier: string) => {
      switch (tier) {
        case 'VIP': return 'bg-purple-500/10 border-purple-500/20';
        case 'Premium': return 'bg-yellow-500/10 border-yellow-500/20';
        case 'Basic': return 'bg-green-500/10 border-green-500/20';
        default: return 'bg-zinc-500/10 border-zinc-500/20';
      }
    };
  }, []);

  if (loading || !stats) {
    return null; // Skeletons handled by Astro
  }

  return (
    <>
      <div 
        className={clsx(
          "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 transition-opacity duration-500",
          visible ? "opacity-100" : "opacity-0"
        )}
      >
        
        {/* Credit Balance Card */}
        <div 
          className="bg-zinc-800 rounded-lg p-6 border border-zinc-700 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300 group cursor-pointer relative"
          onClick={() => setIsCreditsModalOpen(true)}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-zinc-400 text-sm font-medium group-hover:text-zinc-300 transition-colors duration-300">Credit Balance</p>
              <div className="relative">
                <p 
                  className="text-2xl font-bold text-white mt-1 group-hover:text-cyan-50 transition-colors duration-300"
                  title={`Exact balance: ${formatExactNumber(stats?.creditBalance)} credits`}
                >
                  {formatNumber(stats?.creditBalance)}
                </p>
                {/* Enhanced tooltip */}
                <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-zinc-900 text-white text-sm rounded-lg shadow-lg border border-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none whitespace-nowrap z-50">
                  Exact: {formatExactNumber(stats?.creditBalance)} credits
                  <div className="absolute top-full left-4 w-2 h-2 bg-zinc-900 border-r border-b border-zinc-700 transform rotate-45 -mt-1"></div>
                </div>
              </div>
            </div>
            <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 group-hover:scale-110 transition-all duration-300">
              <Wallet className="w-6 h-6 text-cyan-400 group-hover:text-cyan-300 transition-all duration-300" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center text-sm">
              {isGuest ? (
                <span className="text-zinc-400 group-hover:text-zinc-300 transition-colors duration-300">Sign up to earn credits</span>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 text-green-400 mr-1 group-hover:text-green-300 transition-colors duration-300" />
                  <span className="text-green-400 group-hover:text-green-300 transition-colors duration-300">Click to learn more</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Membership Tier Card */}
        <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300 group cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-zinc-400 text-sm font-medium group-hover:text-zinc-300 transition-colors duration-300">Membership</p>
              <p className="text-2xl font-bold text-white mt-1 group-hover:text-cyan-50 transition-colors duration-300">
                {stats?.membershipTier}
              </p>
            </div>
            <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 group-hover:scale-110 transition-all duration-300">
              <Star className="w-6 h-6 text-cyan-400 group-hover:text-cyan-300 transition-all duration-300" />
            </div>
          </div>
          <div className="mt-4">
            <div className={clsx(
              "inline-flex items-center px-2 py-1 rounded-full text-xs border transition-all duration-300",
              getTierBadge(stats?.membershipTier || 'Guest'),
              "group-hover:scale-105"
            )}>
              <span className={clsx(
                getTierColor(stats?.membershipTier || 'Guest'),
                "group-hover:brightness-110 transition-all duration-300"
              )}>
                {stats?.membershipTier || 'Guest'} Tier
              </span>
            </div>
          </div>
        </div>

        {/* Account Age Card */}
        <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300 group cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-zinc-400 text-sm font-medium group-hover:text-zinc-300 transition-colors duration-300">Member Since</p>
              <p className="text-2xl font-bold text-white mt-1 group-hover:text-cyan-50 transition-colors duration-300">
                {stats?.accountAge}
              </p>
            </div>
            <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 group-hover:scale-110 transition-all duration-300">
              <Calendar className="w-6 h-6 text-cyan-400 group-hover:text-cyan-300 transition-all duration-300" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center text-sm">
              {isGuest ? (
                <span className="text-zinc-400 group-hover:text-zinc-300 transition-colors duration-300">Join our community</span>
              ) : (
                <>
                  <Clock className="w-4 h-4 text-blue-400 mr-1 group-hover:text-blue-300 transition-colors duration-300" />
                  <span className="text-blue-400 group-hover:text-blue-300 transition-colors duration-300">Trusted member</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Activity Level Card */}
        <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10 transition-all duration-300 group cursor-pointer">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-zinc-400 text-sm font-medium group-hover:text-zinc-300 transition-colors duration-300">Activity Level</p>
              <p className="text-2xl font-bold text-white mt-1 group-hover:text-cyan-50 transition-colors duration-300">
                {stats?.activityLevel}
              </p>
            </div>
            <div className="w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center group-hover:bg-cyan-500/20 group-hover:scale-110 transition-all duration-300">
              <TrendingUp className="w-6 h-6 text-cyan-400 group-hover:text-cyan-300 transition-all duration-300" />
            </div>
          </div>
          <div className="mt-4">
            <div className="w-full bg-zinc-700 rounded-full h-2 group-hover:bg-zinc-600 transition-colors duration-300">
              <div 
                className={clsx(
                  "h-2 rounded-full transition-all duration-1000 group-hover:brightness-110",
                  stats?.activityLevel === 'High' ? 'bg-green-400' :
                  stats?.activityLevel === 'Medium' ? 'bg-yellow-400' :
                  'bg-red-400'
                )}
                style={{ 
                  width: stats?.activityLevel === 'High' ? '90%' : 
                         stats?.activityLevel === 'Medium' ? '60%' : '30%' 
                }}
              ></div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Credits Modal */}
      <CreditsModal
        isOpen={isCreditsModalOpen}
        onClose={() => setIsCreditsModalOpen(false)}
        currentBalance={stats?.creditBalance || 0}
        membershipTier={stats?.membershipTier || 'Guest'}
      />
    </>
  );
};

export default StatsCards;
