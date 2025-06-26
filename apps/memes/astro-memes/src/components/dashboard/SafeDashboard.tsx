import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import { userAtom, syncSupabaseUser } from '../../layouts/client/supabase/profile/userstate';

/**
 * Safe Dashboard Component - No Children Dependencies
 * 
 * This component is completely self-contained and doesn't use any children/slot patterns
 * that could cause hydration issues with Astro's static site generation.
 */
export const SafeDashboard: React.FC = () => {
  const user = useStore(userAtom);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      await syncSupabaseUser();
      setIsLoading(false);
    };
    
    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950/20 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950/20 flex items-center justify-center p-8">
        <div className="max-w-md mx-auto text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          
          <h1 className="text-2xl font-bold text-white mb-4">Dashboard Access Required</h1>
          <p className="text-zinc-300 mb-6">Please sign in to access your personal dashboard.</p>
          
          <div className="space-y-3">
            <button 
              onClick={() => window.location.href = '/auth/login'}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
            >
              Sign In
            </button>
            <button 
              onClick={() => window.location.href = '/auth/register'}
              className="w-full bg-zinc-600 hover:bg-zinc-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
            >
              Create Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950/20 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-emerald-400 mb-2">Welcome back, {user.username || user.email}!</h1>
          <p className="text-zinc-400">Here's your meme dashboard overview</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Meme Analytics Card */}
          <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-emerald-400 mb-4">Your Memes</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-neutral-300">Total Uploads</span>
                <span className="text-white font-bold text-xl">42</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-300">Total Likes</span>
                <span className="text-white font-bold text-xl">1,337</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-300">Total Views</span>
                <span className="text-white font-bold text-xl">12,456</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-300">Shares</span>
                <span className="text-white font-bold text-xl">892</span>
              </div>
            </div>
          </div>

          {/* Profile Stats */}
          <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-blue-400 mb-4">Profile Stats</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-neutral-300">Followers</span>
                <span className="text-white font-bold text-xl">256</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-300">Following</span>
                <span className="text-white font-bold text-xl">189</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-300">Reputation</span>
                <span className="text-white font-bold text-xl">★ 4.8</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-neutral-300">Level</span>
                <span className="text-white font-bold text-xl">12</span>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-purple-400 mb-4">Recent Activity</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-neutral-300">Uploaded "Monday Mood"</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span className="text-neutral-300">Got 50 likes on "Cat Physics"</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <span className="text-neutral-300">New follower: @meme_lover</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span className="text-neutral-300">Featured in trending</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-4 px-6 rounded-xl transition-colors">
            Upload New Meme
          </button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 px-6 rounded-xl transition-colors">
            View Analytics
          </button>
          <button className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-4 px-6 rounded-xl transition-colors">
            Manage Profile
          </button>
          <button className="bg-zinc-600 hover:bg-zinc-700 text-white font-medium py-4 px-6 rounded-xl transition-colors">
            Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default SafeDashboard;
