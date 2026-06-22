// Web-app shim for the astro `@/lib/supa` module. AuthBridge only needs the URL
// + anon key. supabase.kbve.com's CORS allows only *.kbve.com origins, so from
// localhost we point at the dev server's same-origin `/supabase` proxy (see
// vite.config). Both values are public (mirror astro src/lib/supa.ts).

export const SUPABASE_URL =
	(import.meta.env.PUBLIC_SUPABASE_URL as string | undefined) || '/supabase';

export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';
