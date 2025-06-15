import React, { useEffect } from 'react';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';
import type { User } from '@supabase/supabase-js';
import { clsx, twMerge } from 'src/utils/tw';
import { useStore } from '@nanostores/react';
import { userAtom, userLoadingAtom, userErrorAtom } from './userstate';

const UserData: React.FC = () => {
  const user = useStore(userAtom);
  const loading = useStore(userLoadingAtom);
  const error = useStore(userErrorAtom);

  useEffect(() => {
    (async () => {
      userLoadingAtom.set(true);
      userErrorAtom.set("");
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        userErrorAtom.set(error.message || 'Failed to fetch user data.');
        userAtom.set(null);
      } else {
        userAtom.set(data?.user || null);
      }
      userLoadingAtom.set(false);
    })();
  }, []);

  if (loading) return <div className="text-center text-neutral-600 dark:text-neutral-300">Loading your profile…</div>;
  if (error) return <div className="text-red-500 text-center">{error}</div>;
  if (!user) return <div className="text-center text-neutral-600 dark:text-neutral-300">No user data found.</div>;

  return (
    <div
      className={twMerge(
        clsx(
          'mx-auto max-w-xl mt-10 p-8 rounded-3xl relative',
          'bg-white/10 dark:bg-neutral-900/60 backdrop-blur-md',
          'ring-1 ring-white/10 ring-offset-2 ring-offset-cyan-400/10',
          'shadow-[inset_0_0_1.5px_rgba(186,230,253,0.6),inset_-1px_-1px_1px_rgba(192,132,252,0.3),0_20px_40px_rgba(103,232,249,0.15),0_0_0_3px_rgba(192,132,252,0.12)]',
          'transition-all duration-300',
        )
      )}
      style={{
        background: 'linear-gradient(135deg, rgba(103,232,249,0.18) 0%, rgba(192,132,252,0.18) 100%)',
        boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.18), 0 0 0 3px rgba(103,232,249,0.12), 0 0 35px 12px rgba(192,132,252,0.15)',
      }}
    >
      <div className="inline-flex items-center gap-2 text-xs font-semibold bg-cyan-300/20 text-cyan-500 px-3 py-1 rounded-full shadow border border-white/30 mb-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle></svg>
        Profile
      </div>
      <h2 className="text-3xl font-bold mb-6 text-white drop-shadow">Welcome, {user.user_metadata?.display_name || user.email || 'User'}!</h2>
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-base text-zinc-200">
          <span className="font-semibold text-cyan-400">ID:</span> <span className="truncate">{user.id}</span>
        </div>
        <div className="flex items-center gap-2 text-base text-zinc-200">
          <span className="font-semibold text-purple-400">Email:</span> <span>{user.email}</span>
        </div>
        <div className="flex items-center gap-2 text-base text-zinc-200">
          <span className="font-semibold text-cyan-400">Display Name:</span> <span>{user.user_metadata?.display_name || 'N/A'}</span>
        </div>
        <div className="flex items-center gap-2 text-base text-zinc-200">
          <span className="font-semibold text-purple-400">Created:</span> <span>{user.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}</span>
        </div>
      </div>
      {/* Add more user fields as needed */}
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-gradient-to-br from-cyan-400/30 to-purple-400/20 rounded-full blur-2xl z-0 pointer-events-none"></div>
      <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-gradient-to-tr from-purple-400/30 to-cyan-400/20 rounded-full blur-2xl z-0 pointer-events-none"></div>
    </div>
  );
};

export default UserData;
