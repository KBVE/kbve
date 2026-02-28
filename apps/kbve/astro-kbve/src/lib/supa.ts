// src/lib/supa.ts
// Unified Supabase gateway with automatic strategy selection
import { SupabaseGateway } from './gateway/SupabaseGateway';
import { migrateAuthStorage } from './storage-migration';

let _gateway: SupabaseGateway | null = null;
let _initPromise: Promise<void> | null = null;

export const SUPABASE_URL = 'https://supabase.kbve.com';
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';

function ensureClient(): SupabaseGateway {
	if (typeof window === 'undefined') {
		throw new Error('Supabase is client-only');
	}
	if (!_gateway) _gateway = new SupabaseGateway();
	return _gateway;
}

/** Call once early (e.g. in a provider) or on-demand anywhere */
export function initSupa(options?: any): Promise<void> {
	if (_initPromise) return _initPromise;

	const gateway = ensureClient();
	_initPromise = (async () => {
		// Run migration before initializing Supabase
		await migrateAuthStorage();

		// Log selected strategy
		console.log(`[Supabase] Using ${gateway.getStrategyDescription()}`);

		// Now initialize Supabase with the new storage
		await gateway.init(SUPABASE_URL, SUPABASE_ANON_KEY, options);
	})()
		.then(() => {})
		.catch((e) => {
			_initPromise = null;
			throw e;
		});

	return _initPromise;
}

/** Get the gateway instance (make sure you called initSupa() somewhere first) */
export function getSupa(): SupabaseGateway {
	return ensureClient();
}
