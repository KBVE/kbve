// src/lib/supa.ts
// Unified Supabase gateway — powered by @kbve/droid
import { SupabaseGateway } from '@kbve/droid';
import { bootAuth } from '@kbve/astro';
import { migrateAuthStorage } from './storage-migration';

// Vite ?worker&url imports — resolves to hashed URLs at build time
import SharedWorkerUrl from '../workers/supabase.shared?worker&url';
import DbWorkerUrl from '../workers/supabase.db?worker&url';

let _gateway: SupabaseGateway | null = null;
let _initPromise: Promise<void> | null = null;

export const SUPABASE_URL = 'https://supabase.kbve.com';
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';

function ensureClient(): SupabaseGateway {
	if (typeof window === 'undefined') {
		throw new Error('Supabase is client-only');
	}
	if (!_gateway) {
		_gateway = new SupabaseGateway({
			workerUrls: {
				sharedWorker: SharedWorkerUrl,
				dbWorker: DbWorkerUrl,
			},
		});
	}
	return _gateway;
}

/** Call once early (e.g. in a provider) or on-demand anywhere */
export function initSupa(options?: Record<string, unknown>): Promise<void> {
	if (_initPromise) return _initPromise;

	const gateway = ensureClient();
	_initPromise = (async () => {
		// Run migration before initializing Supabase
		await migrateAuthStorage();

		// Log selected strategy
		console.log(`[Supabase] Using ${gateway.getStrategyDescription()}`);

		// Initialize Supabase with the new storage
		await gateway.init(SUPABASE_URL, SUPABASE_ANON_KEY, options);

		// Populate droid's $auth nanostore for reactive auth state
		await bootAuth(gateway);
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
