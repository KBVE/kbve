import { create } from 'zustand';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
	authApi,
	onAuthCallback,
	toAuthUser,
	type AuthUser,
	type Provider,
	type Session,
} from '@kbve/tauri';
import { loadSession, saveSession } from '../lib/persist';

const REDIRECT = 'kbve-desktop://auth/callback';

function nowSecs(): number {
	return Math.floor(Date.now() / 1000);
}

async function freshSession(session: Session): Promise<Session> {
	if (session.expires_at && session.expires_at - 300 > nowSecs())
		return session;
	const refreshed = await authApi.refresh();
	return refreshed ?? session;
}

type AuthPhase = 'anon' | 'authing' | 'authed';

interface AuthState {
	session: Session | null;
	user: AuthUser | null;
	phase: AuthPhase;
	error: string | null;
	initialized: boolean;
	init: () => Promise<void>;
	signInWith: (provider: Provider) => Promise<void>;
	signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
	session: null,
	user: null,
	phase: 'anon',
	error: null,
	initialized: false,

	init: async () => {
		if (get().initialized) return;
		set({ initialized: true });

		await onAuthCallback(async (url) => {
			set({ phase: 'authing' });
			try {
				const session = await authApi.complete(url);
				await saveSession(session);
				set({
					session,
					user: toAuthUser(session),
					phase: 'authed',
					error: null,
				});
			} catch (e) {
				set({ phase: 'anon', error: String(e) });
			}
		});

		const stored = await loadSession();
		if (!stored) return;
		try {
			await authApi.restore(stored);
			const fresh = await freshSession(stored);
			if (fresh !== stored) await saveSession(fresh);
			set({
				session: fresh,
				user: toAuthUser(fresh),
				phase: 'authed',
			});
		} catch {
			await saveSession(null);
		}
	},

	signInWith: async (provider) => {
		set({ phase: 'authing', error: null });
		try {
			const url = await authApi.authorizeUrl(provider, REDIRECT);
			await openUrl(url);
		} catch (e) {
			set({ phase: 'anon', error: String(e) });
		}
	},

	signOut: async () => {
		await authApi.signOut();
		await saveSession(null);
		set({ session: null, user: null, phase: 'anon', error: null });
	},
}));
