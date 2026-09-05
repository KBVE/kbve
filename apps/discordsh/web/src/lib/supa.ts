import { AuthBridge, SupabaseGateway, bootAuth } from '@kbve/astro';

export const SUPABASE_URL = 'https://supabase.kbve.com';
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';

export const authBridge = new AuthBridge(SUPABASE_URL, SUPABASE_ANON_KEY);

let _gateway: SupabaseGateway | null = null;
let _initPromise: Promise<void> | null = null;

export function initSupa(): Promise<void> {
	if (_initPromise) return _initPromise;

	_gateway = new SupabaseGateway();
	_initPromise = _gateway
		.init(SUPABASE_URL, SUPABASE_ANON_KEY)
		.then(() => bootAuth(_gateway!))
		.catch((e) => {
			_initPromise = null;
			throw e;
		});

	return _initPromise;
}

export function getSupa(): SupabaseGateway {
	if (!_gateway) throw new Error('Call initSupa() first');
	return _gateway;
}
