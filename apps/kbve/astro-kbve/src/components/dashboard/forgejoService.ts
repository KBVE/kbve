import { atom, computed } from 'nanostores';
import { initSupa, getSupa } from '@/lib/supa';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthState =
	| 'loading'
	| 'authenticated'
	| 'unauthenticated'
	| 'forbidden';

export interface ForgejoRepo {
	id: number;
	name: string;
	full_name: string;
	description: string;
	html_url: string;
	clone_url: string;
	private: boolean;
	fork: boolean;
	mirror: boolean;
	empty: boolean;
	size: number;
	stars_count: number;
	forks_count: number;
	open_issues_count: number;
	default_branch: string;
	created_at: string;
	updated_at: string;
	has_pull_requests: boolean;
	owner: {
		login: string;
		avatar_url: string;
	};
}

export interface ForgejoUser {
	id: number;
	login: string;
	full_name: string;
	email: string;
	avatar_url: string;
	is_admin: boolean;
	created: string;
	last_login: string;
}

interface CachedData {
	ts: number;
	repos: ForgejoRepo[];
	users: ForgejoUser[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_KEY = 'cache:forgejo:data';
const CACHE_TTL_MS = 60 * 1000;
const PROXY_BASE = '/dashboard/forgejo/proxy';
const REFRESH_INTERVAL_MS = 30 * 1000;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class AccessRestrictedError extends Error {
	constructor() {
		super('Access restricted');
		this.name = 'AccessRestrictedError';
	}
}

class UpstreamUnavailableError extends Error {
	reason: string;
	detail: string;
	constructor(reason: string, detail: string) {
		super(`Forgejo upstream unreachable: ${reason}`);
		this.name = 'UpstreamUnavailableError';
		this.reason = reason;
		this.detail = detail;
	}
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchRepos(token: string): Promise<ForgejoRepo[]> {
	const resp = await fetch(
		`${PROXY_BASE}/api/v1/repos/search?limit=50&sort=updated`,
		{
			headers: { Authorization: `Bearer ${token}` },
			signal: AbortSignal.timeout(10000),
		},
	);

	if (resp.status === 403) throw new AccessRestrictedError();
	if (resp.status === 502) {
		try {
			const body = await resp.json();
			throw new UpstreamUnavailableError(
				body.reason ?? 'unknown',
				body.detail ?? '',
			);
		} catch (e) {
			if (e instanceof UpstreamUnavailableError) throw e;
			throw new UpstreamUnavailableError('unknown', 'Bad gateway');
		}
	}
	if (!resp.ok) throw new Error(`Forgejo API error: ${resp.status}`);

	const data = await resp.json();
	return data.data ?? data ?? [];
}

async function fetchUsers(token: string): Promise<ForgejoUser[]> {
	const resp = await fetch(`${PROXY_BASE}/api/v1/admin/users?limit=50`, {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(10000),
	});

	if (resp.status === 403) return [];
	if (resp.status === 502) return [];
	if (!resp.ok) return [];

	return await resp.json();
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

function loadCache(): CachedData | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const parsed: CachedData = JSON.parse(raw);
		if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
		return parsed;
	} catch {
		return null;
	}
}

function saveCache(repos: ForgejoRepo[], users: ForgejoUser[]): void {
	try {
		const data: CachedData = { ts: Date.now(), repos, users };
		localStorage.setItem(CACHE_KEY, JSON.stringify(data));
	} catch {
		// ignore quota errors
	}
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class ForgejoService {
	// Auth
	public readonly $authState = atom<AuthState>('loading');
	public readonly $accessToken = atom<string | null>(null);

	// Data
	public readonly $repos = atom<ForgejoRepo[]>([]);
	public readonly $users = atom<ForgejoUser[]>([]);
	public readonly $loading = atom<boolean>(true);
	public readonly $error = atom<string | null>(null);
	public readonly $errorReason = atom<string | null>(null);
	public readonly $lastUpdated = atom<Date | null>(null);

	// Computed
	public readonly $totalRepos = computed(
		[this.$repos],
		(repos) => repos.length,
	);

	public readonly $privateCount = computed(
		[this.$repos],
		(repos) => repos.filter((r) => r.private).length,
	);

	public readonly $mirrorCount = computed(
		[this.$repos],
		(repos) => repos.filter((r) => r.mirror).length,
	);

	public readonly $totalUsers = computed(
		[this.$users],
		(users) => users.length,
	);

	public readonly $totalSize = computed([this.$repos], (repos) =>
		repos.reduce((sum, r) => sum + r.size, 0),
	);

	private _refreshInterval: ReturnType<typeof setInterval> | undefined;

	// --- Auth ---

	public async initAuth(): Promise<void> {
		try {
			await initSupa();
			const supa = getSupa();
			const sessionResult = await supa.getSession().catch(() => null);
			const session = sessionResult?.session ?? null;

			if (!session?.access_token) {
				this.$authState.set('unauthenticated');
				return;
			}

			this.$accessToken.set(session.access_token as string);
			this.$authState.set('authenticated');
		} catch {
			this.$authState.set('unauthenticated');
		}
	}

	// --- Data fetching ---

	public async fetchData(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;

		try {
			this.$error.set(null);
			this.$errorReason.set(null);
			const [repos, users] = await Promise.all([
				fetchRepos(token),
				fetchUsers(token),
			]);
			this.$repos.set(repos);
			this.$users.set(users);
			this.$lastUpdated.set(new Date());
			saveCache(repos, users);
		} catch (e: unknown) {
			if (e instanceof AccessRestrictedError) {
				this.$authState.set('forbidden');
				return;
			}
			if (e instanceof UpstreamUnavailableError) {
				this.$error.set(e.message);
				this.$errorReason.set(e.reason);
				return;
			}
			this.$error.set(e instanceof Error ? e.message : 'Unknown error');
		} finally {
			this.$loading.set(false);
		}
	}

	public loadCacheAndFetch(): void {
		const token = this.$accessToken.get();
		if (!token) return;

		const cached = loadCache();
		if (cached) {
			this.$repos.set(cached.repos);
			this.$users.set(cached.users);
			this.$lastUpdated.set(new Date(cached.ts));
			this.$loading.set(false);
		}

		this.fetchData();
		this._startAutoRefresh();
	}

	public refresh(): void {
		const token = this.$accessToken.get();
		if (token) {
			this.$loading.set(true);
			this.fetchData();
		}
	}

	private _startAutoRefresh(): void {
		if (this._refreshInterval) clearInterval(this._refreshInterval);
		this._refreshInterval = setInterval(
			() => this.fetchData(),
			REFRESH_INTERVAL_MS,
		);
	}
}

export const forgejoService = new ForgejoService();
