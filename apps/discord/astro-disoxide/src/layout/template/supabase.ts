import { createClient } from '@supabase/supabase-js';

type SupabaseClient = ReturnType<typeof createClient>;

export const SUPABASE_URL = 'https://supabase.kbve.com';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU0MTkzNjAwLCJleHAiOjE5MTE5NjAwMDB9.knszQD6J5e7ctv7TLskqykvOGa2iNVtDcC9liociKm4';

declare global {
  interface Window {
    supabase?: SupabaseClient;
  }
}

export const supabase = (() => {
  if (typeof window !== 'undefined') {
    if (!window.supabase) {
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
