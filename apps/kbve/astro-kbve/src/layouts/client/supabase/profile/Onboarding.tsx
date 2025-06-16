import React, { useState } from 'react';

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;
const SUPABASE_FN_URL = 'https://qmpdruitzlownnnnjmpk.supabase.co/functions/v1/register-user';

const Onboarding: React.FC = () => {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!USERNAME_REGEX.test(username)) {
      setError('Username must be 3-30 characters and only contain letters, numbers, underscores, or hyphens.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(SUPABASE_FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to register username.');
      } else {
        setSuccess('Username registered successfully!');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 max-w-sm mx-auto">
      <h2 className="text-xl font-bold">Choose your username</h2>
      <form onSubmit={handleSubmit} className="w-full flex flex-col gap-2">
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Username"
          className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          disabled={loading}
        />
        <button
          type="submit"
          className="bg-cyan-500 text-white px-4 py-2 rounded font-semibold hover:bg-cyan-600 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? 'Registering...' : 'Register'}
        </button>
      </form>
      {error && <div className="text-red-500 text-sm">{error}</div>}
      {success && <div className="text-green-500 text-sm">{success}</div>}
    </div>
  );
};

export default Onboarding;
