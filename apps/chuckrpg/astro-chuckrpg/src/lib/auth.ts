// src/lib/auth.ts
// Singleton AuthBridge for ChuckRPG — uses @kbve/astro's AuthBridge
// which handles OAuth flows via IndexedDB-backed Supabase client.
import { AuthBridge } from '@kbve/astro';

export const SUPABASE_URL = 'https://supabase.kbve.com';
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';

export const authBridge = new AuthBridge(SUPABASE_URL, SUPABASE_ANON_KEY);
