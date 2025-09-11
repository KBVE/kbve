import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_URL = 'https://supabase.kbve.com';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';

declare global {
  interface Window {
    supabase?: SupabaseClient;
  }
}

export const supabase = (() => {
  if (typeof window !== 'undefined') {
    if (!window.supabase) {
      window.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return window.supabase;
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
})();
