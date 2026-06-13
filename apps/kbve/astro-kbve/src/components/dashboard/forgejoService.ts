import { atom, computed } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import { initSupa, getSupa } from '@/lib/supa';
import { cacheGet, cacheSet } from '@/lib/idb-cache';

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
		id: number;
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

export interface ForgejoTeam {
	id: number;
	name: string;
	description: string;
	permission: string;
	units: string[];
	includes_all_repositories: boolean;
	can_create_org_repo: boolean;
}

export interface ForgejoHook {
	id: number;
	type: string;
	active: boolean;
	events: string[];
	config: Record<string, string>;
	created_at: string;
	updated_at: string;
}

export interface ForgejoBranchProtection {
	branch_name: string;
	rule_name: string;
	enable_push: boolean;
	required_approvals: number;
	enable_status_check: boolean;
	require_signed_commits: boolean;
	block_on_outdated_branch: boolean;
	created_at: string;
}

export interface CreateBranchProtectionInput {
	rule_name: string;
	required_approvals: number;
	enable_push: boolean;
	require_signed_commits: boolean;
	enable_status_check: boolean;
	block_on_outdated_branch: boolean;
}

export interface ForgejoSecret {
	name: string;
	created_at: string;
}

export interface ForgejoVariable {
	name: string;
	data: string;
}

export interface ForgejoCronTask {
	name: string;
	schedule: string;
	next: string;
	prev: string;
	exec_times: number;
}

export interface ForgejoVersion {
	version: string;
}

export interface ForgejoStats {
	repo_count: number;
	total_size_kb: number;
	public: number;
	private: number;
	mirror: number;
	archived: number;
	fork: number;
	truncated: boolean;
}

export interface ForgejoCollaborator extends ForgejoUser {
	permissions?: {
		admin: boolean;
		push: boolean;
		pull: boolean;
	};
}

export type ForgejoTab =
	| 'overview'
	| 'repos'
	| 'users'
	| 'orgs'
	| 'webhooks'
	| 'issues'
	| 'system';

export interface ForgejoIssue {
	id: number;
	number: number;
	title: string;
	state: 'open' | 'closed';
	is_locked: boolean;
	comments: number;
	created_at: string;
	html_url: string;
	user: { login: string; avatar_url: string };
	pull_request?: { merged: boolean } | null;
}

export interface CreateRepoInput {
	owner: string;
	ownerIsOrg: boolean;
	name: string;
	description: string;
	private: boolean;
	auto_init: boolean;
	default_branch: string;
}

export interface MigrateRepoInput {
	clone_addr: string;
	repo_name: string;
	repo_owner: string;
	mirror: boolean;
	private: boolean;
	description: string;
	auth_token?: string;
}

export interface EditRepoInput {
	description?: string;
	private?: boolean;
	archived?: boolean;
	default_branch?: string;
	has_issues?: boolean;
	has_wiki?: boolean;
	has_pull_requests?: boolean;
}

export interface CreateUserInput {
	username: string;
	email: string;
	password: string;
	must_change_password: boolean;
	visibility: string;
}

export interface EditUserInput {
	email?: string;
	admin?: boolean;
	active?: boolean;
	prohibit_login?: boolean;
	restricted?: boolean;
	max_repo_creation?: number;
}

export interface CreateOrgInput {
	username: string;
	full_name: string;
	description: string;
	visibility: string;
}

export interface EditOrgInput {
	full_name?: string;
	description?: string;
	visibility?: string;
	website?: string;
	location?: string;
}

export interface CreateTeamInput {
	name: string;
	description: string;
	permission: string;
	includes_all_repositories: boolean;
	can_create_org_repo: boolean;
	units: string[];
}

export interface CreateHookInput {
	type: string;
	url: string;
	content_type: string;
	secret: string;
	events: string[];
	active: boolean;
}

export interface CreateReleaseInput {
	tag_name: string;
	target_commitish: string;
	name: string;
	body: string;
	draft: boolean;
	prerelease: boolean;
}

export interface ToastMsg {
	kind: 'success' | 'error' | 'info';
	msg: string;
}

export type NoticeKind = 'info' | 'warn' | 'error';

export interface Notice {
	kind: NoticeKind;
	msg: string;
	detail?: string;
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
const EXPANDED_KEY = 'forgejo:expandedRepo';
const TAB_KEY = 'forgejo:activeTab';
const CACHE_TTL_MS = 60 * 1000;
const PROXY_BASE = '/dashboard/forgejo/proxy';
const API_BASE = '/dashboard/forgejo/api';
const REFRESH_INTERVAL_MS = 30 * 1000;
const PAGE_SIZE = 50;
const RESOURCE_TTL_MS = 60 * 1000;

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

export class ForgejoMutationError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = 'ForgejoMutationError';
		this.status = status;
	}
}

async function apiMutate<T>(
	token: string,
	method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
	path: string,
	body?: unknown,
): Promise<T> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
	};
	const opts: RequestInit = {
		method,
		headers,
		signal: AbortSignal.timeout(15000),
	};
	if (body !== undefined) {
		headers['Content-Type'] = 'application/json';
		opts.body = JSON.stringify(body);
	}

	const resp = await fetch(`${PROXY_BASE}${path}`, opts);
	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		let detail = text.slice(0, 300);
		try {
			const parsed = JSON.parse(text);
			detail = parsed.message ?? parsed.error ?? detail;
		} catch {
			detail = text.slice(0, 300);
		}
		throw new ForgejoMutationError(
			resp.status,
			detail || `Request failed (${resp.status})`,
		);
	}

	const text = await resp.text();
	if (!text || text.trim().length === 0) return {} as T;
	try {
		return JSON.parse(text) as T;
	} catch {
		return {} as T;
	}
}

async function fetchReposPage(
	token: string,
	page: number,
	query: string,
): Promise<ForgejoRepo[]> {
	const q = query ? `&q=${encodeURIComponent(query)}` : '';
	const data = await apiFetch<{ data?: ForgejoRepo[] } | ForgejoRepo[]>(
		token,
		`/api/v1/repos/search?limit=${PAGE_SIZE}&page=${page}&sort=updated${q}`,
	);
	if (Array.isArray(data)) return data;
	return data.data ?? [];
}

async function fetchRepos(token: string): Promise<ForgejoRepo[]> {
	return fetchReposPage(token, 1, '');
}

async function fetchUsersPage(
	token: string,
	page: number,
): Promise<ForgejoUser[] | null> {
	try {
		const resp = await fetch(
			`${API_BASE}/users?page=${page}&limit=${PAGE_SIZE}`,
			{
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(10000),
			},
		);
		if (!resp.ok) return null;
		const data = await resp.json();
		return Array.isArray(data) ? data : null;
	} catch {
		return null;
	}
}

async function fetchUsers(token: string): Promise<ForgejoUser[]> {
	const admin = await fetchUsersPage(token, 1);
	if (Array.isArray(admin) && admin.length > 0) return admin;
	return fetchUsersFromCollaborators(token);
}

async function fetchUsersFromCollaborators(
	token: string,
): Promise<ForgejoUser[]> {
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
	for (const repo of repos) {
		if (repo.owner && !seen.has(repo.owner.id)) {
			seen.add(repo.owner.id);
			users.push(repo.owner as ForgejoUser);
		}
	}
	return users;
}

async function fetchOrgsPage(
	token: string,
	page: number,
): Promise<ForgejoOrg[]> {
	return apiFetch(
		token,
		`/api/v1/orgs?limit=${PAGE_SIZE}&page=${page}`,
		[] as ForgejoOrg[],
	);
}

async function fetchOrgs(token: string): Promise<ForgejoOrg[]> {
	return fetchOrgsPage(token, 1);
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

function loadCache(): Promise<CachedData | null> {
	return cacheGet<CachedData>(CACHE_KEY, CACHE_TTL_MS);
}

function saveCache(
	repos: ForgejoRepo[],
	users: ForgejoUser[],
	orgs: ForgejoOrg[],
): Promise<void> {
	return cacheSet<CachedData>(CACHE_KEY, {
		ts: Date.now(),
		repos,
		users,
		orgs,
	});
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

	public readonly $expandedRepo = persistentAtom<string | null>(
		EXPANDED_KEY,
		null,
		{
			encode: (v) => (v === null ? '' : v),
			decode: (raw) => (raw === '' ? null : raw),
		},
	);
	public readonly $repoDetails = atom<Record<string, RepoDetail>>({});

	// Admin panel state
	public readonly $activeTab = persistentAtom<ForgejoTab>(
		TAB_KEY,
		'overview',
		{
			encode: (v) => v,
			decode: (raw) => (raw as ForgejoTab) || 'overview',
		},
	);
	public readonly $toast = atom<ToastMsg | null>(null);
	public readonly $busy = atom<string | null>(null);
	public readonly $notices = atom<Record<string, Notice>>({});

	public readonly $teams = atom<Record<string, ForgejoTeam[]>>({});
	public readonly $orgMembers = atom<Record<string, ForgejoUser[]>>({});
	public readonly $teamMembers = atom<Record<number, ForgejoUser[]>>({});
	public readonly $collaborators = atom<
		Record<string, ForgejoCollaborator[]>
	>({});

	public readonly $selectedRepo = atom<string | null>(null);
	public readonly $repoHooks = atom<Record<string, ForgejoHook[]>>({});
	public readonly $repoReleases = atom<Record<string, ForgejoRelease[]>>({});
	public readonly $repoProtections = atom<
		Record<string, ForgejoBranchProtection[]>
	>({});
	public readonly $repoSecrets = atom<Record<string, ForgejoSecret[]>>({});
	public readonly $repoVariables = atom<Record<string, ForgejoVariable[]>>(
		{},
	);

	public readonly $version = atom<string | null>(null);
	public readonly $cronTasks = atom<ForgejoCronTask[]>([]);
	public readonly $unadopted = atom<string[]>([]);
	public readonly $stats = atom<ForgejoStats | null>(null);

	public readonly $issueRepo = atom<string | null>(null);
	public readonly $issueState = atom<'open' | 'closed'>('open');
	public readonly $issueType = atom<'issues' | 'pulls'>('issues');
	public readonly $issues = atom<ForgejoIssue[]>([]);
	public readonly $issuesLoading = atom<boolean>(false);

	// Pagination + search
	public readonly $repoQuery = atom<string>('');
	public readonly $reposPage = atom<number>(1);
	public readonly $usersPage = atom<number>(1);
	public readonly $orgsPage = atom<number>(1);
	public readonly $reposHasMore = atom<boolean>(false);
	public readonly $usersHasMore = atom<boolean>(false);
	public readonly $orgsHasMore = atom<boolean>(false);
	public readonly $loadingMore = atom<boolean>(false);

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

	private async _fetchReposRange(
		token: string,
	): Promise<{ items: ForgejoRepo[]; hasMore: boolean }> {
		const pages = this.$reposPage.get();
		const query = this.$repoQuery.get();
		const items: ForgejoRepo[] = [];
		let last = 0;
		for (let p = 1; p <= pages; p++) {
			const batch = await fetchReposPage(token, p, query);
			items.push(...batch);
			last = batch.length;
			if (batch.length < PAGE_SIZE) break;
		}
		return { items, hasMore: last === PAGE_SIZE };
	}

	private async _fetchUsersRange(
		token: string,
	): Promise<{ items: ForgejoUser[]; hasMore: boolean }> {
		const pages = this.$usersPage.get();
		const items: ForgejoUser[] = [];
		let last = 0;
		let adminWorked = false;
		for (let p = 1; p <= pages; p++) {
			const batch = await fetchUsersPage(token, p);
			if (!Array.isArray(batch)) break;
			if (p === 1 && batch.length > 0) adminWorked = true;
			items.push(...batch);
			last = batch.length;
			if (batch.length < PAGE_SIZE) break;
		}
		if (!adminWorked && items.length === 0) {
			const fallback = await fetchUsersFromCollaborators(token);
			return { items: fallback, hasMore: false };
		}
		return { items, hasMore: last === PAGE_SIZE };
	}

	private async _fetchOrgsRange(
		token: string,
	): Promise<{ items: ForgejoOrg[]; hasMore: boolean }> {
		const pages = this.$orgsPage.get();
		const items: ForgejoOrg[] = [];
		let last = 0;
		for (let p = 1; p <= pages; p++) {
			const batch = await fetchOrgsPage(token, p);
			items.push(...batch);
			last = batch.length;
			if (batch.length < PAGE_SIZE) break;
		}
		return { items, hasMore: last === PAGE_SIZE };
	}

	public async fetchData(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;

		try {
			this.$error.set(null);
			this.$errorReason.set(null);
			const [repos, users, orgs] = await Promise.all([
				this._fetchReposRange(token),
				this._fetchUsersRange(token),
				this._fetchOrgsRange(token),
			]);
			this.$repos.set(repos.items);
			this.$reposHasMore.set(repos.hasMore);
			this.$users.set(users.items);
			this.$usersHasMore.set(users.hasMore);
			this.$orgs.set(orgs.items);
			this.$orgsHasMore.set(orgs.hasMore);
			this.$lastUpdated.set(new Date());
			void saveCache(repos.items, users.items, orgs.items);
			void this.fetchStats();
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

	public async fetchStats(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;
		try {
			const resp = await fetch(`${API_BASE}/stats`, {
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(20000),
			});
			if (!resp.ok) return;
			const data = (await resp.json()) as ForgejoStats;
			if (data && typeof data.total_size_kb === 'number') {
				this.$stats.set(data);
			}
		} catch {
			return;
		}
	}

	public async loadCacheAndFetch(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;

		const cached = await loadCache();
		if (cached) {
			this.$repos.set(cached.repos);
			this.$users.set(cached.users);
			this.$orgs.set(cached.orgs ?? []);
			this.$lastUpdated.set(new Date(cached.ts));
			this.$loading.set(false);
		}

		this.fetchData().then(() => {
			const restored = this.$expandedRepo.get();
			if (restored && !this.$repoDetails.get()[restored]) {
				this._fetchRepoDetail(restored);
			}
		});
		this._startAutoRefresh();
	}

	public dispose(): void {
		if (this._refreshInterval) {
			clearInterval(this._refreshInterval);
			this._refreshInterval = undefined;
		}
	}

	public refresh(): void {
		const token = this.$accessToken.get();
		if (token) {
			this.$loading.set(true);
			this.fetchData();
		}
	}

	public setRepoSearch(query: string): void {
		this.$repoQuery.set(query);
		this.$reposPage.set(1);
		const token = this.$accessToken.get();
		if (!token) return;
		this.$loadingMore.set(true);
		this._fetchReposRange(token)
			.then((r) => {
				this.$repos.set(r.items);
				this.$reposHasMore.set(r.hasMore);
			})
			.finally(() => this.$loadingMore.set(false));
	}

	public async loadMoreRepos(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token || this.$loadingMore.get()) return;
		this.$loadingMore.set(true);
		try {
			const next = this.$reposPage.get() + 1;
			const batch = await fetchReposPage(
				token,
				next,
				this.$repoQuery.get(),
			);
			this.$repos.set([...this.$repos.get(), ...batch]);
			this.$reposPage.set(next);
			this.$reposHasMore.set(batch.length === PAGE_SIZE);
		} finally {
			this.$loadingMore.set(false);
		}
	}

	public async loadMoreUsers(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token || this.$loadingMore.get()) return;
		this.$loadingMore.set(true);
		try {
			const next = this.$usersPage.get() + 1;
			const batch = await fetchUsersPage(token, next);
			if (Array.isArray(batch)) {
				this.$users.set([...this.$users.get(), ...batch]);
				this.$usersPage.set(next);
				this.$usersHasMore.set(batch.length === PAGE_SIZE);
			} else {
				this.$usersHasMore.set(false);
			}
		} finally {
			this.$loadingMore.set(false);
		}
	}

	public async loadMoreOrgs(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token || this.$loadingMore.get()) return;
		this.$loadingMore.set(true);
		try {
			const next = this.$orgsPage.get() + 1;
			const batch = await fetchOrgsPage(token, next);
			this.$orgs.set([...this.$orgs.get(), ...batch]);
			this.$orgsPage.set(next);
			this.$orgsHasMore.set(batch.length === PAGE_SIZE);
		} finally {
			this.$loadingMore.set(false);
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

	public setTab(tab: ForgejoTab): void {
		this.$activeTab.set(tab);
	}

	public showToast(kind: ToastMsg['kind'], msg: string): void {
		this.$toast.set({ kind, msg });
		setTimeout(() => {
			if (this.$toast.get()?.msg === msg) this.$toast.set(null);
		}, 4000);
	}

	public dismissToast(): void {
		this.$toast.set(null);
	}

	public setNotice(ctx: string, notice: Notice): void {
		this.$notices.set({ ...this.$notices.get(), [ctx]: notice });
	}

	public clearNotice(ctx: string): void {
		const next = { ...this.$notices.get() };
		if (ctx in next) {
			delete next[ctx];
			this.$notices.set(next);
		}
	}

	private _noticeFor(e: unknown): Notice {
		if (e instanceof AccessRestrictedError) {
			return {
				kind: 'warn',
				msg: 'Access restricted',
				detail: 'The Forgejo token lacks permission for this resource.',
			};
		}
		if (e instanceof UpstreamUnavailableError) {
			return {
				kind: 'error',
				msg: 'Forgejo upstream unreachable',
				detail: e.reason,
			};
		}
		return {
			kind: 'error',
			msg: 'Could not load data',
			detail: e instanceof Error ? e.message : 'Unknown error',
		};
	}

	private async _loadResource<T>(
		ctx: string,
		cacheKey: string,
		path: string,
		apply: (data: T) => void,
		ttl = RESOURCE_TTL_MS,
	): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;
		const cached = await cacheGet<T>(cacheKey, ttl);
		if (cached !== null) apply(cached);
		try {
			const data = await apiFetch<T>(token, path);
			apply(data);
			void cacheSet(cacheKey, data);
			this.clearNotice(ctx);
		} catch (e) {
			if (cached === null) this.setNotice(ctx, this._noticeFor(e));
		}
	}

	private async _run(
		id: string,
		fn: (token: string) => Promise<void>,
		successMsg: string,
	): Promise<boolean> {
		const token = this.$accessToken.get();
		if (!token) return false;
		this.$busy.set(id);
		try {
			await fn(token);
			this.showToast('success', successMsg);
			return true;
		} catch (e: unknown) {
			const msg =
				e instanceof ForgejoMutationError
					? `${e.message} (${e.status})`
					: e instanceof Error
						? e.message
						: 'Action failed';
			this.showToast('error', msg);
			return false;
		} finally {
			this.$busy.set(null);
		}
	}

	// --- Repo actions ---

	public createRepo(input: CreateRepoInput): Promise<boolean> {
		const body = {
			name: input.name,
			description: input.description,
			private: input.private,
			auto_init: input.auto_init,
			default_branch: input.default_branch || 'main',
		};
		const path = input.ownerIsOrg
			? `/api/v1/orgs/${input.owner}/repos`
			: `/api/v1/admin/users/${input.owner}/repos`;
		return this._run(
			'repo-create',
			async (t) => {
				await apiMutate(t, 'POST', path, body);
				await this.fetchData();
			},
			`Repository ${input.owner}/${input.name} created`,
		);
	}

	public migrateRepo(input: MigrateRepoInput): Promise<boolean> {
		return this._run(
			'repo-migrate',
			async (t) => {
				await apiMutate(t, 'POST', '/api/v1/repos/migrate', {
					clone_addr: input.clone_addr,
					repo_name: input.repo_name,
					repo_owner: input.repo_owner,
					mirror: input.mirror,
					private: input.private,
					description: input.description,
					service: 'git',
					...(input.auth_token
						? { auth_token: input.auth_token }
						: {}),
				});
				await this.fetchData();
			},
			`Migration of ${input.repo_name} started`,
		);
	}

	public editRepo(fullName: string, input: EditRepoInput): Promise<boolean> {
		return this._run(
			`repo-edit-${fullName}`,
			async (t) => {
				await apiMutate(t, 'PATCH', `/api/v1/repos/${fullName}`, input);
				await this.fetchData();
			},
			`Repository ${fullName} updated`,
		);
	}

	public deleteRepo(fullName: string): Promise<boolean> {
		return this._run(
			`repo-delete-${fullName}`,
			async (t) => {
				await apiMutate(t, 'DELETE', `/api/v1/repos/${fullName}`);
				await this.fetchData();
			},
			`Repository ${fullName} deleted`,
		);
	}

	public transferRepo(fullName: string, newOwner: string): Promise<boolean> {
		return this._run(
			`repo-transfer-${fullName}`,
			async (t) => {
				await apiMutate(
					t,
					'POST',
					`/api/v1/repos/${fullName}/transfer`,
					{ new_owner: newOwner },
				);
				await this.fetchData();
			},
			`Repository ${fullName} transferred to ${newOwner}`,
		);
	}

	public async loadCollaborators(fullName: string): Promise<void> {
		await this._loadResource<ForgejoCollaborator[]>(
			'collaborators',
			`forgejo:collab:${fullName}`,
			`/api/v1/repos/${fullName}/collaborators?limit=${PAGE_SIZE}`,
			(d) =>
				this.$collaborators.set({
					...this.$collaborators.get(),
					[fullName]: d,
				}),
		);
	}

	public addCollaborator(
		fullName: string,
		user: string,
		permission: string,
	): Promise<boolean> {
		return this._run(
			`collab-add-${fullName}-${user}`,
			async (t) => {
				await apiMutate(
					t,
					'PUT',
					`/api/v1/repos/${fullName}/collaborators/${user}`,
					{ permission },
				);
				await this.loadCollaborators(fullName);
			},
			`${user} added to ${fullName}`,
		);
	}

	public removeCollaborator(
		fullName: string,
		user: string,
	): Promise<boolean> {
		return this._run(
			`collab-remove-${fullName}-${user}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/repos/${fullName}/collaborators/${user}`,
				);
				await this.loadCollaborators(fullName);
			},
			`${user} removed from ${fullName}`,
		);
	}

	// --- User actions ---

	public createUser(input: CreateUserInput): Promise<boolean> {
		return this._run(
			'user-create',
			async (t) => {
				await apiMutate(t, 'POST', '/api/v1/admin/users', input);
				await this.fetchData();
			},
			`User ${input.username} created`,
		);
	}

	public editUser(login: string, input: EditUserInput): Promise<boolean> {
		return this._run(
			`user-edit-${login}`,
			async (t) => {
				await apiMutate(t, 'PATCH', `/api/v1/admin/users/${login}`, {
					login_name: login,
					...input,
				});
				await this.fetchData();
			},
			`User ${login} updated`,
		);
	}

	public deleteUser(login: string, purge: boolean): Promise<boolean> {
		return this._run(
			`user-delete-${login}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/admin/users/${login}?purge=${purge}`,
				);
				await this.fetchData();
			},
			`User ${login} deleted`,
		);
	}

	// --- Org & team actions ---

	public createOrg(input: CreateOrgInput): Promise<boolean> {
		return this._run(
			'org-create',
			async (t) => {
				await apiMutate(t, 'POST', '/api/v1/orgs', input);
				await this.fetchData();
			},
			`Organization ${input.username} created`,
		);
	}

	public editOrg(org: string, input: EditOrgInput): Promise<boolean> {
		return this._run(
			`org-edit-${org}`,
			async (t) => {
				await apiMutate(t, 'PATCH', `/api/v1/orgs/${org}`, input);
				await this.fetchData();
			},
			`Organization ${org} updated`,
		);
	}

	public deleteOrg(org: string): Promise<boolean> {
		return this._run(
			`org-delete-${org}`,
			async (t) => {
				await apiMutate(t, 'DELETE', `/api/v1/orgs/${org}`);
				await this.fetchData();
			},
			`Organization ${org} deleted`,
		);
	}

	public async loadOrgMembers(org: string): Promise<void> {
		await this._loadResource<ForgejoUser[]>(
			'orgs',
			`forgejo:orgmembers:${org}`,
			`/api/v1/orgs/${org}/members?limit=${PAGE_SIZE}`,
			(d) =>
				this.$orgMembers.set({ ...this.$orgMembers.get(), [org]: d }),
		);
	}

	public removeOrgMember(org: string, user: string): Promise<boolean> {
		return this._run(
			`org-member-remove-${org}-${user}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/orgs/${org}/members/${user}`,
				);
				await this.loadOrgMembers(org);
			},
			`${user} removed from ${org}`,
		);
	}

	public async loadTeams(org: string): Promise<void> {
		await this._loadResource<ForgejoTeam[]>(
			'orgs',
			`forgejo:teams:${org}`,
			`/api/v1/orgs/${org}/teams?limit=${PAGE_SIZE}`,
			(d) => this.$teams.set({ ...this.$teams.get(), [org]: d }),
		);
	}

	public createTeam(org: string, input: CreateTeamInput): Promise<boolean> {
		return this._run(
			`team-create-${org}`,
			async (t) => {
				await apiMutate(t, 'POST', `/api/v1/orgs/${org}/teams`, input);
				await this.loadTeams(org);
			},
			`Team ${input.name} created in ${org}`,
		);
	}

	public deleteTeam(org: string, teamId: number): Promise<boolean> {
		return this._run(
			`team-delete-${teamId}`,
			async (t) => {
				await apiMutate(t, 'DELETE', `/api/v1/teams/${teamId}`);
				await this.loadTeams(org);
			},
			`Team deleted`,
		);
	}

	public async loadTeamMembers(teamId: number): Promise<void> {
		await this._loadResource<ForgejoUser[]>(
			'orgs',
			`forgejo:teammembers:${teamId}`,
			`/api/v1/teams/${teamId}/members?limit=${PAGE_SIZE}`,
			(d) =>
				this.$teamMembers.set({
					...this.$teamMembers.get(),
					[teamId]: d,
				}),
		);
	}

	public addTeamMember(teamId: number, user: string): Promise<boolean> {
		return this._run(
			`team-member-add-${teamId}-${user}`,
			async (t) => {
				await apiMutate(
					t,
					'PUT',
					`/api/v1/teams/${teamId}/members/${user}`,
				);
				await this.loadTeamMembers(teamId);
			},
			`${user} added to team`,
		);
	}

	public removeTeamMember(teamId: number, user: string): Promise<boolean> {
		return this._run(
			`team-member-remove-${teamId}-${user}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/teams/${teamId}/members/${user}`,
				);
				await this.loadTeamMembers(teamId);
			},
			`${user} removed from team`,
		);
	}

	// --- Webhook actions ---

	public async loadRepoHooks(fullName: string): Promise<void> {
		await this._loadResource<ForgejoHook[]>(
			'repoAdmin',
			`forgejo:hooks:${fullName}`,
			`/api/v1/repos/${fullName}/hooks?limit=${PAGE_SIZE}`,
			(d) =>
				this.$repoHooks.set({
					...this.$repoHooks.get(),
					[fullName]: d,
				}),
		);
	}

	public createHook(
		fullName: string,
		input: CreateHookInput,
	): Promise<boolean> {
		return this._run(
			`hook-create-${fullName}`,
			async (t) => {
				await apiMutate(t, 'POST', `/api/v1/repos/${fullName}/hooks`, {
					type: input.type,
					active: input.active,
					events: input.events,
					config: {
						url: input.url,
						content_type: input.content_type,
						...(input.secret ? { secret: input.secret } : {}),
					},
				});
				await this.loadRepoHooks(fullName);
			},
			`Webhook created on ${fullName}`,
		);
	}

	public deleteHook(fullName: string, id: number): Promise<boolean> {
		return this._run(
			`hook-delete-${fullName}-${id}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/repos/${fullName}/hooks/${id}`,
				);
				await this.loadRepoHooks(fullName);
			},
			`Webhook deleted`,
		);
	}

	public testHook(fullName: string, id: number): Promise<boolean> {
		return this._run(
			`hook-test-${fullName}-${id}`,
			async (t) => {
				await apiMutate(
					t,
					'POST',
					`/api/v1/repos/${fullName}/hooks/${id}/tests`,
				);
			},
			`Test delivery sent`,
		);
	}

	// --- Release actions ---

	public async loadRepoReleases(fullName: string): Promise<void> {
		await this._loadResource<ForgejoRelease[]>(
			'repoAdmin',
			`forgejo:releases:${fullName}`,
			`/api/v1/repos/${fullName}/releases?limit=20`,
			(d) =>
				this.$repoReleases.set({
					...this.$repoReleases.get(),
					[fullName]: d,
				}),
		);
	}

	public createRelease(
		fullName: string,
		input: CreateReleaseInput,
	): Promise<boolean> {
		return this._run(
			`release-create-${fullName}`,
			async (t) => {
				await apiMutate(
					t,
					'POST',
					`/api/v1/repos/${fullName}/releases`,
					input,
				);
				await this.loadRepoReleases(fullName);
			},
			`Release ${input.tag_name} created`,
		);
	}

	public deleteRelease(fullName: string, id: number): Promise<boolean> {
		return this._run(
			`release-delete-${fullName}-${id}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/repos/${fullName}/releases/${id}`,
				);
				await this.loadRepoReleases(fullName);
			},
			`Release deleted`,
		);
	}

	// --- Branch protection actions ---

	public async loadRepoProtections(fullName: string): Promise<void> {
		await this._loadResource<ForgejoBranchProtection[]>(
			'repoAdmin',
			`forgejo:protections:${fullName}`,
			`/api/v1/repos/${fullName}/branch_protections`,
			(d) =>
				this.$repoProtections.set({
					...this.$repoProtections.get(),
					[fullName]: d,
				}),
		);
	}

	public createProtection(
		fullName: string,
		input: CreateBranchProtectionInput,
	): Promise<boolean> {
		return this._run(
			`protection-create-${fullName}`,
			async (t) => {
				await apiMutate(
					t,
					'POST',
					`/api/v1/repos/${fullName}/branch_protections`,
					input,
				);
				await this.loadRepoProtections(fullName);
			},
			`Protection rule ${input.rule_name} created`,
		);
	}

	public deleteProtection(
		fullName: string,
		ruleName: string,
	): Promise<boolean> {
		return this._run(
			`protection-delete-${fullName}-${ruleName}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/repos/${fullName}/branch_protections/${encodeURIComponent(ruleName)}`,
				);
				await this.loadRepoProtections(fullName);
			},
			`Protection rule deleted`,
		);
	}

	// --- Secrets & variables actions ---

	public async loadRepoSecrets(fullName: string): Promise<void> {
		await this._loadResource<ForgejoSecret[]>(
			'repoAdmin',
			`forgejo:secrets:${fullName}`,
			`/api/v1/repos/${fullName}/actions/secrets?limit=${PAGE_SIZE}`,
			(d) =>
				this.$repoSecrets.set({
					...this.$repoSecrets.get(),
					[fullName]: d,
				}),
		);
	}

	public async loadRepoVariables(fullName: string): Promise<void> {
		await this._loadResource<ForgejoVariable[]>(
			'repoAdmin',
			`forgejo:variables:${fullName}`,
			`/api/v1/repos/${fullName}/actions/variables?limit=${PAGE_SIZE}`,
			(d) =>
				this.$repoVariables.set({
					...this.$repoVariables.get(),
					[fullName]: d,
				}),
		);
	}

	public setSecret(
		fullName: string,
		name: string,
		data: string,
	): Promise<boolean> {
		return this._run(
			`secret-set-${fullName}-${name}`,
			async (t) => {
				await apiMutate(
					t,
					'PUT',
					`/api/v1/repos/${fullName}/actions/secrets/${name}`,
					{ data },
				);
				await this.loadRepoSecrets(fullName);
			},
			`Secret ${name} saved`,
		);
	}

	public deleteSecret(fullName: string, name: string): Promise<boolean> {
		return this._run(
			`secret-delete-${fullName}-${name}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/repos/${fullName}/actions/secrets/${name}`,
				);
				await this.loadRepoSecrets(fullName);
			},
			`Secret deleted`,
		);
	}

	public createVariable(
		fullName: string,
		name: string,
		value: string,
	): Promise<boolean> {
		return this._run(
			`variable-set-${fullName}-${name}`,
			async (t) => {
				await apiMutate(
					t,
					'POST',
					`/api/v1/repos/${fullName}/actions/variables/${name}`,
					{ value },
				);
				await this.loadRepoVariables(fullName);
			},
			`Variable ${name} created`,
		);
	}

	public deleteVariable(fullName: string, name: string): Promise<boolean> {
		return this._run(
			`variable-delete-${fullName}-${name}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/repos/${fullName}/actions/variables/${name}`,
				);
				await this.loadRepoVariables(fullName);
			},
			`Variable deleted`,
		);
	}

	public selectRepo(fullName: string): void {
		this.$selectedRepo.set(fullName);
		this.loadRepoHooks(fullName);
		this.loadRepoReleases(fullName);
		this.loadRepoProtections(fullName);
		this.loadRepoSecrets(fullName);
		this.loadRepoVariables(fullName);
	}

	// --- Issue & PR moderation actions ---

	public selectIssueRepo(fullName: string): void {
		this.$issueRepo.set(fullName);
		this.loadIssues();
	}

	public setIssueState(state: 'open' | 'closed'): void {
		this.$issueState.set(state);
		this.loadIssues();
	}

	public setIssueType(type: 'issues' | 'pulls'): void {
		this.$issueType.set(type);
		this.loadIssues();
	}

	public async loadIssues(): Promise<void> {
		const token = this.$accessToken.get();
		const repo = this.$issueRepo.get();
		if (!token || !repo) return;
		this.$issuesLoading.set(true);
		try {
			const issues = await apiFetch<ForgejoIssue[]>(
				token,
				`/api/v1/repos/${repo}/issues?state=${this.$issueState.get()}&type=${this.$issueType.get()}&limit=${PAGE_SIZE}`,
			);
			this.$issues.set(Array.isArray(issues) ? issues : []);
			this.clearNotice('issues');
		} catch (e) {
			this.$issues.set([]);
			this.setNotice('issues', this._noticeFor(e));
		} finally {
			this.$issuesLoading.set(false);
		}
	}

	public setIssueOpenState(
		index: number,
		state: 'open' | 'closed',
	): Promise<boolean> {
		const repo = this.$issueRepo.get();
		return this._run(
			`issue-state-${index}`,
			async (t) => {
				if (!repo) return;
				await apiMutate(
					t,
					'PATCH',
					`/api/v1/repos/${repo}/issues/${index}`,
					{ state },
				);
				await this.loadIssues();
			},
			state === 'closed' ? `#${index} closed` : `#${index} reopened`,
		);
	}

	public setIssueLock(index: number, lock: boolean): Promise<boolean> {
		const repo = this.$issueRepo.get();
		return this._run(
			`issue-lock-${index}`,
			async (t) => {
				if (!repo) return;
				if (lock) {
					await apiMutate(
						t,
						'PUT',
						`/api/v1/repos/${repo}/issues/${index}/lock`,
						{ lock_reason: 'too heated' },
					);
				} else {
					await apiMutate(
						t,
						'DELETE',
						`/api/v1/repos/${repo}/issues/${index}/lock`,
					);
				}
				await this.loadIssues();
			},
			lock ? `#${index} locked` : `#${index} unlocked`,
		);
	}

	// --- System actions ---

	public async loadSystem(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;
		const [version, cron, unadopted] = await Promise.allSettled([
			apiFetch<ForgejoVersion>(token, '/api/v1/version'),
			apiFetch<ForgejoCronTask[]>(
				token,
				`/api/v1/admin/cron?limit=${PAGE_SIZE}`,
			),
			apiFetch<string[]>(
				token,
				`/api/v1/admin/unadopted?limit=${PAGE_SIZE}`,
			),
		]);
		this.$version.set(
			version.status === 'fulfilled'
				? (version.value.version ?? 'unknown')
				: 'unknown',
		);
		this.$cronTasks.set(
			cron.status === 'fulfilled' && Array.isArray(cron.value)
				? cron.value
				: [],
		);
		this.$unadopted.set(
			unadopted.status === 'fulfilled' && Array.isArray(unadopted.value)
				? unadopted.value
				: [],
		);
		const failed = [version, cron, unadopted].find(
			(r) => r.status === 'rejected',
		);
		if (failed && failed.status === 'rejected') {
			this.setNotice('system', this._noticeFor(failed.reason));
		} else {
			this.clearNotice('system');
		}
	}

	public runCron(task: string): Promise<boolean> {
		return this._run(
			`cron-run-${task}`,
			async (t) => {
				await apiMutate(t, 'POST', `/api/v1/admin/cron/${task}`);
				await this.loadSystem();
			},
			`Cron task ${task} triggered`,
		);
	}

	public adoptUnadopted(fullName: string): Promise<boolean> {
		return this._run(
			`unadopted-adopt-${fullName}`,
			async (t) => {
				await apiMutate(
					t,
					'POST',
					`/api/v1/admin/unadopted/${fullName}`,
				);
				await this.loadSystem();
				await this.fetchData();
			},
			`Adopted ${fullName}`,
		);
	}

	public deleteUnadopted(fullName: string): Promise<boolean> {
		return this._run(
			`unadopted-delete-${fullName}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/admin/unadopted/${fullName}`,
				);
				await this.loadSystem();
			},
			`Deleted unadopted ${fullName}`,
		);
	}
}

export const forgejoService = new ForgejoService();
