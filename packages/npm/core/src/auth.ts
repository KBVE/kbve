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
	autoClaimAttempted: boolean;
	lastProvider: OAuthProvider | null;
}

export const initialAuthState: AuthState = {
	status: 'loading',
	user: null,
	session: null,
	error: null,
	autoClaimAttempted: false,
	lastProvider: null,
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
	| { type: 'set_username'; username: string }
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
	| { type: 'api.set_username'; username: string }
	| { type: 'supabase.sign_out' }
	| { type: 'api.auto_claim_username'; provider: OAuthProvider | null };

export interface AuthViewModel {
	status: AuthStatus;
	loading: boolean;
	signedIn: boolean;
	needsUsername: boolean;
	user: AuthUser | null;
	username: string | null;
	error: string | null;
}

function signedIn(state: AuthState, session: AuthSession): AuthState {
	return {
		status: 'signed_in',
		user: session.user,
		session,
		error: null,
		autoClaimAttempted: state.autoClaimAttempted,
		lastProvider: state.lastProvider,
	};
}

function withAutoClaim(next: AuthState): UpdateResult<AuthState, AuthEffect> {
	const noUsername = next.user?.username == null;
	if (next.status === 'signed_in' && noUsername && !next.autoClaimAttempted) {
		return {
			state: { ...next, autoClaimAttempted: true },
			effects: [
				{
					type: 'api.auto_claim_username',
					provider: next.lastProvider,
				},
			],
		};
	}
	return { state: next, effects: [] };
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
			return event.session
				? withAutoClaim(signedIn(state, event.session))
				: {
						state: {
							...initialAuthState,
							status: 'signed_out',
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
				state: {
					...state,
					status: 'authenticating',
					error: null,
					lastProvider: event.provider,
				},
				effects: [
					{
						type: 'supabase.sign_in_oauth',
						provider: event.provider,
					},
				],
			};
		case 'set_username':
			return {
				state: { ...state, error: null },
				effects: [
					{ type: 'api.set_username', username: event.username },
				],
			};
		case 'sign_out':
			return {
				state: { ...initialAuthState, status: 'signed_out' },
				effects: [{ type: 'supabase.sign_out' }],
			};
		case 'session_changed':
			return event.session
				? withAutoClaim(signedIn(state, event.session))
				: {
						state: {
							...initialAuthState,
							status: 'signed_out',
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
	const signedInNow = state.status === 'signed_in' && state.session !== null;
	const username = state.user?.username ?? null;
	return {
		status: state.status,
		loading:
			state.status === 'loading' || state.status === 'authenticating',
		signedIn: signedInNow,
		needsUsername: signedInNow && username === null,
		user: state.user,
		username,
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
