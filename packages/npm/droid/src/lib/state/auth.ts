import { map, computed } from 'nanostores';

export type AuthTone = 'loading' | 'auth' | 'anon' | 'error';

// ---------------------------------------------------------------------------
// Bitwise auth flags — composable visibility for UI elements.
//
// A guest has:  PUBLIC | ANON       = 0b0011 (3)
// A user has:   PUBLIC | AUTH       = 0b0101 (5)
// Staff has:    PUBLIC | AUTH | STAFF = 0b1101 (13)
//
// To check: (userFlags & requiredFlag) === requiredFlag
// ---------------------------------------------------------------------------
export const AuthFlags = {
	NONE: 0b0000,
	PUBLIC: 0b0001,
	ANON: 0b0010,
	AUTH: 0b0100,
	STAFF: 0b1000,
} as const;

export type AuthFlag = (typeof AuthFlags)[keyof typeof AuthFlags];

/** Convenience presets for common flag combinations. */
export const AuthPresets = {
	GUEST: AuthFlags.PUBLIC | AuthFlags.ANON,
	USER: AuthFlags.PUBLIC | AuthFlags.AUTH,
	STAFF: AuthFlags.PUBLIC | AuthFlags.AUTH | AuthFlags.STAFF,
	LOADING: AuthFlags.NONE,
} as const;

/** Check if a user's flags satisfy a required flag bitmask. */
export function hasAuthFlag(userFlags: number, required: number): boolean {
	return (userFlags & required) === required;
}

export interface AuthState {
	tone: AuthTone;
	flags: number;
	name: string;
	username: string | undefined;
	avatar: string | undefined;
	id: string;
	error: string | undefined;
}

const DEFAULT_AUTH: AuthState = {
	tone: 'loading',
	flags: AuthPresets.LOADING,
	name: '',
	username: undefined,
	avatar: undefined,
	id: '',
	error: undefined,
};

const SB_AUTH_TOKEN_KEY = 'sb-auth-token';
const PROFILE_CACHE_KEY = 'cache:profile:me';
const STAFF_CACHE_KEY = 'cache:staff:perms';

function seedAuthFromStorage(): AuthState {
	if (typeof localStorage === 'undefined') return { ...DEFAULT_AUTH };

	let session: {
		user?: { id?: string; user_metadata?: Record<string, unknown> };
	} | null = null;
	try {
		const raw = localStorage.getItem(SB_AUTH_TOKEN_KEY);
		if (!raw) return { ...DEFAULT_AUTH };
		const parsed = JSON.parse(raw);
		const inner = parsed?.currentSession ?? parsed;
		if (inner?.user?.id) session = inner;
	} catch {
		return { ...DEFAULT_AUTH };
	}
	if (!session?.user?.id) return { ...DEFAULT_AUTH };

	const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
	let username: string | undefined;
	let avatar: string | undefined =
		typeof meta['avatar_url'] === 'string'
			? (meta['avatar_url'] as string)
			: undefined;

	try {
		const raw = localStorage.getItem(PROFILE_CACHE_KEY);
		if (raw && raw !== 'null') {
			const env = JSON.parse(raw);
			if (env?.user_id === session.user.id) {
				const profile = env.profile ?? {};
				if (typeof profile.username === 'string')
					username = profile.username;
				avatar =
					profile.discord?.avatar_url ||
					profile.github?.avatar_url ||
					profile.twitch?.avatar_url ||
					avatar;
			}
		}
	} catch {
		/* best effort */
	}

	let flags: number = AuthPresets.USER;
	try {
		const raw = localStorage.getItem(STAFF_CACHE_KEY);
		if (raw && raw !== 'null') {
			const env = JSON.parse(raw);
			if (
				env?.user_id === session.user.id &&
				typeof env?.bitmask === 'number' &&
				env.bitmask > 0
			) {
				flags = AuthPresets.STAFF;
			}
		}
	} catch {
		/* best effort */
	}

	return {
		tone: 'auth',
		flags,
		name:
			typeof meta['full_name'] === 'string'
				? (meta['full_name'] as string)
				: '',
		username,
		avatar,
		id: session.user.id,
		error: undefined,
	};
}

export const $auth = map<AuthState>(seedAuthFromStorage());

export const $isStaff = computed($auth, (s) =>
	hasAuthFlag(s.flags, AuthFlags.STAFF),
);

export function setAuth(state: Partial<AuthState>) {
	const current = $auth.get();
	$auth.set({ ...current, ...state });
}

export function resetAuth() {
	$auth.set({ ...DEFAULT_AUTH, tone: 'anon', flags: AuthPresets.GUEST });
}
