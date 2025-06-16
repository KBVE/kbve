import React, { useState, useEffect } from 'react';
import { GithubSignInButton, DiscordSignInButton } from './OAuthSignIn.tsx';
import { supabase } from '../supabaseClient';

const Modal = ({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-cyan-100/60 via-purple-100/60 to-zinc-200/60 dark:from-zinc-900/80 dark:via-cyan-900/60 dark:to-purple-900/60">
      <div
        className="bg-white dark:bg-neutral-900 rounded-3xl shadow-xl p-0 max-w-3xl w-full relative flex flex-col md:flex-row overflow-hidden border border-zinc-200 dark:border-zinc-800 transition-all duration-300 group hover:shadow-2xl hover:shadow-cyan-400/20 hover:border-cyan-400/40"
        style={{ boxShadow: '0 4px 32px 0 rgba(0,0,0,0.10) inset' }}
      >
        <button
          className="absolute top-4 right-4 text-neutral-400 hover:text-neutral-700 dark:hover:text-white text-2xl z-10"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
};

const MembersOnly: React.FC = () => {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (data?.user) {
        setOpen(false);
      } else {
        setOpen(true);
      }
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  if (loading) return null;

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      {/* Left Side: Login/Register */}
      <div className="flex-1 flex flex-col items-center justify-center text-center border-r border-zinc-100 dark:border-zinc-800 pr-8 py-12 bg-gradient-to-br from-cyan-50/60 via-white/80 to-purple-50/60 dark:from-zinc-900/80 dark:via-cyan-950/60 dark:to-purple-950/60 relative">
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="w-32 h-32 bg-cyan-400/10 rounded-full blur-2xl absolute -top-10 -left-10 animate-pulse" />
          <div className="w-24 h-24 bg-purple-400/10 rounded-full blur-2xl absolute bottom-0 right-0 animate-pulse" />
        </div>
        <div className="relative z-10 flex flex-col items-center">
          <div className="text-5xl mb-3 animate-bounce">🔒</div>
          <h2 className="text-2xl font-extrabold mb-2 text-cyan-600 dark:text-cyan-400 drop-shadow">Members Only</h2>
          <p className="mb-6 text-zinc-600 dark:text-zinc-300 text-base max-w-xs">
            Unlock exclusive content by logging in or registering.<br />
            <span className="inline-block mt-2 text-purple-500 font-semibold">Join our community!</span>
          </p>
          <div className="flex gap-3 mt-2">
            <a
              href="/login"
              className="bg-gradient-to-br from-cyan-400 to-purple-500 text-white font-semibold py-2 px-6 rounded-full shadow hover:from-cyan-300 hover:to-purple-400 hover:shadow-lg transition border-2 border-transparent hover:border-cyan-400"
            >
              Login
            </a>
            <a
              href="/register"
              className="bg-gradient-to-br from-purple-500 to-cyan-400 text-white font-semibold py-2 px-6 rounded-full shadow hover:from-purple-400 hover:to-cyan-300 hover:shadow-lg transition border-2 border-transparent hover:border-purple-400"
            >
              Register
            </a>
          </div>
        </div>
      </div>
      {/* Right Side: OAuth Auths */}
      <div className="flex-1 flex flex-col items-center justify-center text-center pl-8 py-12 bg-gradient-to-br from-white/80 to-zinc-100/60 dark:from-zinc-900/80 dark:to-zinc-800/60 relative">
        <div className="absolute inset-0 pointer-events-none z-0">
          <div className="w-24 h-24 bg-cyan-400/10 rounded-full blur-2xl absolute top-0 right-0 animate-pulse" />
          <div className="w-20 h-20 bg-purple-400/10 rounded-full blur-2xl absolute bottom-0 left-0 animate-pulse" />
        </div>
        <div className="relative z-10 w-full flex flex-col items-center">
          <div className="text-lg font-semibold mb-4 text-zinc-700 dark:text-zinc-200">Or sign in with</div>
          <div className="flex flex-col gap-3 w-full max-w-xs">
            <DiscordSignInButton />
            <GithubSignInButton />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default MembersOnly;
