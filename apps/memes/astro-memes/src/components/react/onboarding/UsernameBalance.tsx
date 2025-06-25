import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useStore } from '@nanostores/react';
import { 
  userAtom, 
  usernameAtom, 
  userMemeProfileAtom,
  syncSupabaseUser,
  syncUserMemeProfile,
  validUsername,
  userIdAtom,
  userNamePersistentAtom
} from '../../../layouts/client/supabase/profile/userstate';

// Username validation regex - same as astro-kbve
const USERNAME_REGEX = /^[a-z0-9_-]{3,30}$/;

interface FormData {
  username: string;
}

const UsernameBalance: React.FC = () => {
  const user = useStore(userAtom);
  const username = useStore(usernameAtom);
  const profile = useStore(userMemeProfileAtom);
  const userId = useStore(userIdAtom);
  
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError, setValue } = useForm<FormData>();
  const [success, setSuccess] = useState<string | null>(null);

  // Sync user data on mount
  useEffect(() => {
    syncSupabaseUser();
  }, []);

  // Sync profile when userId changes
  useEffect(() => {
    if (userId) {
      syncUserMemeProfile(userId);
    }
  }, [userId]);

  const onSubmit = async (data: FormData) => {
    setSuccess(null);
    
    if (!user) {
      setError('username', { type: 'manual', message: 'User not logged in.' });
      return;
    }

    try {
      // For now, this is a mock implementation
      // In real implementation, this would call:
      // const { data: result, error } = await supabase.functions.invoke('register-user', {
      //   body: { username: data.username }
      // });

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // For demo, check if username is "taken"
      const takenUsernames = ['admin', 'user', 'test', 'meme', 'admin123'];
      if (takenUsernames.includes(data.username)) {
        setError('username', { type: 'manual', message: 'This username is already taken. Try another one!' });
        return;
      }

      // Update atoms with new username
      usernameAtom.set(data.username);
      userNamePersistentAtom.set(data.username);
      
      // Update localStorage for demo
      localStorage.setItem('memeUsername', data.username);
      localStorage.setItem('onboardingComplete', 'true');
      
      // Create/update meme profile
      const updatedProfile = {
        user_id: user.id,
        username: data.username,
        role: 'member',
        meme_points: 100, // Starting points
        level: 1,
        total_memes: 0,
        total_likes: 0,
        created_at: new Date().toISOString()
      };
      
      userMemeProfileAtom.set(updatedProfile);
      
      setSuccess('Username registered successfully!');
      
    } catch (err) {
      console.error('Registration error:', err);
      setError('username', { type: 'manual', message: 'Network error. Please try again.' });
    }
  };

  // Check if user is already onboarded
  const alreadyOnboarded = validUsername(username) || validUsername(user?.user_metadata?.username);

  // Get avatar URL from user metadata if available
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  return (
    <div className="onboarding-card flex flex-col items-center gap-6 p-6 max-w-md mx-auto bg-white/80 dark:bg-zinc-900/80 border border-emerald-100 dark:border-zinc-800 shadow-xl rounded-2xl">
      {/* User Avatar and Info */}
      {user && (
        <div className="flex flex-col items-center gap-2">
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt="User Avatar"
              className="w-20 h-20 rounded-full border-4 border-emerald-400 shadow-md mb-2 bg-white object-cover"
            />
          )}
          <div className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
            {user.user_metadata?.display_name || user.email}
          </div>
        </div>
      )}

      {/* Title */}
      <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-300 mb-2 drop-shadow">
        {alreadyOnboarded ? 'Update your username' : 'Choose your username'}
      </h2>

      {/* Profile Stats */}
      {profile && profile.meme_points !== null && (
        <div className="flex flex-wrap justify-center gap-4 mb-4 text-center">
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-emerald-400">{profile.meme_points}</span>
            <span className="text-xs text-neutral-500">Meme Points</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-emerald-400">{profile.level}</span>
            <span className="text-xs text-neutral-500">Level</span>
          </div>
          <div className="flex flex-col">
            <span className="text-2xl font-bold text-emerald-400">{profile.total_memes || 0}</span>
            <span className="text-xs text-neutral-500">Memes Created</span>
          </div>
        </div>
      )}

      {/* Username Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="w-full flex flex-col gap-3">
        <input
          type="text"
          {...register('username', {
            required: 'Username is required',
            pattern: {
              value: USERNAME_REGEX,
              message: '3-30 chars, lowercase letters, numbers, _ or -',
            },
            onChange: (e) => {
              // Always lowercase the input
              e.target.value = e.target.value.toLowerCase();
              return e;
            },
          })}
          placeholder="Enter your username..."
          defaultValue={username || ''}
          className="border-2 border-emerald-200 dark:border-emerald-700 rounded-lg px-4 py-3 text-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-sm transition"
          disabled={isSubmitting || alreadyOnboarded}
        />
        
        {errors.username && (
          <div className="text-red-500 text-xs font-medium">{errors.username.message}</div>
        )}
        
        <button
          type="submit"
          className="bg-gradient-to-br from-emerald-500 to-green-500 text-white px-6 py-2 rounded-full font-bold shadow hover:from-emerald-400 hover:to-green-400 hover:shadow-lg transition disabled:opacity-50 text-lg"
          disabled={isSubmitting || alreadyOnboarded}
        >
          {alreadyOnboarded ? 'Username Set' : isSubmitting ? 'Registering...' : 'Register'}
        </button>
      </form>

      {/* Success Message */}
      {success && (
        <div className="text-green-500 text-sm font-semibold">{success}</div>
      )}

      {/* Success Modal */}
      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 border border-emerald-200 dark:border-emerald-700 max-w-xs">
            <div className="text-2xl text-green-600 dark:text-green-400 font-bold mb-2">Success!</div>
            <div className="text-base text-neutral-700 dark:text-neutral-200 text-center">
              Your username has been registered. Welcome to the meme community!
            </div>
            <div className="flex flex-col gap-2 w-full">
              <a 
                href="/discover" 
                className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-green-500 text-white font-bold shadow hover:from-emerald-400 hover:to-green-400 transition-colors text-center"
              >
                Discover Memes
              </a>
              <a 
                href="/profile" 
                className="px-5 py-2 rounded-lg border border-emerald-500 text-emerald-600 dark:text-emerald-400 font-bold hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-center"
              >
                View Profile
              </a>
            </div>
            <button 
              onClick={() => setSuccess(null)} 
              className="text-xs text-emerald-600 dark:text-emerald-300 mt-2 underline"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Already Onboarded Message */}
      {alreadyOnboarded && (
        <div className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">
          You are already onboarded. Welcome back!
        </div>
      )}
    </div>
  );
};

export default UsernameBalance;
