import { createClient } from '@supabase/supabase-js';

type SupabaseClient = ReturnType<typeof createClient>;

export const SUPABASE_URL = 'https://qmpdruitzlownnnnjmpk.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcGRydWl0emxvd25ubm5qbXBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk2NjA0NTYsImV4cCI6MjA2NTIzNjQ1Nn0.OhD3qN4dq0TMA65qVGvry_QsZEeLKK7RbwYP3QzAvcY';

declare global {
  interface Window {
    supabase?: SupabaseClient;
  }
}

export const supabase = (() => {
  if (typeof window !== 'undefined') {
    if (!window.supabase) {
      // window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const isOAuthCallback = window.location.href.includes('/auth/callback');

      window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: isOAuthCallback,
        },
      });
    }
    return window.supabase;
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
