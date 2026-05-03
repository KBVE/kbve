// src/lib/supa.ts
// Unified Supabase gateway — powered by @kbve/droid
import { SupabaseGateway } from '@kbve/droid';
import { bootAuth, resolveStaffFlag } from '@kbve/astro';
import { migrateAuthStorage } from './storage-migration';

// Vite ?worker&url imports — resolves to hashed URLs at build time
import SharedWorkerUrl from '../workers/supabase.shared?worker&url';
import DbWorkerUrl from '../workers/supabase.db?worker&url';

let _gateway: SupabaseGateway | null = null;
let _initPromise: Promise<void> | null = null;

export const SUPABASE_URL = 'https://supabase.kbve.com';
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';

const INIT_TIMEOUT_MS = 12_000;
const AUTO_RECOVER_FLAG = 'kbve_supa_auto_recovered';

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

/**
 * One-shot recovery for the "previous deploy left a stale worker /
 * cached chunk pointing at hashed URLs that no longer exist on the
 * CDN" scenario. We see this most often as a 30s
 * `Worker N request init timed out` from droid's WorkerPool — the
 * page bundle was loaded from cache but its embedded worker URL no
 * longer resolves.
 *
 * Guarded by a sessionStorage flag so a genuinely-broken upstream
 * (Supabase down, network down) can't loop the user.
 */
async function autoRecoverStaleClient(): Promise<void> {
	if (typeof window === 'undefined') return;
	if (sessionStorage.getItem(AUTO_RECOVER_FLAG) === '1') return;
	sessionStorage.setItem(AUTO_RECOVER_FLAG, '1');

	console.warn(
		'[Supabase] init timed out — clearing caches + reloading once.',
	);
	try {
		if ('caches' in window) {
			const keys = await caches.keys();
			await Promise.all(keys.map((k) => caches.delete(k)));
		}
		if ('serviceWorker' in navigator) {
			const regs = await navigator.serviceWorker.getRegistrations();
			await Promise.all(regs.map((r) => r.unregister()));
		}
	} catch (err) {
		console.warn('[Supabase] cache clear failed (continuing):', err);
	}
	window.location.reload();
}

/** Call once early (e.g. in a provider) or on-demand anywhere */
export function initSupa(options?: Record<string, unknown>): Promise<void> {
	if (_initPromise) return _initPromise;

	const gateway = ensureClient();
	_initPromise = (async () => {
		await migrateAuthStorage();
		console.log(`[Supabase] Using ${gateway.getStrategyDescription()}`);

		const init = (async () => {
			await gateway.init(SUPABASE_URL, SUPABASE_ANON_KEY, options);
			await bootAuth(gateway);
			await resolveStaffFlag(gateway, SUPABASE_URL, SUPABASE_ANON_KEY);
		})();

		const timeout = new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error('init timeout')),
				INIT_TIMEOUT_MS,
			),
		);

		try {
			await Promise.race([init, timeout]);
		} catch (err) {
			void autoRecoverStaleClient();
			throw err;
		}
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
