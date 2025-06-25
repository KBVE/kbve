import React from 'react';
import { useStore } from '@nanostores/react';
import { clsx } from 'src/layouts/core/tw';
import { isAuthenticated, userProfile } from '../../layouts/core/stores/userStore';
import { 
  User, 
  Mail, 
  Globe, 
  MapPin, 
  Calendar,
  Settings,
  Edit3,
  BarChart3,
  Heart,
  Image,
  Flame
} from 'lucide-react';

const ProfileStats: React.FC<{ profile: any }> = ({ profile }) => {
  const stats = profile?.stats || {
    memes_created: 0,
    memes_liked: 0,
    followers_count: 0,
    following_count: 0,
    total_views: 0,
    total_likes_received: 0
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      <div className="bg-zinc-700/50 rounded-lg p-4 text-center">
        <Image size={24} className="text-emerald-400 mx-auto mb-2" />
        <div className="text-2xl font-bold text-white">{stats.memes_created}</div>
        <div className="text-sm text-neutral-400">Memes Created</div>
      </div>
      <div className="bg-zinc-700/50 rounded-lg p-4 text-center">
        <Heart size={24} className="text-red-400 mx-auto mb-2" />
        <div className="text-2xl font-bold text-white">{stats.total_likes_received}</div>
        <div className="text-sm text-neutral-400">Likes Received</div>
      </div>
      <div className="bg-zinc-700/50 rounded-lg p-4 text-center">
        <Flame size={24} className="text-orange-400 mx-auto mb-2" />
        <div className="text-2xl font-bold text-white">{stats.total_views}</div>
        <div className="text-sm text-neutral-400">Total Views</div>
      </div>
    </div>
  );
};

export const Profile: React.FC = () => {
  const authenticated = useStore(isAuthenticated);
  const profile = useStore(userProfile);

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-emerald-900 flex items-center justify-center p-4">
        <div className="bg-zinc-800/80 backdrop-blur-lg rounded-2xl shadow-2xl p-8 max-w-md w-full border border-zinc-700 text-center">
          <User size={48} className="text-emerald-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-4">Sign In Required</h2>
          <p className="text-neutral-400 mb-6">
            Please sign in to view your profile.
          </p>
          <a 
            href="/"
            className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-lg font-medium hover:from-emerald-600 hover:to-green-600 transition-all duration-200 transform hover:scale-105"
          >
            Return Home
          </a>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-emerald-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto mb-4"></div>
          <p className="text-neutral-400">Loading profile...</p>
        </div>
      </div>
    );
  }

  const joinDate = profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unknown';

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-emerald-900 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Profile Header */}
        <div className="bg-zinc-800/80 backdrop-blur-lg rounded-2xl shadow-2xl border border-zinc-700 p-8 mb-6">
          <div className="flex flex-col md:flex-row items-center md:items-start space-y-6 md:space-y-0 md:space-x-8">
            {/* Avatar */}
            <div className="relative">
              <div className="w-32 h-32 bg-gradient-to-r from-emerald-500 to-green-500 rounded-full flex items-center justify-center text-black text-4xl font-bold shadow-lg">
                {profile.username?.[0]?.toUpperCase() || profile.email[0]?.toUpperCase()}
              </div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-emerald-400 rounded-full flex items-center justify-center">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-3xl font-bold text-white mb-2">
                {profile.display_name || profile.username || 'Meme Creator'}
              </h1>
              {profile.username && profile.display_name && (
                <p className="text-emerald-400 text-lg mb-2">@{profile.username}</p>
              )}
              
              <div className="flex flex-wrap justify-center md:justify-start items-center gap-4 text-neutral-400 text-sm mb-4">
                <div className="flex items-center">
                  <Mail size={16} className="mr-2" />
                  {profile.email}
                </div>
                {profile.location && (
                  <div className="flex items-center">
                    <MapPin size={16} className="mr-2" />
                    {profile.location}
                  </div>
                )}
                <div className="flex items-center">
                  <Calendar size={16} className="mr-2" />
                  Joined {joinDate}
                </div>
              </div>

              {profile.bio && (
                <p className="text-neutral-300 mb-4 max-w-2xl">
                  {profile.bio}
                </p>
              )}

              {profile.website && (
                <a 
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-emerald-400 hover:text-emerald-300 transition-colors duration-200"
                >
                  <Globe size={16} className="mr-2" />
                  {profile.website}
                </a>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col space-y-3">
              <a
                href="/profile/settings"
                className="flex items-center px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-lg hover:from-emerald-600 hover:to-green-600 transition-all duration-200 transform hover:scale-105"
              >
                <Edit3 size={16} className="mr-2" />
                Edit Profile
              </a>
              <button className="flex items-center px-4 py-2 border border-zinc-600 text-neutral-300 rounded-lg hover:border-zinc-500 hover:text-white transition-colors duration-200">
                <Settings size={16} className="mr-2" />
                Settings
              </button>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="bg-zinc-800/80 backdrop-blur-lg rounded-2xl shadow-2xl border border-zinc-700 p-6 mb-6">
          <div className="flex items-center mb-6">
            <BarChart3 size={24} className="text-emerald-400 mr-3" />
            <h2 className="text-2xl font-bold text-white">Your Stats</h2>
          </div>
          <ProfileStats profile={profile} />
        </div>

        {/* Recent Activity */}
        <div className="bg-zinc-800/80 backdrop-blur-lg rounded-2xl shadow-2xl border border-zinc-700 p-6">
          <div className="flex items-center mb-6">
            <Flame size={24} className="text-emerald-400 mr-3" />
            <h2 className="text-2xl font-bold text-white">Recent Activity</h2>
          </div>
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-zinc-700 rounded-full flex items-center justify-center mx-auto mb-4">
              <Image size={24} className="text-neutral-400" />
            </div>
            <h3 className="text-lg font-semibold text-neutral-300 mb-2">No activity yet</h3>
            <p className="text-neutral-400 mb-4">
              Start creating and sharing memes to see your activity here!
            </p>
            <a
              href="/create"
              className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-lg hover:from-emerald-600 hover:to-green-600 transition-all duration-200 transform hover:scale-105"
            >
              Create Your First Meme
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
