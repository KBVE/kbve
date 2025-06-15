import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://qmpdruitzlownnnnjmpk.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcGRydWl0emxvd25ubm5qbXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NjA0NTYsImV4cCI6MjA2NTIzNjQ1Nn0.OhD3qN4dq0TMA65qVGvry_QsZEeLKK7RbwYP3QzAvcY'); // Set your env vars

const GlobalLogout: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>("loading");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { error } = await supabase.auth.signOut();
      if (error) {
        setStatus('error');
        setErrorMsg(error.message || 'Logout failed.');
        setTimeout(() => {
          window.location.href = '/profile';
        }, 3000);
      } else {
        setStatus('success');
        setTimeout(() => {
          window.location.href = '/login';
        }, 1500);
      }
    })();
  }, []);

  if (status === 'loading') return <div className="text-center text-neutral-600 dark:text-neutral-300">Logging you out…</div>;
  if (status === 'success') return <div className="text-green-500 text-center">Logged out! Redirecting…</div>;
  if (status === 'error') return <div className="text-red-500 text-center">{errorMsg} Redirecting…</div>;
  return null;
};

export default GlobalLogout;
