import { $auth, DroidEvents, type SupabaseGateway } from '@kbve/droid';
import type { AuthBridge } from './AuthBridge';

let _booted = false;

function pushSession(session: any) {
	if (!session?.user) {
		$auth.set({
			tone: 'anon',
			name: '',
			avatar: undefined,
			id: '',
			error: undefined,
		});
		return;
	}
	const u = session.user;
	$auth.set({
		tone: 'auth',
		name:
			u.user_metadata?.full_name ||
			u.user_metadata?.name ||
			u.email?.split('@')[0] ||
			'User',
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
		const s = await gateway.getSession().catch(() => null);
		pushSession(s?.session ?? null);

		// If the gateway found no session but an AuthBridge is provided,
		// check its IDB storage as a fallback (OAuth sessions land there).
		if ($auth.get().tone !== 'auth' && bridge) {
			try {
				const bridgeSession = await bridge.getSession();
				if (bridgeSession?.user) {
					pushSession(bridgeSession);
				}
			} catch {
				// Bridge has no session either — stay anonymous
			}
		}

		gateway.on('auth', (msg: any) => pushSession(msg.session ?? null));

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
			name: '',
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
