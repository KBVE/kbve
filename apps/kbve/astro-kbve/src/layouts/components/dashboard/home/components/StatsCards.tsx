import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx, twMerge } from 'src/utils/tw';
import { userAtom, userIdAtom, userBalanceAtom, syncUserBalance, syncSupabaseUser } from 'src/layouts/client/supabase/profile/userstate';
import { Wallet, Star, Calendar, TrendingUp, CreditCard, Clock } from 'lucide-react';

interface UserStats {
  creditBalance: number;
  accountAge: string;
  activityLevel: 'Low' | 'Medium' | 'High';
  membershipTier: 'Guest' | 'Basic' | 'Premium' | 'VIP';
}

const StatsCards = () => {
  const user = useStore(userAtom);
  const userId = useStore(userIdAtom);
  const userBalance = useStore(userBalanceAtom);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [visible, setVisible] = useState(false);

  const isGuest = useMemo(() => !user || !userId, [user, userId]);
  const username = useMemo(() => 
    isGuest ? 'Guest' : (user?.email?.split('@')[0] || 'User'), 
    [isGuest, user]
  );

  useEffect(() => {
    syncSupabaseUser();
    if (userId) {
      syncUserBalance(userId);
    }
  }, [userId]);

  useEffect(() => {
    const fadeOutSkeletons = () => {
      const skeletons = document.querySelectorAll('[data-skeleton="stats"]');
      skeletons.forEach((skeleton, index) => {
        setTimeout(() => {
          if (skeleton instanceof HTMLElement) {
            skeleton.style.transition = 'opacity 0.3s ease-out';
            skeleton.style.opacity = '0';
            setTimeout(() => {
              skeleton.style.display = 'none';
            }, 300);
          }
        }, index * 100);
      });
    };

    const fetchUserStats = async () => {
      try {
        console.log('Fetching user stats...'); // Debug log
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Handle user balance
        let creditBalance = 0;
        if (!isGuest && userBalance) {
          creditBalance = typeof userBalance === 'object' && 'credits' in userBalance 
            ? (userBalance as any).credits 
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

        // Determine membership tier
        let membershipTier: UserStats['membershipTier'] = 'Guest';
        if (!isGuest) {
          if (creditBalance >= 1000) membershipTier = 'VIP';
          else if (creditBalance >= 500) membershipTier = 'Premium';
          else membershipTier = 'Basic';
        }

        const activityLevel: UserStats['activityLevel'] = isGuest ? 'Low' : 'Medium';

        const newStats = {
          creditBalance,
          accountAge,
          activityLevel,
          membershipTier
        };

        console.log('Setting stats:', newStats); // Debug log
        setStats(newStats);

        fadeOutSkeletons();
        setTimeout(() => {
          setVisible(true);
          console.log('Setting visible to true'); // Debug log
        }, 400);
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching user stats:', error);
        fadeOutSkeletons();
        setLoading(false);
      }
    };

    fetchUserStats();
  }, [user, userId, userBalance, isGuest]);

  const getTierColor = useMemo(() => (tier: string) => {
    switch (tier) {
      case 'VIP': return 'text-purple-400';
      case 'Premium': return 'text-yellow-400';
      case 'Basic': return 'text-green-400';
      default: return 'text-zinc-400';
    }
  }, []);

  const getTierBadge = useMemo(() => (tier: string) => {
    switch (tier) {
      case 'VIP': return 'bg-purple-500/10 border-purple-500/20';
      case 'Premium': return 'bg-yellow-500/10 border-yellow-500/20';
      case 'Basic': return 'bg-green-500/10 border-green-500/20';
      default: return 'bg-zinc-500/10 border-zinc-500/20';
    }
  }, []);

  if (loading || !stats) {
    return null; // Skeletons handled by Astro
  }

  console.log('Rendering StatsCards with visible:', visible, 'stats:', stats); // Debug log

  return (
    <div 
      className={twMerge(clsx(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 transition-opacity duration-500",
        visible ? "opacity-100" : "opacity-0"
      ))}
    >
      
      {/* Credit Balance Card */}
      <div className={twMerge(clsx(
        "bg-zinc-800 rounded-lg p-6 border border-zinc-700",
        "hover:border-cyan-500/50 transition-colors group"
      ))}>
        <div className="flex items-center justify-between">
          <div>
            <p className={twMerge(clsx("text-zinc-400 text-sm font-medium"))}>Credit Balance</p>
            <p className={twMerge(clsx("text-2xl font-bold text-white mt-1"))}>
              {stats?.creditBalance.toLocaleString() || 0}
            </p>
          </div>
          <div className={twMerge(clsx(
            "w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center",
            "group-hover:bg-cyan-500/20 transition-colors"
          ))}>
            <Wallet className={twMerge(clsx("w-6 h-6 text-cyan-400"))} />
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center text-sm">
            {isGuest ? (
              <span className={twMerge(clsx("text-zinc-400"))}>Sign up to earn credits</span>
            ) : (
              <>
                <CreditCard className={twMerge(clsx("w-4 h-4 text-green-400 mr-1"))} />
                <span className={twMerge(clsx("text-green-400"))}>Active account</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Membership Tier Card */}
      <div className={twMerge(clsx(
        "bg-zinc-800 rounded-lg p-6 border border-zinc-700",
        "hover:border-cyan-500/50 transition-colors group"
      ))}>
        <div className="flex items-center justify-between">
          <div>
            <p className={twMerge(clsx("text-zinc-400 text-sm font-medium"))}>Membership</p>
            <p className={twMerge(clsx("text-2xl font-bold text-white mt-1"))}>
              {stats?.membershipTier}
            </p>
          </div>
          <div className={twMerge(clsx(
            "w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center",
            "group-hover:bg-cyan-500/20 transition-colors"
          ))}>
            <Star className={twMerge(clsx("w-6 h-6 text-cyan-400"))} />
          </div>
        </div>
        <div className="mt-4">
          <div className={twMerge(clsx(
            "inline-flex items-center px-2 py-1 rounded-full text-xs border",
            getTierBadge(stats?.membershipTier || 'Guest')
          ))}>
            <span className={twMerge(clsx(getTierColor(stats?.membershipTier || 'Guest')))}>
              {stats?.membershipTier || 'Guest'} Tier
            </span>
          </div>
        </div>
      </div>

      {/* Account Age Card */}
      <div className={twMerge(clsx(
        "bg-zinc-800 rounded-lg p-6 border border-zinc-700",
        "hover:border-cyan-500/50 transition-colors group"
      ))}>
        <div className="flex items-center justify-between">
          <div>
            <p className={twMerge(clsx("text-zinc-400 text-sm font-medium"))}>Member Since</p>
            <p className={twMerge(clsx("text-2xl font-bold text-white mt-1"))}>
              {stats?.accountAge}
            </p>
          </div>
          <div className={twMerge(clsx(
            "w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center",
            "group-hover:bg-cyan-500/20 transition-colors"
          ))}>
            <Calendar className={twMerge(clsx("w-6 h-6 text-cyan-400"))} />
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center text-sm">
            {isGuest ? (
              <span className={twMerge(clsx("text-zinc-400"))}>Join our community</span>
            ) : (
              <>
                <Clock className={twMerge(clsx("w-4 h-4 text-blue-400 mr-1"))} />
                <span className={twMerge(clsx("text-blue-400"))}>Trusted member</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Activity Level Card */}
      <div className={twMerge(clsx(
        "bg-zinc-800 rounded-lg p-6 border border-zinc-700",
        "hover:border-cyan-500/50 transition-colors group"
      ))}>
        <div className="flex items-center justify-between">
          <div>
            <p className={twMerge(clsx("text-zinc-400 text-sm font-medium"))}>Activity Level</p>
            <p className={twMerge(clsx("text-2xl font-bold text-white mt-1"))}>
              {stats?.activityLevel}
            </p>
          </div>
          <div className={twMerge(clsx(
            "w-12 h-12 bg-cyan-500/10 rounded-lg flex items-center justify-center",
            "group-hover:bg-cyan-500/20 transition-colors"
          ))}>
            <TrendingUp className={twMerge(clsx("w-6 h-6 text-cyan-400"))} />
          </div>
        </div>
        <div className="mt-4">
          <div className={twMerge(clsx("w-full bg-zinc-700 rounded-full h-2"))}>
            <div 
              className={twMerge(clsx(
                "h-2 rounded-full transition-all duration-1000",
                stats?.activityLevel === 'High' ? 'bg-green-400' :
                stats?.activityLevel === 'Medium' ? 'bg-yellow-400' :
                'bg-red-400'
              ))}
              style={{ 
                width: stats?.activityLevel === 'High' ? '90%' : 
                       stats?.activityLevel === 'Medium' ? '60%' : '30%' 
              }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatsCards;
