import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { syncSupabaseUser } from 'src/layouts/client/supabase/profile/userstate';

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
      window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      // Sync user on client creation
      syncSupabaseUser();
      // Subscribe to auth state changes
      window.supabase.auth.onAuthStateChange(() => {
        syncSupabaseUser();
      });
    }
    return window.supabase;
  }
  // SSR fallback (should not be used in browserless environments)
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
