import {
	$auth,
	DroidEvents,
	AuthPresets,
	type SupabaseGateway,
} from '@kbve/droid';
import type { AuthBridge } from './AuthBridge';

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
	if (_booted) return;
	_booted = true;

	try {
		const strategy = gateway.getStrategyType();

		// For direct strategy (no worker), the bridge IS the primary client.
		// Check bridge first since there's no worker to propagate to.
		if (strategy === 'direct' && bridge) {
			try {
				const bridgeSession = await bridge.getSession();
				if (bridgeSession?.user && !isSessionExpired(bridgeSession)) {
					pushSession(bridgeSession);
				}
			} catch {
				// Bridge has no session — fall through to gateway
			}
		}

		// Gateway session check (worker-backed for shared/web strategies)
		if ($auth.get().tone !== 'auth') {
			let s = await gateway.getSession().catch(() => null);

			// Belt: if the session is expired, force a refresh before trusting it.
			// Supabase's autoRefreshToken handles background refresh, but if the
			// tab was dormant the token may be stale by the time bootAuth runs.
			if (s?.session && isSessionExpired(s.session)) {
				console.log('[bootAuth] Session expired, forcing refresh');
				s = await gateway.getSession().catch(() => null);
			}

			pushSession(s?.session ?? null);
		}

		// For worker strategies, check bridge as fallback (OAuth sessions land there).
		if ($auth.get().tone !== 'auth' && bridge && strategy !== 'direct') {
			try {
				const bridgeSession = await bridge.getSession();
				if (bridgeSession?.user && !isSessionExpired(bridgeSession)) {
					pushSession(bridgeSession);
				}
			} catch {
				// Bridge has no session either — stay anonymous
			}
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

	try {
		const session = await gateway.getSession().catch(() => null);
		const token = session?.session?.access_token;
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
		if (typeof permissions === 'number' && permissions > 0) {
			console.log(
				'[resolveStaffFlag] Staff permissions resolved:',
				permissions,
			);
			$auth.set({
				...state,
				flags: AuthPresets.STAFF,
			});
		}
	} catch {
		// Staff check failure is non-fatal — user stays at USER flags
	}
}
