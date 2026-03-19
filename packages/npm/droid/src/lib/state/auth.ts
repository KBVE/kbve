import { map } from 'nanostores';

export type AuthTone = 'loading' | 'auth' | 'anon' | 'error';

export interface AuthState {
	tone: AuthTone;
	name: string;
	username: string | undefined;
	avatar: string | undefined;
	id: string;
	error: string | undefined;
}

const DEFAULT_AUTH: AuthState = {
	tone: 'loading',
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
	$auth.set({ ...DEFAULT_AUTH, tone: 'anon' });
}
