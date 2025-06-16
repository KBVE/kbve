import React, { useState } from 'react';
import { signInWithDiscord, signInWithGithub } from './OAuthSignIn.tsx';

const Modal = ({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-8 max-w-2xl w-full relative flex flex-col md:flex-row gap-8">
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

const MembersOnly: React.FC = () => {
  const [open, setOpen] = useState(true);

  return (
    <Modal open={open} onClose={() => setOpen(false)}>
      {/* Left Side: Login/Register */}
      <div className="flex-1 flex flex-col items-center justify-center text-center border-r border-zinc-200 dark:border-zinc-700 pr-8">
        <div className="text-3xl mb-2">🔒</div>
        <h2 className="text-xl font-bold mb-2 text-cyan-500">Members Only</h2>
        <p className="mb-4 text-zinc-600 dark:text-zinc-300">
          Please <a href="/login" className="text-cyan-500 underline">Login</a> or <a href="/register" className="text-purple-500 underline">Register</a> to access this content.
        </p>
      </div>
      {/* Right Side: OAuth Auths */}
      <div className="flex-1 flex flex-col items-center justify-center text-center pl-8">
        <div className="text-lg font-semibold mb-4 text-zinc-700 dark:text-zinc-200">Or sign in with</div>
        <div className="flex flex-col gap-3 w-full">
          <button
            className="bg-[#5865F2] text-white font-semibold py-2 px-5 rounded-full shadow hover:bg-[#4752c4] transition w-full"
            onClick={signInWithDiscord}
          >
            <span className="mr-2">🟦</span> Discord
          </button>
          <button
            className="bg-[#24292F] text-white font-semibold py-2 px-5 rounded-full shadow hover:bg-[#444c56] transition w-full"
            onClick={signInWithGithub}
          >
            <span className="mr-2">🐙</span> GitHub
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default MembersOnly;
