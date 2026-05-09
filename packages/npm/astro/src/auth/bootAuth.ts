import {
	$auth,
	DroidEvents,
	AuthPresets,
	type SupabaseGateway,
} from '@kbve/droid';
import type { AuthBridge } from './AuthBridge';
import { writeAuthHint, clearAuthHint } from './authHint';

let _booted = false;
let _healthInterval: ReturnType<typeof setInterval> | null = null;
const HEALTH_CHECK_MS = 5 * 60 * 1000;

function isSessionExpired(session: any): boolean {
	if (!session?.expires_at) return false;
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
		clearAuthHint();
		return;
	}
	const u = session.user;
	const currentUsername = $auth.get().username;
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
	writeAuthHint(session);
}

export async function bootAuth(
	gateway: SupabaseGateway,
	bridge?: AuthBridge,
): Promise<void> {
	if (_booted) return;
	_booted = true;

	try {
		const strategy = gateway.getStrategyType();

		if (strategy === 'direct' && bridge) {
			try {
				const bridgeSession = await bridge.getSession();
				if (bridgeSession?.user && !isSessionExpired(bridgeSession)) {
					pushSession(bridgeSession);
				}
			} catch {}
		}

		if ($auth.get().tone !== 'auth') {
			let s = await gateway.getSession().catch(() => null);

			if (s?.session && isSessionExpired(s.session)) {
				console.log('[bootAuth] Session expired, forcing refresh');
				s = await gateway.getSession().catch(() => null);
			}

			pushSession(s?.session ?? null);
		}

		if ($auth.get().tone !== 'auth' && bridge && strategy !== 'direct') {
			try {
				const bridgeSession = await bridge.getSession();
				if (bridgeSession?.user && !isSessionExpired(bridgeSession)) {
					pushSession(bridgeSession);
				}
			} catch {}
		}

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
			} catch {}
		}, HEALTH_CHECK_MS);

		const state = $auth.get();
		DroidEvents.emit('auth-ready', {
			timestamp: Date.now(),
			tone: state.tone === 'auth' ? 'auth' : 'anon',
			name: state.name || undefined,
		});
	} catch (e: any) {
		const message = e?.message ?? 'Failed to initialize auth';
		console.warn('[bootAuth] Auth failed, falling back to guest:', message);
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
		if (typeof permissions === 'number' && permissions > 0) {
			console.log(
				'[resolveStaffFlag] Staff permissions resolved:',
				permissions,
			);
			$auth.set({
				...state,
				flags: AuthPresets.STAFF,
			});
			writeAuthHint(session);
		}
	} catch {}
}
