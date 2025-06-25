import React from 'react';
import { useStore } from '@nanostores/react';
import { userMemeProfileAtom, usernameAtom, getCurrentUserProfile } from '../../../layouts/client/supabase/profile/userstate';

/**
 * UserProfileDisplay Component
 * 
 * Displays user profile information including:
 * - Basic user data (username, role, level) from astro-kbve's get_user_balance_context RPC
 * - Financial data (credits, khash) from the same RPC
 * - Meme-specific placeholders (meme_points, total_memes, total_likes) - currently 0 until schema is extended
 * 
 * Data is sourced from the shared Supabase instance between astro-kbve and astro-memes.
 */

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

interface UserProfileDisplayProps {
  className?: string;
  showDetails?: boolean;
}

export default function UserProfileDisplay({ className = '', showDetails = true }: UserProfileDisplayProps) {
  const profile = useStore(userMemeProfileAtom);
  const username = useStore(usernameAtom);

  if (!profile) {
    return (
      <div className={`bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 ${className}`}>
        <p className="text-zinc-400 text-sm">No profile data available</p>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 border border-emerald-500/20 rounded-lg p-6 backdrop-blur-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-500 rounded-full flex items-center justify-center text-xl font-bold text-white">
          {(username || profile.username || 'U')[0].toUpperCase()}
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">
            {username || profile.username || 'Anonymous User'}
          </h3>
          <p className="text-emerald-400 text-sm capitalize">
            {profile.role || 'Member'} • Level {profile.level || 1}
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      {showDetails && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-zinc-700/30 rounded-lg p-3 text-center" title={`${formatExactNumber(profile.credits)} Credits`}>
            <div className="text-2xl font-bold text-green-400 cursor-help">
              {formatNumber(profile.credits)}
            </div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide">
              Credits
            </div>
          </div>

          <div className="bg-zinc-700/30 rounded-lg p-3 text-center" title={`${formatExactNumber(profile.khash)} Khash`}>
            <div className="text-2xl font-bold text-purple-400 cursor-help">
              {formatNumber(profile.khash)}
            </div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide">
              Khash
            </div>
          </div>

          {/* Meme-specific stats - currently placeholders until database schema is extended */}
          <div className="bg-zinc-700/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-emerald-400">
              {profile.meme_points || 0}
            </div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide">
              Meme Points
            </div>
          </div>

          <div className="bg-zinc-700/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-400">
              {profile.total_memes || 0}
            </div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide">
              Memes Created
            </div>
          </div>

          <div className="bg-zinc-700/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-pink-400">
              {profile.total_likes || 0}
            </div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide">
              Likes Received
            </div>
          </div>

          <div className="bg-zinc-700/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-yellow-400">
              {profile.level || 1}
            </div>
            <div className="text-xs text-zinc-400 uppercase tracking-wide">
              Level
            </div>
          </div>
        </div>
      )}

      {/* Member Since */}
      {profile.created_at && (
        <div className="mt-4 pt-4 border-t border-zinc-700/50">
          <p className="text-xs text-zinc-400">
            Member since {new Date(profile.created_at).toLocaleDateString()}
          </p>
        </div>
      )}

      {/* Debug Info (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <details className="mt-4 pt-4 border-t border-zinc-700/50">
          <summary className="text-xs text-zinc-500 cursor-pointer">
            Debug Info
          </summary>
          <pre className="text-xs text-zinc-400 mt-2 overflow-auto">
            {JSON.stringify(profile, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
