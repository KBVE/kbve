import { invoke } from '@tauri-apps/api/core';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import type { Provider, Session } from './types';

export const authApi = {
	authorizeUrl: (provider: Provider, redirectTo: string) =>
		invoke<string>('auth_authorize_url', { provider, redirectTo }),
	complete: (callbackUrl: string) =>
		invoke<Session>('auth_complete', { callbackUrl }),
	restore: (session: Session) => invoke<void>('auth_restore', { session }),
	session: () => invoke<Session | null>('auth_session'),
	refresh: () => invoke<Session | null>('auth_refresh'),
	signOut: () => invoke<void>('auth_sign_out'),
};

export function onAuthCallback(
	cb: (callbackUrl: string) => void,
): Promise<() => void> {
	return onOpenUrl((urls) => {
		for (const u of urls) {
			if (u.includes('access_token=') || u.includes('auth/callback')) {
				cb(u);
				break;
			}
		}
	});
}
