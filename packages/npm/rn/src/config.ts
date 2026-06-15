declare const process: { env: Record<string, string | undefined> };

const DEFAULT_SUPABASE_URL = 'https://supabase.kbve.com';
const DEFAULT_SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';

export const KBVE_SUPABASE_URL =
	process.env['EXPO_PUBLIC_SUPABASE_URL'] ?? DEFAULT_SUPABASE_URL;

export const KBVE_SUPABASE_ANON_KEY =
	process.env['EXPO_PUBLIC_SUPABASE_ANON_KEY'] ?? DEFAULT_SUPABASE_ANON_KEY;

const DEFAULT_HCAPTCHA_SITE_KEY = 'e19cf4a6-2168-49a2-88fe-716e97569e88';

export const KBVE_HCAPTCHA_SITE_KEY =
	process.env['EXPO_PUBLIC_HCAPTCHA_SITE_KEY'] ?? DEFAULT_HCAPTCHA_SITE_KEY;

const DEFAULT_API_URL = 'https://kbve.com';

export const KBVE_API_URL =
	process.env['EXPO_PUBLIC_API_URL'] ?? DEFAULT_API_URL;

const DEFAULT_CHAT_URL = 'wss://chat.kbve.com';

export const KBVE_CHAT_URL =
	process.env['EXPO_PUBLIC_CHAT_URL'] ?? DEFAULT_CHAT_URL;

export const KBVE_CHAT_GAME = 'cryptothrone';

export const KBVE_LEGAL_LINKS = [
	{ label: 'Terms of Service', url: 'https://kbve.com/legal/tos' },
	{ label: 'EULA', url: 'https://kbve.com/legal/eula' },
	{ label: 'Legal', url: 'https://kbve.com/legal/' },
	{ label: 'Privacy', url: 'https://kbve.com/legal/privacy' },
] as const;
