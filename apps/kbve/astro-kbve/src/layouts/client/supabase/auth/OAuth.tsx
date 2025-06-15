import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://qmpdruitzlownnnnjmpk.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcGRydWl0emxvd25ubm5qbXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NjA0NTYsImV4cCI6MjA2NTIzNjQ1Nn0.OhD3qN4dq0TMA65qVGvry_QsZEeLKK7RbwYP3QzAvcY'); // Set your env vars

export const OAuth = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.exchangeCodeForSession();
      if (error) {
        setStatus('error');
        setErrorMsg(error.message || 'OAuth login failed.');
        // Optionally redirect after a delay
        // setTimeout(() => {
        //   window.location.href = '/login';
        // }, 5000);
      } else if (data?.session) {
        setStatus('success');
        // Optional: store session info or update your state here
        setTimeout(() => {
          window.location.href = '/profile';
        }, 1000);
      } else {
        setStatus('error');
        setErrorMsg('No session found.');
        setTimeout(() => {
          window.location.href = '/login';
        }, 3000);
      }
      // Clean up the URL
      window.location.hash = '';
    })();
  }, []);

  if (status === 'loading') return null;
  if (status === 'success') return <div className="text-green-500 text-center">Login successful! Redirecting…</div>;
  if (status === 'error') return <div className="text-red-500 text-center">{errorMsg} Redirecting…</div>;
  return null;
};

export default OAuth;