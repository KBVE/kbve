import { map } from 'nanostores';

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

export const $auth = map<AuthState>({ ...DEFAULT_AUTH });

export function setAuth(state: Partial<AuthState>) {
	const current = $auth.get();
	$auth.set({ ...current, ...state });
}

export function resetAuth() {
	$auth.set({ ...DEFAULT_AUTH, tone: 'anon', flags: AuthPresets.GUEST });
}
