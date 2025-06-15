import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';


const options = {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
}

const supabase = createClient('https://qmpdruitzlownnnnjmpk.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcGRydWl0emxvd25ubm5qbXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NjA0NTYsImV4cCI6MjA2NTIzNjQ1Nn0.OhD3qN4dq0TMA65qVGvry_QsZEeLKK7RbwYP3QzAvcY', options); // Set your env vars

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