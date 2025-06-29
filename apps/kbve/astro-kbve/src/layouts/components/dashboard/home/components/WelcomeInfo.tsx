import { useState, useEffect, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { clsx, twMerge } from 'src/utils/tw';
import { userAtom, userIdAtom, userBalanceAtom } from 'src/layouts/client/supabase/profile/userstate';

const WelcomeInfo = () => {
  const user = useStore(userAtom);
  const userId = useStore(userIdAtom);
  const userBalance = useStore(userBalanceAtom);
  const [loading, setLoading] = useState(true);
  const [membershipTier, setMembershipTier] = useState<'Guest' | 'Basic' | 'Premium' | 'VIP'>('Guest');
  const [visible, setVisible] = useState(false);


  const isGuest = useMemo(() => !user || !userId, [user, userId]);
  const username = useMemo(() => 
    isGuest ? 'Guest' : (user?.email?.split('@')[0] || 'User'), 
    [isGuest, user]
  );

  const creditBalance = useMemo(() => {
    if (isGuest || !userBalance) return 0;
    return typeof userBalance === 'object' && 'credits' in userBalance 
      ? (userBalance as any).credits 
      : typeof userBalance === 'number' 
      ? userBalance 
      : 0;
  }, [isGuest, userBalance]);

  const getTierColor = useMemo(() => (tier: string) => {
    switch (tier) {
      case 'VIP': return 'text-purple-400';
      case 'Premium': return 'text-yellow-400';
      case 'Basic': return 'text-green-400';
      default: return 'text-zinc-400';
    }
  }, []);

  useEffect(() => {
    const handleCrossFade = () => {
      const skeleton = document.getElementById('welcome-skeleton');
      if (skeleton) {
        skeleton.style.transition = 'opacity 0.5s ease-out';
        skeleton.style.opacity = '0';
      }
      
      setTimeout(() => {
        setVisible(true);
      }, 100);
    };

    const loadWelcomeInfo = async () => {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Determine membership tier based on credit balance
      if (!isGuest) {
        if (creditBalance >= 1000) setMembershipTier('VIP');
        else if (creditBalance >= 500) setMembershipTier('Premium');
        else setMembershipTier('Basic');
      }

      handleCrossFade();
      setLoading(false);
    };

    loadWelcomeInfo();
  }, [isGuest, creditBalance]);

  if (loading) {
    console.log('WelcomeInfo: Still loading, returning null'); // Debug log
    return null;
  }

  console.log('WelcomeInfo: Rendering component, visible:', visible); // Debug log

  return (
    <div className={twMerge(clsx(
      "bg-zinc-800 rounded-lg p-6 border border-zinc-700 transition-opacity duration-500",
      visible ? "opacity-100" : "opacity-0"
    ))}>
      <h3 className={twMerge(clsx("text-lg font-semibold text-white mb-4"))}>
        Welcome{!isGuest && `, ${username}`}!
      </h3>
      <div className="space-y-3">
        {isGuest ? (
          <>
            <p className={twMerge(clsx("text-zinc-300 text-sm"))}>
              Join our community to unlock all features and start earning credits.
            </p>
            <button className={twMerge(clsx(
              "w-full px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg",
              "text-sm font-medium transition-colors"
            ))}>
              Get Started
            </button>
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={twMerge(clsx("text-zinc-300 text-sm"))}>Account Status</span>
              <div className="flex items-center space-x-2">
                <div className={twMerge(clsx("w-2 h-2 bg-green-400 rounded-full"))}></div>
                <span className={twMerge(clsx("text-green-400 text-sm"))}>Active</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className={twMerge(clsx("text-zinc-300 text-sm"))}>Total Credits</span>
              <span className={twMerge(clsx("text-cyan-400 text-sm font-medium"))}>
                {creditBalance.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className={twMerge(clsx("text-zinc-300 text-sm"))}>Member Tier</span>
              <span className={twMerge(clsx("text-sm font-medium", getTierColor(membershipTier)))}>
                {membershipTier}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WelcomeInfo;
