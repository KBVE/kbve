import { $auth, AuthPresets } from '@kbve/droid';

const HINT_KEY = 'kbve_auth_hint_v1';

interface AuthHint {
	id: string;
	name: string;
	username?: string;
	avatar?: string;
	exp: number;
	flags: number;
}

export function writeAuthHint(session: any): void {
	if (typeof localStorage === 'undefined') return;
	if (!session?.user || !session?.expires_at) return;
	const u = session.user;
	const state = $auth.get();
	const hint: AuthHint = {
		id: u.id ?? '',
		name:
			u.user_metadata?.full_name ||
			u.user_metadata?.name ||
			u.email?.split('@')[0] ||
			'User',
		username: state.username,
		avatar:
			u.user_metadata?.avatar_url ||
			u.user_metadata?.picture ||
			undefined,
		exp: session.expires_at,
		flags: state.flags > AuthPresets.USER ? state.flags : AuthPresets.USER,
	};
	try {
		localStorage.setItem(HINT_KEY, JSON.stringify(hint));
	} catch {}
}

export function clearAuthHint(): void {
	if (typeof localStorage === 'undefined') return;
	try {
		localStorage.removeItem(HINT_KEY);
	} catch {}
}

export function readAuthHint(): AuthHint | null {
	if (typeof localStorage === 'undefined') return null;
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(HINT_KEY);
	} catch {
		return null;
	}
	if (!raw) return null;
	let hint: AuthHint;
	try {
		hint = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!hint?.id || typeof hint.exp !== 'number') return null;
	const expiresMs = hint.exp * 1000;
	if (Date.now() >= expiresMs - 30_000) return null;
	return hint;
}

export function bootAuthHint(): boolean {
	const hint = readAuthHint();
	if (!hint) return false;
	if ($auth.get().tone === 'auth') return true;
	$auth.set({
		tone: 'auth',
		flags: hint.flags,
		name: hint.name,
		username: hint.username,
		avatar: hint.avatar,
		id: hint.id,
		error: undefined,
	});
	return true;
}
