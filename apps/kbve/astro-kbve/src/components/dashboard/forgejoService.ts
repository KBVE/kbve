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
	archived: boolean;
	empty: boolean;
	size: number;
	stars_count: number;
	forks_count: number;
	open_issues_count: number;
	open_pr_counter: number;
	release_counter: number;
	default_branch: string;
	created_at: string;
	updated_at: string;
	has_pull_requests: boolean;
	language: string;
	languages_url: string;
	owner: {
		login: string;
		avatar_url: string;
	};
	internal_tracker?: {
		enable_time_tracker: boolean;
		allow_only_contributors_to_track_time: boolean;
		enable_issue_dependencies: boolean;
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
	active: boolean;
	prohibit_login: boolean;
}

export interface ForgejoBranch {
	name: string;
	commit: {
		id: string;
		message: string;
		timestamp: string;
		author: {
			name: string;
			email: string;
		};
	};
	protected: boolean;
}

export interface ForgejoCommit {
	sha: string;
	commit: {
		message: string;
		author: {
			name: string;
			email: string;
			date: string;
		};
	};
	html_url: string;
}

export interface ForgejoRelease {
	id: number;
	tag_name: string;
	name: string;
	body: string;
	draft: boolean;
	prerelease: boolean;
	created_at: string;
	published_at: string;
	author: {
		login: string;
		avatar_url: string;
	};
	assets: ForgejoReleaseAsset[];
}

export interface ForgejoReleaseAsset {
	id: number;
	name: string;
	size: number;
	download_count: number;
	created_at: string;
	browser_download_url: string;
}

export interface ForgejoLFSObject {
	oid: string;
	size: number;
	created_at: string;
}

export interface ForgejoOrg {
	id: number;
	username: string;
	full_name: string;
	avatar_url: string;
	description: string;
	visibility: string;
}

export interface RepoDetail {
	branches: ForgejoBranch[];
	commits: ForgejoCommit[];
	releases: ForgejoRelease[];
	languages: Record<string, number>;
	loading: boolean;
}

interface CachedData {
	ts: number;
	repos: ForgejoRepo[];
	users: ForgejoUser[];
	orgs: ForgejoOrg[];
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

async function apiFetch<T>(
	token: string,
	path: string,
	fallback?: T,
): Promise<T> {
	const resp = await fetch(`${PROXY_BASE}${path}`, {
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(10000),
	});

	if (resp.status === 403) {
		if (fallback !== undefined) return fallback;
		throw new AccessRestrictedError();
	}
	if (resp.status === 502) {
		if (fallback !== undefined) return fallback;
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
	if (!resp.ok) {
		if (fallback !== undefined) return fallback;
		throw new Error(`Forgejo API error: ${resp.status}`);
	}

	return await resp.json();
}

async function fetchRepos(token: string): Promise<ForgejoRepo[]> {
	const data = await apiFetch<{ data?: ForgejoRepo[] } | ForgejoRepo[]>(
		token,
		'/api/v1/repos/search?limit=50&sort=updated',
	);
	if (Array.isArray(data)) return data;
	return data.data ?? [];
}

async function fetchUsers(token: string): Promise<ForgejoUser[]> {
	// Try repo collaborators — the deploy token has repo scope.
	// Extract unique users from all accessible repos' collaborators.
	const repos = await fetchRepos(token);
	const users: ForgejoUser[] = [];
	const seen = new Set<number>();
	for (const repo of repos) {
		const collabs = await apiFetch(
			token,
			`/api/v1/repos/${repo.full_name}/collaborators?limit=50`,
			[] as ForgejoUser[],
		);
		for (const u of collabs) {
			if (!seen.has(u.id)) {
				seen.add(u.id);
				users.push(u);
			}
		}
	}
	// Also include repo owners
	for (const repo of repos) {
		if (repo.owner && !seen.has(repo.owner.id)) {
			seen.add(repo.owner.id);
			users.push(repo.owner as ForgejoUser);
		}
	}
	return users;
}

async function fetchOrgs(token: string): Promise<ForgejoOrg[]> {
	return apiFetch(token, '/api/v1/orgs?limit=50', [] as ForgejoOrg[]);
}

// ---------------------------------------------------------------------------
// Repo detail API helpers
// ---------------------------------------------------------------------------

async function fetchRepoBranches(
	token: string,
	fullName: string,
): Promise<ForgejoBranch[]> {
	return apiFetch(
		token,
		`/api/v1/repos/${fullName}/branches?limit=20`,
		[] as ForgejoBranch[],
	);
}

async function fetchRepoCommits(
	token: string,
	fullName: string,
): Promise<ForgejoCommit[]> {
	return apiFetch(
		token,
		`/api/v1/repos/${fullName}/commits?limit=10`,
		[] as ForgejoCommit[],
	);
}

async function fetchRepoReleases(
	token: string,
	fullName: string,
): Promise<ForgejoRelease[]> {
	return apiFetch(
		token,
		`/api/v1/repos/${fullName}/releases?limit=10`,
		[] as ForgejoRelease[],
	);
}

async function fetchRepoLanguages(
	token: string,
	fullName: string,
): Promise<Record<string, number>> {
	return apiFetch(
		token,
		`/api/v1/repos/${fullName}/languages`,
		{} as Record<string, number>,
	);
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

function saveCache(
	repos: ForgejoRepo[],
	users: ForgejoUser[],
	orgs: ForgejoOrg[],
): void {
	try {
		const data: CachedData = { ts: Date.now(), repos, users, orgs };
		localStorage.setItem(CACHE_KEY, JSON.stringify(data));
	} catch {
		// ignore quota errors
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} KB`;
	const mb = bytes / 1024;
	if (mb < 1024) return `${mb.toFixed(1)} MB`;
	return `${(mb / 1024).toFixed(2)} GB`;
}

export function timeAgo(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return 'just now';
	if (mins < 60) return `${mins}m ago`;
	const hrs = Math.floor(mins / 60);
	if (hrs < 24) return `${hrs}h ago`;
	const days = Math.floor(hrs / 24);
	if (days < 30) return `${days}d ago`;
	return `${Math.floor(days / 30)}mo ago`;
}

const LANG_COLORS: Record<string, string> = {
	Go: '#00ADD8',
	Rust: '#DEA584',
	TypeScript: '#3178C6',
	JavaScript: '#F7DF1E',
	Python: '#3572A5',
	Shell: '#89E051',
	Dockerfile: '#384D54',
	HTML: '#E34C26',
	CSS: '#563D7C',
	SCSS: '#C6538C',
	Makefile: '#427819',
	C: '#555555',
	'C++': '#F34B7D',
	Java: '#B07219',
	Kotlin: '#A97BFF',
	Swift: '#F05138',
	Markdown: '#083FA1',
	YAML: '#CB171E',
	JSON: '#292929',
	TOML: '#9C4221',
	Astro: '#FF5A03',
	MDX: '#FCB32C',
	Nix: '#7E7EFF',
	Lua: '#000080',
	Zig: '#EC915C',
};

export function langColor(lang: string): string {
	return LANG_COLORS[lang] ?? '#6b7280';
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
	public readonly $orgs = atom<ForgejoOrg[]>([]);
	public readonly $loading = atom<boolean>(true);
	public readonly $error = atom<string | null>(null);
	public readonly $errorReason = atom<string | null>(null);
	public readonly $lastUpdated = atom<Date | null>(null);

	// Expanded repo detail
	public readonly $expandedRepo = atom<string | null>(null);
	public readonly $repoDetails = atom<Record<string, RepoDetail>>({});

	// Computed
	public readonly $totalRepos = computed(
		[this.$repos],
		(repos) => repos.length,
	);

	public readonly $publicCount = computed(
		[this.$repos],
		(repos) => repos.filter((r) => !r.private).length,
	);

	public readonly $privateCount = computed(
		[this.$repos],
		(repos) => repos.filter((r) => r.private).length,
	);

	public readonly $mirrorCount = computed(
		[this.$repos],
		(repos) => repos.filter((r) => r.mirror).length,
	);

	public readonly $archivedCount = computed(
		[this.$repos],
		(repos) => repos.filter((r) => r.archived).length,
	);

	public readonly $totalUsers = computed(
		[this.$users],
		(users) => users.length,
	);

	public readonly $activeUsers = computed(
		[this.$users],
		(users) => users.filter((u) => u.active && !u.prohibit_login).length,
	);

	public readonly $adminCount = computed(
		[this.$users],
		(users) => users.filter((u) => u.is_admin).length,
	);

	public readonly $totalSize = computed([this.$repos], (repos) =>
		repos.reduce((sum, r) => sum + r.size, 0),
	);

	public readonly $totalStars = computed([this.$repos], (repos) =>
		repos.reduce((sum, r) => sum + r.stars_count, 0),
	);

	public readonly $totalOpenIssues = computed([this.$repos], (repos) =>
		repos.reduce((sum, r) => sum + r.open_issues_count, 0),
	);

	public readonly $totalOpenPRs = computed([this.$repos], (repos) =>
		repos.reduce((sum, r) => sum + (r.open_pr_counter ?? 0), 0),
	);

	public readonly $totalReleases = computed([this.$repos], (repos) =>
		repos.reduce((sum, r) => sum + (r.release_counter ?? 0), 0),
	);

	public readonly $languageBreakdown = computed([this.$repos], (repos) => {
		const counts: Record<string, number> = {};
		for (const r of repos) {
			if (r.language) {
				counts[r.language] = (counts[r.language] ?? 0) + 1;
			}
		}
		return Object.entries(counts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10);
	});

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
			const [repos, users, orgs] = await Promise.all([
				fetchRepos(token),
				fetchUsers(token),
				fetchOrgs(token),
			]);
			this.$repos.set(repos);
			this.$users.set(users);
			this.$orgs.set(orgs);
			this.$lastUpdated.set(new Date());
			saveCache(repos, users, orgs);
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
			this.$orgs.set(cached.orgs ?? []);
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

	// --- Repo detail expansion ---

	public toggleExpandedRepo(fullName: string): void {
		const current = this.$expandedRepo.get();
		if (current === fullName) {
			this.$expandedRepo.set(null);
		} else {
			this.$expandedRepo.set(fullName);
			this._fetchRepoDetail(fullName);
		}
	}

	private async _fetchRepoDetail(fullName: string): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;

		const details = { ...this.$repoDetails.get() };
		details[fullName] = {
			branches: [],
			commits: [],
			releases: [],
			languages: {},
			loading: true,
		};
		this.$repoDetails.set(details);

		const [branches, commits, releases, languages] = await Promise.all([
			fetchRepoBranches(token, fullName),
			fetchRepoCommits(token, fullName),
			fetchRepoReleases(token, fullName),
			fetchRepoLanguages(token, fullName),
		]);

		const updated = { ...this.$repoDetails.get() };
		updated[fullName] = {
			branches,
			commits,
			releases,
			languages,
			loading: false,
		};
		this.$repoDetails.set(updated);
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
