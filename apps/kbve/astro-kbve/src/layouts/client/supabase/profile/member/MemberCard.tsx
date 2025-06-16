import React, { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { userBalanceAtom, syncUserBalance, userIdAtom } from 'src/layouts/client/supabase/profile/userstate';
import { clsx, twMerge } from 'src/utils/tw';
import { RefreshCcw } from 'lucide-react';

const MemberCard: React.FC = () => {
  const userId = useStore(userIdAtom);
  const balance = useStore(userBalanceAtom);

  useEffect(() => {
    if (userId) {
      syncUserBalance(userId);
    }
  }, [userId]);

  if (!userId) {
    return <div className={twMerge('text-center text-neutral-600 dark:text-neutral-300 p-4')}>Please log in to view your member card.</div>;
  }

  if (userId && !balance) {
    // If user is logged in but has no balance, show onboarding link
    return (
      <div className={twMerge('flex flex-col items-center justify-center gap-4 p-6 rounded-xl bg-gradient-to-br from-cyan-100/60 to-purple-100/40 dark:from-cyan-900/30 dark:to-purple-900/20 shadow-lg')}> 
        <div className="text-lg font-semibold text-neutral-700 dark:text-neutral-200">No member profile found.</div>
        <a
          href="/onboarding"
          className={twMerge(
            'inline-block px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-400 to-purple-400 text-white font-bold shadow hover:from-cyan-500 hover:to-purple-500 transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2'
          )}
        >
          Start Onboarding
        </a>
      </div>
    );
  }

  if (!balance) {
    return <div className={twMerge('text-center text-neutral-600 dark:text-neutral-300 p-4')}>Loading member data...</div>;
  }

  return (
    <div
      className={twMerge(
        'w-full max-w-md mx-auto rounded-2xl p-6 shadow-xl bg-white/80 dark:bg-zinc-900/70 border border-cyan-200 dark:border-zinc-800',
        'flex flex-col gap-2 items-center',
        'transition-all duration-300'
      )}
    >
      <h2 className={twMerge('text-2xl font-bold text-cyan-700 dark:text-cyan-300 mb-2')}>Member Card</h2>
      <div className="self-end">
      <button
        onClick={() => syncUserBalance(userId, false)}
        className={twMerge(
          'relative group inline-flex items-center justify-center w-8 h-8 rounded-md border border-cyan-400 dark:border-cyan-700',
          'bg-white/30 dark:bg-zinc-800/50 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-100/50 dark:hover:bg-cyan-800/60 transition'
        )}
        aria-label="Refresh Balance"
      >
        <RefreshCcw className="w-4 h-4" />

        {/* Tooltip */}
        <span className="absolute bottom-full mb-1 w-max max-w-xs px-2 py-1 rounded bg-neutral-700 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity">
          Pull balance from live view
        </span>
      </button>
    </div>
      <div className="w-full flex flex-col gap-1 text-base text-neutral-800 dark:text-neutral-200">
        <div><span className="font-semibold">Username:</span> {balance.username}</div>
        <div><span className="font-semibold">Level:</span> {balance.level ?? 'N/A'}</div>
        <div><span className="font-semibold">Role:</span> {balance.role ?? 'N/A'}</div>
        <div><span className="font-semibold">Credits:</span> {typeof balance.credits === 'number' ? balance.credits.toFixed(2) : '0.00'}</div>
        <div><span className="font-semibold">KHash:</span> {typeof balance.khash === 'number' ? balance.khash.toFixed(2) : '0.00'}</div>
        <div><span className="font-semibold">Joined:</span> {new Date(balance.created_at).toLocaleDateString()}</div>
      </div>
    </div>
  );
};

export default MemberCard;
