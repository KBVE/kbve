import { create } from 'zustand';
import {
	launcherApi,
	type ClientVersion,
	type Installed,
	type Progress,
} from './lib/tauri';
import {
	ensureFresh,
	fetchUser,
	loadSession,
	onCallback,
	persist,
	signIn,
	type AuthUser,
	type Provider,
	type Session,
} from './lib/auth';

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

	latest: () => get().clients.find((c) => c.platform === get().platform),
	needsUpdate: () => {
		const { installed } = get();
		const latest = get().latest();
		if (!installed) return false;
		return !!latest && installed.build_id !== latest.build_id;
	},

	refresh: async () => {
		set({ phase: 'loading', error: null });
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
				const fresh = await ensureFresh(session);
				if (fresh && fresh !== session) {
					session = fresh;
					await persist(fresh);
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
		await onCallback(async (s) => {
			set({ authPhase: 'authing' });
			await persist(s);
			const user = await fetchUser(s);
			set({ session: s, user, authPhase: user ? 'authed' : 'anon' });
		});
		const stored = await loadSession();
		if (!stored) return;
		const fresh = await ensureFresh(stored);
		if (!fresh) {
			await persist(null);
			return;
		}
		if (fresh !== stored) await persist(fresh);
		const user = await fetchUser(fresh);
		set({
			session: fresh,
			user,
			authPhase: user ? 'authed' : 'anon',
		});
	},

	signInWith: async (provider) => {
		set({ authPhase: 'authing', error: null });
		try {
			await signIn(provider);
		} catch (e) {
			set({ authPhase: 'anon', error: String(e) });
		}
	},

	signOut: async () => {
		await persist(null);
		set({ session: null, user: null, authPhase: 'anon' });
	},
}));
