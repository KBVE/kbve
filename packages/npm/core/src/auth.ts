import { Store } from './store';
import type { Core, UpdateResult } from './store';

export type OAuthProvider = 'discord' | 'github' | 'twitch';

export type AuthStatus =
	| 'loading'
	| 'signed_out'
	| 'authenticating'
	| 'signed_in'
	| 'error';

export interface AuthUser {
	id: string;
	email: string | null;
	username: string | null;
}

export interface AuthSession {
	accessToken: string;
	refreshToken: string;
	expiresAt: number | null;
	user: AuthUser;
}

export interface AuthState {
	status: AuthStatus;
	user: AuthUser | null;
	session: AuthSession | null;
	error: string | null;
}

export const initialAuthState: AuthState = {
	status: 'loading',
	user: null,
	session: null,
	error: null,
};

export type AuthEvent =
	| { type: 'restore' }
	| { type: 'restored'; session: AuthSession | null }
	| {
			type: 'sign_in_password';
			email: string;
			password: string;
			captchaToken: string;
	  }
	| { type: 'sign_up'; email: string; password: string; captchaToken: string }
	| { type: 'sign_in_oauth'; provider: OAuthProvider }
	| { type: 'sign_out' }
	| { type: 'session_changed'; session: AuthSession | null }
	| { type: 'auth_error'; message: string };

export type AuthEffect =
	| { type: 'supabase.restore' }
	| {
			type: 'supabase.sign_in_password';
			email: string;
			password: string;
			captchaToken: string;
	  }
	| {
			type: 'supabase.sign_up';
			email: string;
			password: string;
			captchaToken: string;
	  }
	| { type: 'supabase.sign_in_oauth'; provider: OAuthProvider }
	| { type: 'supabase.sign_out' };

export interface AuthViewModel {
	status: AuthStatus;
	loading: boolean;
	signedIn: boolean;
	user: AuthUser | null;
	username: string | null;
	error: string | null;
}

function signedIn(session: AuthSession): AuthState {
	return { status: 'signed_in', user: session.user, session, error: null };
}

function reduce(
	state: AuthState,
	event: AuthEvent,
): UpdateResult<AuthState, AuthEffect> {
	switch (event.type) {
		case 'restore':
			return {
				state: { ...state, status: 'loading' },
				effects: [{ type: 'supabase.restore' }],
			};
		case 'restored':
			return {
				state: event.session
					? signedIn(event.session)
					: {
							status: 'signed_out',
							user: null,
							session: null,
							error: null,
						},
				effects: [],
			};
		case 'sign_in_password':
			return {
				state: { ...state, status: 'authenticating', error: null },
				effects: [
					{
						type: 'supabase.sign_in_password',
						email: event.email,
						password: event.password,
						captchaToken: event.captchaToken,
					},
				],
			};
		case 'sign_up':
			return {
				state: { ...state, status: 'authenticating', error: null },
				effects: [
					{
						type: 'supabase.sign_up',
						email: event.email,
						password: event.password,
						captchaToken: event.captchaToken,
					},
				],
			};
		case 'sign_in_oauth':
			return {
				state: { ...state, status: 'authenticating', error: null },
				effects: [
					{
						type: 'supabase.sign_in_oauth',
						provider: event.provider,
					},
				],
			};
		case 'sign_out':
			return {
				state: {
					status: 'signed_out',
					user: null,
					session: null,
					error: null,
				},
				effects: [{ type: 'supabase.sign_out' }],
			};
		case 'session_changed':
			return {
				state: event.session
					? signedIn(event.session)
					: {
							status: 'signed_out',
							user: null,
							session: null,
							error: null,
						},
				effects: [],
			};
		case 'auth_error':
			return {
				state: { ...state, status: 'error', error: event.message },
				effects: [],
			};
		default:
			return { state, effects: [] };
	}
}

function project(state: AuthState): AuthViewModel {
	return {
		status: state.status,
		loading:
			state.status === 'loading' || state.status === 'authenticating',
		signedIn: state.status === 'signed_in' && state.session !== null,
		user: state.user,
		username: state.user?.username ?? null,
		error: state.error,
	};
}

export type AuthCore = Core<AuthState, AuthEvent, AuthViewModel, AuthEffect>;

export const authCore: AuthCore = {
	initial: () => ({ ...initialAuthState }),
	update: reduce,
	view: project,
};

export class AuthStore extends Store<
	AuthState,
	AuthEvent,
	AuthViewModel,
	AuthEffect
> {}
