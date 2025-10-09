import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { userAtom } from '../profile/userstate';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';

const Modal = ({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-8 max-w-md w-full relative">
        <button
          className="absolute top-3 right-3 text-neutral-400 hover:text-neutral-700 dark:hover:text-white text-xl"
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

// No props needed, fully passive
const OppsAuth: React.FC = () => {
  const user = useStore(userAtom);
  const [open, setOpen] = useState(false);

  // New: Always check supabase for user if not present in atom
  useEffect(() => {
    if (!user) {
      supabase.auth.getUser().then(({ data, error }) => {
        if (data?.user) {
          userAtom.set(data.user);
          setOpen(true);
        } else {
          setOpen(false);
        }
      });
    } else {
      setOpen(true);
    }
  }, [user]);

  const display = user?.user_metadata?.display_name || user?.email || 'User';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleProfile = () => {
    window.location.href = '/profile';
  };

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      <div className="flex flex-col items-center text-center">
        <div className="text-3xl mb-2">👋</div>
        <h2 className="text-xl font-bold mb-2 text-cyan-500">Hey, {display}!</h2>
        <p className="mb-4 text-zinc-600 dark:text-zinc-300">
          Opps, you seem to already be logged in.<br />
          Would you like to go to your profile or log out before trying to login/register?
        </p>
        <div className="flex gap-3 mt-2">
          <button
            className="bg-gradient-to-br from-cyan-400 to-purple-500 text-white font-semibold py-2 px-5 rounded-full shadow hover:from-cyan-300 hover:to-purple-400 transition"
            onClick={handleProfile}
          >
            Go to Profile
          </button>
          <button
            className="bg-zinc-200 dark:bg-zinc-700 text-zinc-800 dark:text-white font-semibold py-2 px-5 rounded-full shadow hover:bg-zinc-300 dark:hover:bg-zinc-600 transition"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default OppsAuth;
