import { create } from 'zustand';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
	authApi,
	launcherApi,
	onAuthCallback,
	toAuthUser,
	type AuthUser,
	type ClientVersion,
	type Installed,
	type Progress,
	type Provider,
	type Session,
} from '@kbve/tauri';
import { loadSession, saveSession } from './lib/persist';

const REDIRECT = 'chuckrpg-launcher://auth/callback';

function nowSecs(): number {
	return Math.floor(Date.now() / 1000);
}

async function freshSession(session: Session): Promise<Session> {
	if (session.expires_at && session.expires_at - 300 > nowSecs())
		return session;
	const refreshed = await authApi.refresh();
	return refreshed ?? session;
}

type Phase =
	| 'idle'
	| 'loading'
	| 'installing'
	| 'launching'
	| 'running'
	| 'error';
type AuthPhase = 'anon' | 'authing' | 'authed';

type LauncherState = {
	platform: string;
	clients: ClientVersion[];
	installed: Installed | null;
	phase: Phase;
	progress: Progress | null;
	error: string | null;
	session: Session | null;
	user: AuthUser | null;
	authPhase: AuthPhase;
	refreshCooldown: boolean;
	refresh: () => Promise<void>;
	installOrUpdate: () => Promise<void>;
	play: () => Promise<void>;
	initAuth: () => Promise<void>;
	signInWith: (provider: Provider) => Promise<void>;
	signOut: () => Promise<void>;
	latest: () => ClientVersion | undefined;
	needsUpdate: () => boolean;
};

export const useLauncher = create<LauncherState>((set, get) => ({
	platform: '',
	clients: [],
	installed: null,
	phase: 'loading',
	progress: null,
	error: null,
	session: null,
	user: null,
	authPhase: 'anon',
	refreshCooldown: false,

	latest: () => get().clients.find((c) => c.platform === get().platform),
	needsUpdate: () => {
		const { installed } = get();
		const latest = get().latest();
		if (!installed) return false;
		return !!latest && installed.build_id !== latest.build_id;
	},

	refresh: async () => {
		if (get().refreshCooldown) return;
		set({ phase: 'loading', error: null, refreshCooldown: true });
		setTimeout(() => set({ refreshCooldown: false }), 5000);
		try {
			const platform = await launcherApi.currentPlatform();
			const [clients, installed] = await Promise.all([
				launcherApi.fetchClients(),
				launcherApi.installState(),
			]);
			set({ platform, clients, installed, phase: 'idle' });
		} catch (e) {
			set({ phase: 'error', error: String(e) });
		}
	},

	installOrUpdate: async () => {
		set({ phase: 'installing', progress: null, error: null });
		const unlisten = await launcherApi.onProgress((p) =>
			set({ progress: p }),
		);
		try {
			const installed = await launcherApi.installUpdate();
			set({ installed, phase: 'idle', progress: null });
		} catch (e) {
			set({ phase: 'error', error: String(e) });
		} finally {
			unlisten();
		}
	},

	play: async () => {
		const { phase } = get();
		if (
			phase === 'launching' ||
			phase === 'running' ||
			phase === 'installing' ||
			phase === 'loading'
		)
			return;
		set({ phase: 'launching', error: null });
		let unlisten: (() => void) | undefined;
		try {
			let session = get().session;
			if (session) {
				const fresh = await freshSession(session);
				if (fresh !== session) {
					session = fresh;
					await saveSession(fresh);
					set({ session: fresh });
				}
			}
			unlisten = await launcherApi.onGameExited(() => {
				unlisten?.();
				if (get().phase === 'running') set({ phase: 'idle' });
			});
			await launcherApi.launch(session ?? undefined);
			set({ phase: 'running' });
		} catch (e) {
			unlisten?.();
			set({ phase: 'error', error: String(e) });
		}
	},

	initAuth: async () => {
		await onAuthCallback(async (url) => {
			set({ authPhase: 'authing' });
			try {
				const session = await authApi.complete(url);
				await saveSession(session);
				set({
					session,
					user: toAuthUser(session),
					authPhase: 'authed',
				});
			} catch (e) {
				set({ authPhase: 'anon', error: String(e) });
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
				authPhase: 'authed',
			});
		} catch {
			await saveSession(null);
		}
	},

	signInWith: async (provider) => {
		set({ authPhase: 'authing', error: null });
		try {
			const url = await authApi.authorizeUrl(provider, REDIRECT);
			await openUrl(url);
		} catch (e) {
			set({ authPhase: 'anon', error: String(e) });
		}
	},

	signOut: async () => {
		await authApi.signOut();
		await saveSession(null);
		set({ session: null, user: null, authPhase: 'anon' });
	},
}));
