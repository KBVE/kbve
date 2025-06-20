import { supabase } from 'src/layouts/client/supabase/supabaseClient';
import React, { useState } from 'react';
import { twMerge } from 'src/utils/tw';

const auth_url = import.meta.env.DEV ? 'http://localhost:4321/auth' : 'https://kbve.com/auth';

export async function signInWithDiscord() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      redirectTo: auth_url
    }
  });
  if (error) throw error;
  if (data?.url) window.location.href = data.url;
}

export async function signInWithGithub() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: auth_url
    }
  });
  if (error) throw error;
  if (data?.url) window.location.href = data.url;
}

export async function signInWithSolana(captchaToken?: string) {
  const { data, error } = await supabase.auth.signInWithWeb3({
    chain: 'solana',
    statement: 'I accept the Terms of Service at https://kbve.com/legal/',
    options: {
      url: auth_url,
      captchaToken
    }
  });
  if (error) throw error;
  // Handle successful sign-in (data.session, data.user) as needed
}

export const GithubSignInButton: React.FC = () => {
  return (
    <button
      onClick={() => signInWithGithub()}
      className="flex items-center justify-center gap-2 w-full py-2 rounded bg-black text-white font-semibold shadow hover:bg-gray-800 transition"
      type="button"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.43 7.86 10.96.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.73 1.27 3.4.97.11-.75.41-1.27.74-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 2.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.69 5.41-5.25 5.7.42.36.79 1.09.79 2.2 0 1.59-.01 2.87-.01 3.26 0 .31.21.68.8.56C20.71 21.45 24 17.12 24 12.02 24 5.74 18.27.5 12 .5z"/></svg>
      Continue with GitHub
    </button>
  );
};

export const DiscordSignInButton: React.FC = () => {
  return (
    <button
      onClick={() => signInWithDiscord()}
      className="flex items-center justify-center gap-2 w-full py-2 rounded bg-[#5865F2] text-white font-semibold shadow hover:bg-[#4752c4] transition"
      type="button"
    >
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.317 4.3698a19.7913 19.7913 0 0 0-4.8851-1.5152.0741.0741 0 0 0-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 0 0-.0785-.037 19.7363 19.7363 0 0 0-4.8852 1.515.0699.0699 0 0 0-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 0 0 .0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 0 0 .0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 0 0-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 0 1-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 0 1 .0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 0 1 .0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 0 1-.0066.1276c-.598.3428-1.2205.6447-1.8733.8923a.0766.0766 0 0 0-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 0 0 .0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 0 0 .0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 0 0-.0312-.0286zM8.02 15.3312c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1835 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/></svg>
      Continue with Discord
    </button>
  );
};

export const SolanaSignInButton: React.FC<{ captchaToken?: string | null }> = ({ captchaToken }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const handleSolanaSignIn = () => {
    if (!captchaToken) {
      setShowTooltip(true);
      setTimeout(() => setShowTooltip(false), 3000);
      return;
    }
    signInWithSolana(captchaToken);
  };

  const handleMouseEnter = () => {
    if (!captchaToken) {
      setShowTooltip(true);
    }
  };

  const handleMouseLeave = () => {
    if (!captchaToken) {
      setShowTooltip(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={handleSolanaSignIn}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        disabled={!captchaToken}
        className={twMerge(
          "flex items-center justify-center gap-2 w-full py-2 rounded bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow transition",
          !captchaToken 
            ? "opacity-50 cursor-not-allowed hover:from-purple-500 hover:to-pink-500" 
            : "hover:from-purple-600 hover:to-pink-600"
        )}
        type="button"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4.52 4.52l15 15M19.5 4.5l-15 15M12 2l10 10-10 10L2 12l10-10z"/>
        </svg>
        Continue with Solana
      </button>
      {showTooltip && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded bg-neutral-900/95 text-white text-xs p-3 shadow-lg border border-neutral-700">
          <div className="text-yellow-400 font-semibold mb-1">⚠️ Captcha Required</div>
          <div>Please complete the hCaptcha challenge below before signing in with Solana.</div>
        </div>
      )}
    </div>
  );
};
