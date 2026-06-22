// supabase.kbve.com CORS allows only *.kbve.com; from localhost the vite dev
// server proxies same-origin `/supabase` to dodge it. createClient requires an
// absolute URL, so resolve the proxy path against the current origin.
const RAW_SUPABASE_URL =
	(import.meta.env.PUBLIC_SUPABASE_URL as string | undefined) || '/supabase';

export const SUPABASE_URL =
	RAW_SUPABASE_URL.startsWith('/') && typeof window !== 'undefined'
		? `${window.location.origin}${RAW_SUPABASE_URL}`
		: RAW_SUPABASE_URL;

export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';
