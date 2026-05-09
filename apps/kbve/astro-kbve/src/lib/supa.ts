import { SupabaseGateway } from '@kbve/droid';
import { bootAuth, resolveStaffFlag, bootAuthHint } from '@kbve/astro';
import { migrateAuthStorage } from './storage-migration';

import SharedWorkerUrl from '../workers/supabase.shared?worker&url';
import DbWorkerUrl from '../workers/supabase.db?worker&url';

let _gateway: SupabaseGateway | null = null;
let _initPromise: Promise<void> | null = null;

export const SUPABASE_URL = 'https://supabase.kbve.com';
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';

const INIT_TIMEOUT_MS = 10_000;
const AUTO_RECOVER_STAMP = 'kbve_supa_auto_recovered_at';
const AUTO_RECOVER_COOLDOWN_MS = 60_000;

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

async function autoRecoverStaleClient(): Promise<void> {
	if (typeof window === 'undefined') return;

	const now = Date.now();
	let last = 0;
	try {
		const raw = localStorage.getItem(AUTO_RECOVER_STAMP);
		if (raw) last = Number.parseInt(raw, 10) || 0;
	} catch {}

	if (now - last < AUTO_RECOVER_COOLDOWN_MS) {
		console.warn('[Supabase] init timed out, recovery throttled.');
		return;
	}

	console.warn('[Supabase] init timed out — clearing caches + reloading.');

	try {
		localStorage.setItem(AUTO_RECOVER_STAMP, String(now));
	} catch {}

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

export function initSupa(options?: Record<string, unknown>): Promise<void> {
	if (_initPromise) return _initPromise;

	bootAuthHint();

	const gateway = ensureClient();
	_initPromise = (async () => {
		await migrateAuthStorage();
		console.log(`[Supabase] Using ${gateway.getStrategyDescription()}`);

		const init = (async () => {
			await gateway.init(SUPABASE_URL, SUPABASE_ANON_KEY, options);
			await bootAuth(gateway);
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

		void resolveStaffFlag(gateway, SUPABASE_URL, SUPABASE_ANON_KEY);
	})()
		.then(() => {})
		.catch((e) => {
			_initPromise = null;
			throw e;
		});

	return _initPromise;
}

export function getSupa(): SupabaseGateway {
	return ensureClient();
}
