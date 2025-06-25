import React from 'react';
import { AuthGuard } from '../../layouts/core/auth/AuthGuard';

const DashboardContent: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-emerald-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-emerald-400 mb-8">Welcome to your Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Meme Analytics Card */}
          <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-emerald-400 mb-4">Your Memes</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-neutral-300">Total Uploads</span>
                <span className="text-white font-bold">42</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-300">Total Likes</span>
                <span className="text-white font-bold">1,337</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-300">Total Views</span>
                <span className="text-white font-bold">12,456</span>
              </div>
            </div>
          </div>

          {/* Profile Card */}
          <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-emerald-400 mb-4">Profile</h2>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <div className="w-12 h-12 bg-emerald-400 rounded-full flex items-center justify-center">
                  <span className="text-black font-bold text-lg">U</span>
                </div>
                <div>
                  <p className="text-white font-semibold">User</p>
                  <p className="text-neutral-400 text-sm">Meme Creator</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-2xl p-6">
            <h2 className="text-xl font-semibold text-emerald-400 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                Upload Meme
              </button>
              <button className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors">
                View Analytics
              </button>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-8 bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-emerald-400 mb-4">Recent Activity</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-zinc-700 last:border-b-0">
              <span className="text-neutral-300">Uploaded "Funny Cat Meme"</span>
              <span className="text-neutral-500 text-sm">2 hours ago</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-700 last:border-b-0">
              <span className="text-neutral-300">Received 50 likes on "Programming Humor"</span>
              <span className="text-neutral-500 text-sm">4 hours ago</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-zinc-700 last:border-b-0">
              <span className="text-neutral-300">Commented on "Relatable Monday Mood"</span>
              <span className="text-neutral-500 text-sm">1 day ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Dashboard: React.FC = () => {
  return (
    <AuthGuard 
      requireAuth={true}
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-emerald-900 flex items-center justify-center">
          <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-2xl p-8 max-w-md text-center">
            <h2 className="text-2xl font-bold text-emerald-400 mb-4">Authentication Required</h2>
            <p className="text-neutral-300 mb-6">Please log in to access your dashboard</p>
            <a 
              href="/auth/login" 
              className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              Log In
            </a>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </AuthGuard>
  );
};
