import React from 'react';
import { AuthGuard } from '../../layouts/core/auth/AuthGuard';

const ProtectedProfileContent: React.FC = () => {
  return (
    <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-2xl p-6">
      <h2 className="text-xl font-semibold text-emerald-400 mb-4">Protected Profile Content</h2>
      <p className="text-neutral-300">This content only shows when you're authenticated!</p>
      <div className="mt-4 space-y-2">
        <div className="flex justify-between">
          <span className="text-neutral-300">Your Memes:</span>
          <span className="text-white font-bold">42</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-300">Total Likes:</span>
          <span className="text-white font-bold">1,337</span>
        </div>
      </div>
    </div>
  );
};

export const Profile: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-emerald-900 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-emerald-400 mb-8">Profile Test</h1>
        
        {/* Public content */}
        <div className="bg-zinc-800/50 backdrop-blur border border-zinc-700 rounded-2xl p-6 mb-8">
          <h2 className="text-xl font-semibold text-emerald-400 mb-4">Public Profile</h2>
          <p className="text-neutral-300">This content is always visible (no auth required)</p>
        </div>

        {/* AuthGuard protected content */}
        <AuthGuard 
          requireAuth={true}
          fallback={
            <div className="bg-red-800/50 backdrop-blur border border-red-700 rounded-2xl p-6">
              <h2 className="text-xl font-semibold text-red-400 mb-4">Access Denied</h2>
              <p className="text-neutral-300">Please log in to view your profile</p>
              <a 
                href="/auth/login" 
                className="inline-block mt-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Log In
              </a>
            </div>
          }
        >
          <ProtectedProfileContent />
        </AuthGuard>
      </div>
    </div>
  );
};
