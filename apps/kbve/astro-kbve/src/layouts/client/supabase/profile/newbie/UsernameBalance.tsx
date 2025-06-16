import React from 'react';
import { useForm } from 'react-hook-form';
import { useStore } from '@nanostores/react';
import { userAtom, usernameAtom, syncSupabaseUser } from 'src/layouts/client/supabase/profile/userstate';
import { supabase, SUPABASE_URL } from 'src/layouts/client/supabase/supabaseClient';
import { clsx, twMerge } from 'src/utils/tw';
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

interface FormData {
  username: string;
}

const UsernameBalance: React.FC = () => {
  const user = useStore(userAtom);
  const username = useStore(usernameAtom);
  const { register, handleSubmit, formState: { errors, isSubmitting }, setError, setValue } = useForm<FormData>();
  const [success, setSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    syncSupabaseUser();
  }, []);

  const onSubmit = async (data: FormData) => {
    setSuccess(null);
    if (!user) {
      setError('username', { type: 'manual', message: 'User not logged in.' });
      return;
    }
    try {
      const { data: result, error } = await supabase.functions.invoke('register-user', {
        body: { username: data.username }
      });
      if (error) {
        setError('username', { type: 'manual', message: error.message || 'Registration failed.' });
      } else {
        setSuccess('Username registered successfully!');
        usernameAtom.set(data.username); // Set the atom on success
      }
    } catch (err) {
      setError('username', { type: 'manual', message: 'Network error.' });
    }
  };

  // Only consider onboarded if username is a valid, non-empty string matching the regex
  const validUsername = (name: string | null | undefined) =>
    typeof name === 'string' && USERNAME_REGEX.test(name);
  const alreadyOnboarded = validUsername(username) || validUsername(user?.user_metadata?.username);

  // Get avatar URL from user metadata if available
  const avatarUrl = user?.user_metadata?.avatar_url || user?.user_metadata?.picture || null;

  // Always show the form, but disable it if already onboarded
  return (
    <div className="onboarding-card flex flex-col items-center gap-6 p-6 max-w-md mx-auto bg-white/80 dark:bg-zinc-900/80 border border-cyan-100 dark:border-zinc-800 shadow-xl rounded-2xl">
      {user && (
        <div className="flex flex-col items-center gap-2">
          {avatarUrl && (
            <img
              src={avatarUrl}
              alt="User Avatar"
              className="w-20 h-20 rounded-full border-4 border-cyan-400 shadow-md mb-2 bg-white object-cover"
            />
          )}
          <div className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">{user.user_metadata?.display_name || user.email}</div>
        </div>
      )}
      <h2 className="text-2xl font-bold text-cyan-600 dark:text-cyan-300 mb-2 drop-shadow">{alreadyOnboarded ? 'Update your username' : 'Choose your username'}</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="w-full flex flex-col gap-3">
        <input
          type="text"
          {...register('username', {
            required: 'Username is required',
            pattern: {
              value: USERNAME_REGEX,
              message: '3-30 chars, letters, numbers, _ or -',
            },
          })}
          placeholder="Username"
          className="border-2 border-cyan-200 dark:border-cyan-700 rounded-lg px-4 py-3 text-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 shadow-sm transition"
          disabled={isSubmitting || alreadyOnboarded}
        />
        {errors.username && <div className="text-red-500 text-xs font-medium">{errors.username.message}</div>}
        <button
          type="submit"
          className="bg-gradient-to-br from-cyan-500 to-purple-500 text-white px-6 py-2 rounded-full font-bold shadow hover:from-cyan-400 hover:to-purple-400 hover:shadow-lg transition disabled:opacity-50 text-lg"
          disabled={isSubmitting || alreadyOnboarded}
        >
          {alreadyOnboarded ? 'Username Set' : isSubmitting ? 'Registering...' : 'Register'}
        </button>
      </form>
      {success && <div className="text-green-500 text-sm font-semibold">{success}</div>}
      {alreadyOnboarded && <div className="text-cyan-600 text-xs font-medium">You are already onboarded.</div>}
    </div>
  );
};

export default UsernameBalance;
