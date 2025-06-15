import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';

const supabase = createClient('https://qmpdruitzlownnnnjmpk.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcGRydWl0emxvd25ubm5qbXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NjA0NTYsImV4cCI6MjA2NTIzNjQ1Nn0.OhD3qN4dq0TMA65qVGvry_QsZEeLKK7RbwYP3QzAvcY'); // Set your env vars

const UserData: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        setError(error.message || 'Failed to fetch user data.');
        setUser(null);
      } else {
        setUser(data?.user || null);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-center text-neutral-600 dark:text-neutral-300">Loading your profile…</div>;
  if (error) return <div className="text-red-500 text-center">{error}</div>;
  if (!user) return <div className="text-center text-neutral-600 dark:text-neutral-300">No user data found.</div>;

  return (
    <div className="bg-neutral-100 dark:bg-neutral-900 rounded-xl shadow p-6 max-w-lg mx-auto mt-6">
      <h2 className="text-2xl font-bold mb-4 text-neutral-900 dark:text-white">Profile</h2>
      <div className="mb-2"><span className="font-semibold">ID:</span> {user.id}</div>
      <div className="mb-2"><span className="font-semibold">Email:</span> {user.email}</div>
      <div className="mb-2"><span className="font-semibold">Display Name:</span> {user.user_metadata?.display_name || 'N/A'}</div>
      <div className="mb-2"><span className="font-semibold">Created:</span> {user.created_at ? new Date(user.created_at).toLocaleString() : 'N/A'}</div>
      {/* Add more user fields as needed */}
    </div>
  );
};

export default UserData;
