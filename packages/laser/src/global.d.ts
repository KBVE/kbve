// global.d.ts 
import { SupabaseClient } from '@supabase/supabase-js';

declare global {
  interface Window {
    supabase?: SupabaseClient; // Add the supabase property to the Window interface
  }
}

export {};