import { useState } from 'react';
import type { AuthBridge, OAuthProvider } from './AuthBridge';

export function useAuthBridge(bridge: AuthBridge) {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signInWithOAuth = async (provider: OAuthProvider) => {
		setLoading(true);
		setError(null);
		try {
			await bridge.signInWithOAuth(provider);
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
			await bridge.signOut();
		} catch (err: any) {
			setError(err?.message ?? 'Sign-out failed');
			throw err;
		} finally {
			setLoading(false);
		}
	};

	return { signInWithOAuth, signOut, loading, error };
}
