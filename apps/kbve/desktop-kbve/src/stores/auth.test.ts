import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Session } from '@kbve/tauri';
import { useAuthStore } from './auth';

const { authApi, onAuthCallback, openUrl, loadSession, saveSession } =
	vi.hoisted(() => ({
		authApi: {
			authorizeUrl: vi.fn(),
			complete: vi.fn(),
			restore: vi.fn(),
			session: vi.fn(),
			refresh: vi.fn(),
			signOut: vi.fn(),
		},
		onAuthCallback: vi.fn(),
		openUrl: vi.fn(),
		loadSession: vi.fn(),
		saveSession: vi.fn(),
	}));

vi.mock('@kbve/tauri', () => ({
	authApi,
	onAuthCallback,
	toAuthUser: (session: Session) => ({
		id: session.user.id,
		email: session.user.email ?? undefined,
		name: session.user.email ?? undefined,
	}),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
	openUrl: (url: string) => openUrl(url),
}));

vi.mock('../lib/persist', () => ({
	loadSession: () => loadSession(),
	saveSession: (s: Session | null) => saveSession(s),
}));

function session(overrides: Partial<Session> = {}): Session {
	return {
		access_token: 'acc',
		refresh_token: 'ref',
		token_type: 'bearer',
		expires_in: 3600,
		expires_at: Math.floor(Date.now() / 1000) + 3600,
		user: {
			id: 'user-1',
			email: 'a@kbve.com',
			role: 'authenticated',
			aud: null,
			user_metadata: {},
			app_metadata: {},
			created_at: null,
			updated_at: null,
		},
		...overrides,
	};
}

describe('Auth Store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		useAuthStore.setState({
			session: null,
			user: null,
			phase: 'anon',
			error: null,
			initialized: false,
		});
		onAuthCallback.mockResolvedValue(() => undefined);
		loadSession.mockResolvedValue(null);
		saveSession.mockResolvedValue(undefined);
	});

	describe('init', () => {
		it('stays anon with no stored session', async () => {
			await useAuthStore.getState().init();
			const state = useAuthStore.getState();
			expect(state.phase).toBe('anon');
			expect(state.session).toBeNull();
			expect(authApi.restore).not.toHaveBeenCalled();
		});

		it('restores a stored session and becomes authed', async () => {
			const stored = session();
			loadSession.mockResolvedValue(stored);
			authApi.restore.mockResolvedValue(undefined);
			await useAuthStore.getState().init();
			const state = useAuthStore.getState();
			expect(authApi.restore).toHaveBeenCalledWith(stored);
			expect(state.phase).toBe('authed');
			expect(state.session).toBe(stored);
			expect(state.user?.id).toBe('user-1');
			expect(authApi.refresh).not.toHaveBeenCalled();
		});

		it('refreshes a near-expiry stored session', async () => {
			const stored = session({
				expires_at: Math.floor(Date.now() / 1000) + 60,
			});
			const fresh = session({ access_token: 'acc2' });
			loadSession.mockResolvedValue(stored);
			authApi.restore.mockResolvedValue(undefined);
			authApi.refresh.mockResolvedValue(fresh);
			await useAuthStore.getState().init();
			const state = useAuthStore.getState();
			expect(state.session).toBe(fresh);
			expect(saveSession).toHaveBeenCalledWith(fresh);
			expect(state.phase).toBe('authed');
		});

		it('clears persisted session when restore fails', async () => {
			loadSession.mockResolvedValue(session());
			authApi.restore.mockRejectedValue(new Error('bad'));
			await useAuthStore.getState().init();
			expect(saveSession).toHaveBeenCalledWith(null);
			expect(useAuthStore.getState().phase).toBe('anon');
		});

		it('is idempotent', async () => {
			await useAuthStore.getState().init();
			await useAuthStore.getState().init();
			expect(onAuthCallback).toHaveBeenCalledTimes(1);
		});

		it('completes auth when the deep-link callback fires', async () => {
			let cb: ((url: string) => void) | null = null;
			onAuthCallback.mockImplementation(
				async (fn: (url: string) => void) => {
					cb = fn;
					return () => undefined;
				},
			);
			const s = session();
			authApi.complete.mockResolvedValue(s);
			await useAuthStore.getState().init();
			expect(cb).not.toBeNull();
			await (cb as unknown as (url: string) => Promise<void>)(
				'kbve-desktop://auth/callback#access_token=x',
			);
			const state = useAuthStore.getState();
			expect(authApi.complete).toHaveBeenCalledWith(
				'kbve-desktop://auth/callback#access_token=x',
			);
			expect(saveSession).toHaveBeenCalledWith(s);
			expect(state.phase).toBe('authed');
			expect(state.user?.id).toBe('user-1');
		});

		it('returns to anon with error when callback completion fails', async () => {
			let cb: ((url: string) => void) | null = null;
			onAuthCallback.mockImplementation(
				async (fn: (url: string) => void) => {
					cb = fn;
					return () => undefined;
				},
			);
			authApi.complete.mockRejectedValue(new Error('exchange failed'));
			await useAuthStore.getState().init();
			expect(cb).not.toBeNull();
			await (cb as unknown as (url: string) => Promise<void>)(
				'kbve-desktop://auth/callback#access_token=x',
			);
			const state = useAuthStore.getState();
			expect(state.phase).toBe('anon');
			expect(state.error).toContain('exchange failed');
		});
	});

	describe('signInWith', () => {
		it('opens the authorize url and enters authing', async () => {
			authApi.authorizeUrl.mockResolvedValue('https://auth.example/x');
			await useAuthStore.getState().signInWith('github');
			expect(authApi.authorizeUrl).toHaveBeenCalledWith(
				'github',
				'kbve-desktop://auth/callback',
			);
			expect(openUrl).toHaveBeenCalledWith('https://auth.example/x');
			expect(useAuthStore.getState().phase).toBe('authing');
		});

		it('returns to anon on failure', async () => {
			authApi.authorizeUrl.mockRejectedValue(new Error('offline'));
			await useAuthStore.getState().signInWith('discord');
			const state = useAuthStore.getState();
			expect(state.phase).toBe('anon');
			expect(state.error).toContain('offline');
		});
	});

	describe('signOut', () => {
		it('clears session, user and persistence', async () => {
			const s = session();
			useAuthStore.setState({
				session: s,
				user: { id: 'user-1' },
				phase: 'authed',
			});
			authApi.signOut.mockResolvedValue(undefined);
			await useAuthStore.getState().signOut();
			const state = useAuthStore.getState();
			expect(authApi.signOut).toHaveBeenCalled();
			expect(saveSession).toHaveBeenCalledWith(null);
			expect(state.session).toBeNull();
			expect(state.user).toBeNull();
			expect(state.phase).toBe('anon');
		});
	});
});
