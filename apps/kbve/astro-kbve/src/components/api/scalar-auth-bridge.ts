import { initSupa, getSupa } from '@/lib/supa';

type ScalarInstance = {
	updateConfiguration?: (cfg: Record<string, unknown>) => void;
};

declare global {
	interface Window {
		__scalarRef?: ScalarInstance;
		__scalarBaseConfig?: Record<string, unknown>;
	}
}

const BEARER_SCHEME = 'bearerAuth';

function withAuth(
	base: Record<string, unknown>,
	token: string | null | undefined,
): Record<string, unknown> {
	if (!token) return base;
	return {
		...base,
		authentication: {
			preferredSecurityScheme: BEARER_SCHEME,
			securitySchemes: {
				[BEARER_SCHEME]: { token },
			},
		},
	};
}

let latestToken: string | null = null;
let supaInitialized = false;

function applyToCurrent(): void {
	const instance = window.__scalarRef;
	const base = window.__scalarBaseConfig;
	if (!instance?.updateConfiguration || !base) return;
	instance.updateConfiguration(withAuth(base, latestToken));
}

/**
 * Sync the latest Supabase token onto the live Scalar instance. Idempotent —
 * the first call wires the Supabase listener once; every subsequent call
 * (one per client-router mount) just re-applies the cached token to whatever
 * `window.__scalarRef` is currently bound to.
 */
export async function attachScalarAuthBridge(): Promise<void> {
	applyToCurrent();
	if (supaInitialized) return;
	supaInitialized = true;
	try {
		await initSupa();
		const supa = getSupa();
		const result = await supa.getSession().catch(() => null);
		latestToken = result?.session?.access_token ?? null;
		applyToCurrent();
		supa.on('auth', (payload: unknown) => {
			const msg = payload as
				| { session?: { access_token?: string } }
				| undefined;
			latestToken = msg?.session?.access_token ?? null;
			applyToCurrent();
		});
	} catch (e) {
		// Reset so a later mount can retry once supa starts answering.
		supaInitialized = false;
		console.warn('Scalar auth bridge skipped:', e);
	}
}
