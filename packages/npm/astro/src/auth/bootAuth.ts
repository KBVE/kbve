import {
	$auth,
	DroidEvents,
	AuthPresets,
	applyStaffFlagFromCache,
	setStaffPermsCache,
	type SupabaseGateway,
} from '@kbve/droid';
import type { AuthBridge } from './AuthBridge';
import { registerSupabaseGateway } from './registry';

let _booted = false;
let _healthInterval: ReturnType<typeof setInterval> | null = null;
const HEALTH_CHECK_MS = 5 * 60 * 1000; // 5 minutes

/** Check whether a session's access token has expired (with 30s buffer). */
function isSessionExpired(session: any): boolean {
	if (!session?.expires_at) return false;
	// expires_at is a Unix timestamp in seconds
	const expiresMs = session.expires_at * 1000;
	const bufferMs = 30_000;
	return Date.now() >= expiresMs - bufferMs;
}

function pushSession(session: any) {
	if (!session?.user) {
		$auth.set({
			tone: 'anon',
			flags: AuthPresets.GUEST,
			name: '',
			username: undefined,
			avatar: undefined,
			id: '',
			error: undefined,
		});
		return;
	}
	const u = session.user;
	// Preserve existing username if already set (profile fetch fills it later)
	const currentUsername = $auth.get().username;
	// Preserve existing flags if already upgraded (e.g. staff resolved)
	const currentFlags = $auth.get().flags;
	$auth.set({
		tone: 'auth',
		flags:
			currentFlags > AuthPresets.USER ? currentFlags : AuthPresets.USER,
		name:
			u.user_metadata?.full_name ||
			u.user_metadata?.name ||
			u.email?.split('@')[0] ||
			'User',
		username: currentUsername,
		avatar:
			u.user_metadata?.avatar_url ||
			u.user_metadata?.picture ||
			undefined,
		id: u.id ?? '',
		error: undefined,
	});
}

/**
 * Boot the auth state from the gateway, then optionally fall back to
 * an AuthBridge's IndexedDB session if the gateway (localStorage) had
 * no session. This bridges the storage mismatch between the two clients
 * so any app using both gets seamless OAuth session propagation.
 */
export async function bootAuth(
	gateway: SupabaseGateway,
	bridge?: AuthBridge,
): Promise<void> {
	registerSupabaseGateway(gateway);
	if (_booted) return;
	_booted = true;

	try {
		// Race the bridge IDB read against the worker-backed gateway. The
		// bridge resolves in ~ms once IndexedDB opens; the SharedWorker can
		// take several seconds to spin up its WebSocket + DB pool. Painting
		// the UI from the first valid fast-path lets the nav flip to
		// "signed in" immediately, then the slow path confirms (or
		// corrects, if the gateway sees a sign-out from another tab).
		// Direct strategy never spins up a worker, so the two paths converge.
		const bridgeFastPath: Promise<any> = bridge
			? bridge
					.getSession()
					.catch(() => null)
					.then((s: any) =>
						s?.user && !isSessionExpired(s) ? s : null,
					)
			: Promise.resolve(null);

		const gatewaySlowPath: Promise<any> = gateway
			.getSession()
			.catch(() => null)
			.then(async (s: any) => {
				if (s?.session && isSessionExpired(s.session)) {
					console.log('[bootAuth] Session expired, forcing refresh');
					const retry = await gateway.getSession().catch(() => null);
					return retry?.session ?? null;
				}
				return s?.session ?? null;
			});

		const fastSession = await bridgeFastPath;
		if (fastSession) {
			pushSession(fastSession);
		}

		const slowSession = await gatewaySlowPath;
		if (slowSession) {
			// Gateway is authoritative; if it agrees with fast paint
			// pushSession is a no-op, if it disagrees this corrects.
			pushSession(slowSession);
		} else if (!fastSession) {
			// Neither path found a session — only push anon if nobody
			// already painted auth. Avoids flickering a signed-in user
			// back to anon when the gateway is slow to hydrate.
			pushSession(null);
		}

		// Suspenders: reactive listener also validates expiry before pushing
		gateway.on('auth', (msg: any) => {
			const sess = msg.session ?? null;
			if (sess && isSessionExpired(sess)) {
				console.log(
					'[bootAuth] Received expired session from gateway, ignoring',
				);
				return;
			}
			pushSession(sess);
		});

		// Periodic health check: if the session silently expired (autoRefreshToken
		// failed, tab was dormant, network was offline), reset to anon so the UI
		// doesn't show stale authenticated state with broken API calls.
		if (_healthInterval) clearInterval(_healthInterval);
		_healthInterval = setInterval(async () => {
			if ($auth.get().tone !== 'auth') return;
			try {
				const check = await gateway.getSession().catch(() => null);
				if (!check?.session || isSessionExpired(check.session)) {
					console.log(
						'[bootAuth] Health check: session expired, resetting to anon',
					);
					pushSession(null);
				}
			} catch {
				// Health check failure is non-fatal — try again next interval
			}
		}, HEALTH_CHECK_MS);

		// Emit auth-ready event so consumers (e.g. navbar) can react
		const state = $auth.get();
		DroidEvents.emit('auth-ready', {
			timestamp: Date.now(),
			tone: state.tone === 'auth' ? 'auth' : 'anon',
			name: state.name || undefined,
		});
	} catch (e: any) {
		const message = e?.message ?? 'Failed to initialize auth';
		console.warn('[bootAuth] Auth failed, falling back to guest:', message);
		// Reset to anonymous — auth errors should never leave the user stuck.
		// The UI shows the guest experience; user can retry sign-in manually.
		$auth.set({
			tone: 'anon',
			flags: AuthPresets.GUEST,
			name: '',
			username: undefined,
			avatar: undefined,
			id: '',
			error: undefined,
		});
		DroidEvents.emit('auth-error', {
			timestamp: Date.now(),
			message,
		});
	}
}

const STAFF_TOKEN_ATTEMPTS = 6;
const STAFF_TOKEN_DELAY_MS = 300;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Poll the gateway for an access token. resolveStaffFlag is fired
 * fire-and-forget right after bootAuth, so on a cold load the
 * worker-backed session may not be hydrated yet. Retry a few times
 * instead of giving up on the first empty read.
 */
async function waitForAccessToken(
	gateway: SupabaseGateway,
): Promise<string | null> {
	for (let attempt = 0; attempt < STAFF_TOKEN_ATTEMPTS; attempt++) {
		const session = await gateway.getSession().catch(() => null);
		const token = session?.session?.access_token;
		if (token) return token;
		if (attempt < STAFF_TOKEN_ATTEMPTS - 1) {
			await sleep(STAFF_TOKEN_DELAY_MS);
		}
	}
	return null;
}

/**
 * Resolve staff permissions for the current authenticated user.
 * Calls the Supabase RPC `staff_permissions` and upgrades auth flags
 * to include STAFF if the user has any permissions.
 *
 * Call this after bootAuth completes and the user is authenticated.
 * Safe to call for non-staff users — they stay at USER flags.
 */
export async function resolveStaffFlag(
	gateway: SupabaseGateway,
	supabaseUrl: string,
	supabaseAnonKey: string,
): Promise<void> {
	const state = $auth.get();
	if (state.tone !== 'auth' || !state.id) return;
	const userId = state.id;

	// Cache fast path — apply STAFF synchronously if the bitmask is
	// still fresh, so the UI doesn't flicker while the RPC is in flight.
	applyStaffFlagFromCache(userId);

	try {
		const token = await waitForAccessToken(gateway);
		if (!token) {
			console.warn('[resolveStaffFlag] No access token available');
			return;
		}

		const res = await fetch(
			`${supabaseUrl}/rest/v1/rpc/staff_permissions`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${token}`,
					'Content-Type': 'application/json',
					apikey: supabaseAnonKey,
				},
				body: '{}',
			},
		);

		if (!res.ok) {
			console.warn('[resolveStaffFlag] RPC failed:', res.status);
			return;
		}

		const permissions = await res.json();
		// staff_permissions returns an integer bitmask; any non-zero value means staff
		if (typeof permissions === 'number') {
			setStaffPermsCache(userId, permissions);
			if (permissions > 0) {
				console.log(
					'[resolveStaffFlag] Staff permissions resolved:',
					permissions,
				);
				// Re-read $auth after the await — the pre-fetch snapshot is
				// stale and may clobber concurrent auth updates. Only upgrade
				// if the same user is still authenticated.
				const current = $auth.get();
				if (current.tone === 'auth' && current.id === userId) {
					$auth.set({
						...current,
						flags: AuthPresets.STAFF,
					});
				}
			}
		}
	} catch {
		// Staff check failure is non-fatal — user stays at USER flags
	}
}
