import React, { useEffect, useState } from 'react';
import { supabase } from 'src/layouts/client/supabase/supabaseClient';

const options = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
}


export const OAuth = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();

      if (error) {
        setStatus('error');
        setErrorMsg(error.message || 'Failed to fetch user session.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 3000);
      } else if (data?.user) {
        setStatus('success');
        setTimeout(() => {
          window.location.href = '/profile';
        }, 1000);
      } else {
        setStatus('error');
        setErrorMsg('No user session found.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 3000);
      }

      window.location.hash = '';
    })();
  }, []);

  if (status === 'loading') return null;
  if (status === 'success') return <div className="text-green-500 text-center">Login successful! Redirecting…</div>;
  if (status === 'error') return <div className="text-red-500 text-center">{errorMsg} Redirecting…</div>;
  return null;
};

export default OAuth;