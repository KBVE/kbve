// src/components/auth/useAuthBridge.ts
import { useState } from 'react';
import { authBridge } from './AuthBridge';

type OAuthProvider = 'github' | 'twitch' | 'discord';

/**
 * Hook for using the auth bridge in React components
 */
export function useAuthBridge() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signInWithOAuth = async (provider: OAuthProvider) => {
		setLoading(true);
		setError(null);
		try {
			await authBridge.signInWithOAuth(provider);
			// Will redirect to OAuth provider
		} catch (err: any) {
			setError(err?.message ?? 'OAuth sign-in failed');
			setLoading(false);
			throw err;
		}
	};

	const signOut = async () => {
		setLoading(true);
		setError(null);
		try {
			await authBridge.signOut();
		} catch (err: any) {
			setError(err?.message ?? 'Sign-out failed');
			throw err;
		} finally {
			setLoading(false);
		}
	};

	return {
		signInWithOAuth,
		signOut,
		loading,
		error,
	};
}
