import React from 'react';
import { useForm } from 'react-hook-form';
import { useStore } from '@nanostores/react';
import { userAtom, usernameAtom } from 'src/layouts/client/supabase/profile/userstate';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';

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
    if (username) {
      setValue('username', username);
    } else if (user && user.user_metadata?.username) {
      setValue('username', user.user_metadata.username);
    }
  }, [user, username, setValue]);

  const onSubmit = async (data: FormData) => {
    setSuccess(null);
    if (!user) {
      setError('username', { type: 'manual', message: 'User not logged in.' });
      return;
    }
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch('/functions/v1/register-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ username: data.username })
      });
      const result = await res.json();
      if (!res.ok) {
        setError('username', { type: 'manual', message: result.error || 'Registration failed.' });
      } else {
        setSuccess('Username registered successfully!');
        usernameAtom.set(data.username); // Set the atom on success
      }
    } catch (err) {
      setError('username', { type: 'manual', message: 'Network error.' });
    }
  };

  if (!user) return null;

  const alreadyOnboarded = !!(username || user.user_metadata?.username);

  return (
    <div className="flex flex-col items-center gap-4 p-4 max-w-sm mx-auto">
      <h2 className="text-xl font-bold">{alreadyOnboarded ? 'Update your username' : 'Choose your username'}</h2>
      <form onSubmit={handleSubmit(onSubmit)} className="w-full flex flex-col gap-2">
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
          className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          disabled={isSubmitting || alreadyOnboarded}
        />
        {errors.username && <div className="text-red-500 text-xs">{errors.username.message}</div>}
        <button
          type="submit"
          className="bg-cyan-500 text-white px-4 py-2 rounded font-semibold hover:bg-cyan-600 disabled:opacity-50"
          disabled={isSubmitting || alreadyOnboarded}
        >
          {alreadyOnboarded ? 'Username Set' : isSubmitting ? 'Registering...' : 'Register'}
        </button>
      </form>
      {success && <div className="text-green-500 text-sm">{success}</div>}
      {alreadyOnboarded && <div className="text-cyan-600 text-xs">You are already onboarded.</div>}
    </div>
  );
};

export default UsernameBalance;
