import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { userActions } from '../stores/userStore';
import { Github, MessageCircle, Loader2 } from 'lucide-react';

interface OAuthLoginProps {
  redirectTo?: string;
  className?: string;
  showTitle?: boolean;
}

export const OAuthLogin: React.FC<OAuthLoginProps> = ({ 
  redirectTo = '/', 
  className = '',
  showTitle = true 
}) => {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOAuthLogin = async (provider: 'github' | 'discord') => {
    try {
      setIsLoading(provider);
      setError(null);
      userActions.setLoading(true);
      userActions.setError(null);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback${redirectTo !== '/' ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        throw error;
      }

      // OAuth will redirect to callback page, so we don't need to handle success here
    } catch (err) {
      console.error(`${provider} OAuth error:`, err);
      const errorMessage = err instanceof Error ? err.message : `Failed to sign in with ${provider}`;
      setError(errorMessage);
      userActions.setError(errorMessage);
    } finally {
      setIsLoading(null);
      userActions.setLoading(false);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {showTitle && (
        <div className="text-center">
          <h3 className="text-lg font-semibold text-white mb-2">Quick Sign In</h3>
          <p className="text-sm text-neutral-400">Choose your preferred platform</p>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-sm text-red-400 text-center">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        {/* Discord OAuth */}
        <button
          onClick={() => handleOAuthLogin('discord')}
          disabled={!!isLoading}
          className="w-full flex items-center justify-center space-x-3 px-4 py-3 bg-[#5865F2] hover:bg-[#4752C4] disabled:bg-[#5865F2]/50 text-white rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed"
        >
          {isLoading === 'discord' ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <MessageCircle size={20} />
          )}
          <span>
            {isLoading === 'discord' ? 'Connecting...' : 'Continue with Discord'}
          </span>
        </button>

        {/* GitHub OAuth */}
        <button
          onClick={() => handleOAuthLogin('github')}
          disabled={!!isLoading}
          className="w-full flex items-center justify-center space-x-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 text-white rounded-lg font-medium transition-all duration-200 transform hover:scale-[1.02] disabled:transform-none disabled:cursor-not-allowed border border-zinc-600"
        >
          {isLoading === 'github' ? (
            <Loader2 size={20} className="animate-spin" />
          ) : (
            <Github size={20} />
          )}
          <span>
            {isLoading === 'github' ? 'Connecting...' : 'Continue with GitHub'}
          </span>
        </button>
      </div>

      {!showTitle && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-700"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-zinc-900 text-neutral-400">or</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default OAuthLogin;
