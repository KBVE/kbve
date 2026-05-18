import { atom, computed } from 'nanostores';

export type AuthState = 'loading' | 'auth' | 'anon' | 'no-username';

export const $authState = atom<AuthState>('loading');
export const $authToken = atom<string>('');
export const $avatarUrl = atom<string>('');

// Readiness signals — two independent gates so each consumer can wait on
// what it needs:
//   $swReady  — droid SharedWorker booted, window.kbve.ws callable
//   $idbReady — AuthBridge IDB storage proven readable
//   $bootReady — both true; gates WS connect + sign-in actions
export const $swReady = atom<boolean>(false);
export const $idbReady = atom<boolean>(false);
export const $bootError = atom<string>('');
export const $bootReady = computed(
	[$swReady, $idbReady],
	(sw, idb) => sw && idb,
);

export type OAuthProvider = 'github' | 'discord' | 'twitch';

export const PROVIDERS: { id: OAuthProvider; label: string }[] = [
	{ id: 'github', label: 'GitHub' },
	{ id: 'discord', label: 'Discord' },
	{ id: 'twitch', label: 'Twitch' },
];

export const USERNAME_SETUP_URL = 'https://kbve.com/askama/profile';

export const KBVE_API_BASE = 'https://kbve.com';

export function decodeJwtUsername(token: string): string | null {
	const parts = token.split('.');
	if (parts.length < 2) return null;
	try {
		const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
		const padLen = padded.length + ((4 - (padded.length % 4)) % 4);
		const payload = JSON.parse(atob(padded.padEnd(padLen, '=')));
		const value = payload?.kbve_username;
		return typeof value === 'string' && value.trim().length > 0
			? value
			: null;
	} catch {
		return null;
	}
}

let booted = false;
let booting: Promise<void> | null = null;

export async function bootAuth(): Promise<void> {
	if (booted) return;
	if (booting) return booting;

	booting = (async () => {
		try {
			const { bootChat } = await import('../../lib/boot');

			// Phase 1: SharedWorker + Supabase gateway init.
			// bootChat parallel-awaits droid() + initSupa() and only
			// resolves when window.kbve.ws is attached and the supa
			// gateway is registered. Setting $swReady AFTER this gives
			// consumers a hard signal that the WS bridge is callable.
			await bootChat();
			$swReady.set(true);

			const applyToken = (next: string) => {
				$authToken.set(next);
				$authState.set(
					decodeJwtUsername(next) ? 'auth' : 'no-username',
				);
			};

			// Phase 2: IDB-backed session read. If this resolves at all
			// (session or null), IDB is proven reachable — flip $idbReady
			// so AuthOverlay sign-in actions can fire safely.
			const { authBridge } = await import('../../lib/supa');
			const session = await authBridge.getSession();
			$idbReady.set(true);
			if (session?.access_token) {
				const meta = session.user?.user_metadata ?? {};
				const avatar =
					meta.avatar_url ||
					meta.picture ||
					meta.profile_image_url ||
					'';
				if (avatar) $avatarUrl.set(avatar);
				applyToken(session.access_token);
				booted = true;
				return;
			}

			const { getSharedToken } = await import('@kbve/astro');
			const sharedToken = getSharedToken();
			if (sharedToken) {
				applyToken(sharedToken);
				booted = true;
				return;
			}

			$authState.set('anon');
			booted = true;
		} catch (err: any) {
			console.error('[chat] Boot failed:', err);
			$bootError.set(err?.message ?? String(err));
			$authState.set('anon');
			booted = true;
		} finally {
			booting = null;
		}
	})();

	return booting;
}

export async function refreshAuth(): Promise<AuthState> {
	try {
		const { authBridge } = await import('../../lib/supa');
		const session = await authBridge.refreshSession();
		if (!session?.access_token) {
			const { getSharedToken } = await import('@kbve/astro');
			const sharedToken = getSharedToken();
			if (sharedToken) {
				$authToken.set(sharedToken);
				const state = decodeJwtUsername(sharedToken)
					? 'auth'
					: 'no-username';
				$authState.set(state);
				return state;
			}
			$authState.set('anon');
			return 'anon';
		}
		const meta = session.user?.user_metadata ?? {};
		const avatar =
			meta.avatar_url || meta.picture || meta.profile_image_url || '';
		if (avatar) $avatarUrl.set(avatar);
		$authToken.set(session.access_token);
		const state = decodeJwtUsername(session.access_token)
			? 'auth'
			: 'no-username';
		$authState.set(state);
		return state;
	} catch (err: any) {
		console.error('[chat] refreshAuth failed:', err);
		return $authState.get();
	}
}

export async function setUsername(
	username: string,
	token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const trimmed = username.trim().toLowerCase();
	try {
		const res = await fetch(`${KBVE_API_BASE}/api/v1/profile/username`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`,
			},
			body: JSON.stringify({ username: trimmed }),
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			return {
				ok: false,
				error: body?.message || body?.error || `HTTP ${res.status}`,
			};
		}
		return { ok: true };
	} catch (err: any) {
		return {
			ok: false,
			error: err?.message ?? 'Network error',
		};
	}
}
