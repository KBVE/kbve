import { broadcastProfileRefresh, broadcastStaffRefresh } from './sync-bus';
import {
	$profileCache,
	PROFILE_CACHE_TTL_MS,
	fetchProfileFromApi,
	setProfileCache,
	type DroidProfile,
} from './profile';
import {
	$staffPermissions,
	STAFF_CACHE_TTL_MS,
	fetchStaffPermissionsFromApi,
	setStaffPermsCache,
} from './staff';

const FALLBACK_REFRESH_MS = 15 * 60 * 1000;
const DEBOUNCE_MS = 250;

export interface AuthEventLike {
	session?: {
		access_token?: string;
		user?: { id?: string } | null;
	} | null;
}

export interface ProfileSyncOptions {
	apiBase: string;
	supabaseUrl: string;
	supabaseAnonKey: string;
	/** Provide a way to subscribe to auth events from the SharedWorker / gateway. */
	subscribeAuth: (handler: (event: AuthEventLike) => void) => () => void;
	/**
	 * Optional override for the recurring fallback cadence. Defaults to
	 * 15 minutes. Pass `0` to disable.
	 */
	fallbackIntervalMs?: number;
}

interface SyncState {
	apiBase: string;
	supabaseUrl: string;
	supabaseAnonKey: string;
	timer: ReturnType<typeof setInterval> | null;
	debounce: ReturnType<typeof setTimeout> | null;
	inflight: Promise<void> | null;
	disposers: Array<() => void>;
}

let active: SyncState | null = null;

async function refreshProfileAndStaff(state: SyncState): Promise<void> {
	if (state.inflight) return state.inflight;
	state.inflight = (async () => {
		try {
			const sessionRaw = readSession();
			const userId = sessionRaw?.user?.id;
			const token = sessionRaw?.access_token;
			if (!userId || !token) return;

			const profilePromise = fetchProfileFromApi({
				token,
				apiBase: state.apiBase,
			});
			const staffPromise = fetchStaffPermissionsFromApi({
				token,
				apikey: state.supabaseAnonKey,
				supabaseUrl: state.supabaseUrl,
			});

			const [profile, staff] = await Promise.all([
				profilePromise.catch(() => null),
				staffPromise.catch(() => null),
			]);

			if (profile && profile.user_id) {
				setProfileCache(profile);
				broadcastProfileRefresh(profile);
			}
			if (typeof staff === 'number') {
				setStaffPermsCache(userId, staff);
				broadcastStaffRefresh(userId, staff);
			}
		} finally {
			if (active === state) state.inflight = null;
		}
	})();
	return state.inflight;
}

function readSession(): AuthEventLike['session'] {
	if (typeof localStorage === 'undefined') return null;
	const raw = localStorage.getItem('sb-auth-token');
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (parsed?.currentSession?.access_token) return parsed.currentSession;
		if (parsed?.access_token) return parsed;
		return null;
	} catch {
		return null;
	}
}

function scheduleRefresh(state: SyncState): void {
	if (state.debounce) clearTimeout(state.debounce);
	state.debounce = setTimeout(() => {
		state.debounce = null;
		void refreshProfileAndStaff(state);
	}, DEBOUNCE_MS);
}

function isProfileStale(): boolean {
	const entry = $profileCache.get();
	if (!entry) return true;
	return Date.now() - entry.cached_at > PROFILE_CACHE_TTL_MS;
}

function isStaffStale(): boolean {
	const entry = $staffPermissions.get();
	if (!entry) return true;
	return Date.now() - entry.cached_at > STAFF_CACHE_TTL_MS;
}

/**
 * Install a profile + staff_permissions sync coordinator. Returns a
 * dispose function that tears down listeners and the fallback timer.
 *
 * Refresh triggers:
 *   - auth events from the SharedWorker (token refresh, sign-in)
 *   - `document.visibilitychange` (only if at least one cache is stale)
 *   - `window.focus`            (only if at least one cache is stale)
 *   - fallback `setInterval` every `fallbackIntervalMs` (default 15m)
 *
 * Each refresh is debounced (250ms) and reentrancy-guarded; a refresh
 * in flight is reused rather than queued.
 *
 * Idempotent — calling twice tears down the previous coordinator first
 * so callers can re-run safely.
 */
export function installProfileSync(opts: ProfileSyncOptions): () => void {
	disposeProfileSync();

	const state: SyncState = {
		apiBase: opts.apiBase,
		supabaseUrl: opts.supabaseUrl,
		supabaseAnonKey: opts.supabaseAnonKey,
		timer: null,
		debounce: null,
		inflight: null,
		disposers: [],
	};
	active = state;

	const unsubscribeAuth = opts.subscribeAuth((evt) => {
		if (!evt?.session?.user?.id) return;
		scheduleRefresh(state);
	});
	state.disposers.push(unsubscribeAuth);

	if (typeof document !== 'undefined') {
		const onVisibility = () => {
			if (document.visibilityState !== 'visible') return;
			if (!isProfileStale() && !isStaffStale()) return;
			scheduleRefresh(state);
		};
		document.addEventListener('visibilitychange', onVisibility);
		state.disposers.push(() =>
			document.removeEventListener('visibilitychange', onVisibility),
		);
	}
	if (typeof window !== 'undefined') {
		const onFocus = () => {
			if (!isProfileStale() && !isStaffStale()) return;
			scheduleRefresh(state);
		};
		window.addEventListener('focus', onFocus);
		state.disposers.push(() =>
			window.removeEventListener('focus', onFocus),
		);
	}

	const interval = opts.fallbackIntervalMs ?? FALLBACK_REFRESH_MS;
	if (interval > 0) {
		state.timer = setInterval(() => {
			void refreshProfileAndStaff(state);
		}, interval);
	}

	return disposeProfileSync;
}

export function disposeProfileSync(): void {
	if (!active) return;
	const state = active;
	active = null;
	if (state.timer) clearInterval(state.timer);
	if (state.debounce) clearTimeout(state.debounce);
	for (const dispose of state.disposers) {
		try {
			dispose();
		} catch {
			/* best effort */
		}
	}
	state.disposers.length = 0;
}

/** Trigger an immediate refresh if a sync coordinator is installed. */
export async function refreshProfileSyncNow(): Promise<void> {
	if (!active) return;
	await refreshProfileAndStaff(active);
}

export type { DroidProfile };
