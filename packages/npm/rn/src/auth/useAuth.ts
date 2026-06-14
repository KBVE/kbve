import { useSyncExternalStore } from 'react';
import type { AuthViewModel, OAuthProvider } from '@kbve/core';
import { useKbve } from './KbveProvider';

export function useAuth(): AuthViewModel {
	const { authStore } = useKbve();
	return useSyncExternalStore(
		authStore.subscribe,
		authStore.getSnapshot,
		authStore.getSnapshot,
	);
}

export interface AuthActions {
	signInWithPassword: (
		email: string,
		password: string,
		captchaToken: string,
	) => void;
	signUp: (email: string, password: string, captchaToken: string) => void;
	signInWithOAuth: (provider: OAuthProvider) => void;
	setUsername: (username: string) => void;
	signOut: () => void;
}

export function useAuthActions(): AuthActions {
	const { authStore } = useKbve();
	return {
		signInWithPassword: (email, password, captchaToken) =>
			authStore.dispatch({
				type: 'sign_in_password',
				email,
				password,
				captchaToken,
			}),
		signUp: (email, password, captchaToken) =>
			authStore.dispatch({
				type: 'sign_up',
				email,
				password,
				captchaToken,
			}),
		signInWithOAuth: (provider) =>
			authStore.dispatch({ type: 'sign_in_oauth', provider }),
		setUsername: (username) =>
			authStore.dispatch({ type: 'set_username', username }),
		signOut: () => authStore.dispatch({ type: 'sign_out' }),
	};
}
