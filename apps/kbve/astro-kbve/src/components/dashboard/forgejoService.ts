import { atom, computed } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import { initSupa, getSupa } from '@/lib/supa';
import { cacheGet, cacheSet, cacheDel } from '@/lib/idb-cache';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthState =
	| 'loading'
	| 'authenticated'
	| 'unauthenticated'
	| 'forbidden';

// Wire types now come from the proto-generated barrel (single source of truth:
// packages/data/proto/git/forgejo.proto). UI-only shapes (RepoDetail,
// ForgejoCollaborator, inputs, tabs, toast) stay defined here.
import type {
	ForgejoOwner,
	ForgejoRepo,
	ForgejoUser,
	ForgejoOrg,
	ForgejoBranch,
	ForgejoBranchCommit,
	ForgejoCommit,
	ForgejoCommitDetail,
	ForgejoRelease,
	ForgejoReleaseAsset,
	ForgejoInternalTracker,
	ForgejoTeam,
	ForgejoHook,
	ForgejoBranchProtection,
	ForgejoSecret,
	ForgejoVariable,
	ForgejoCronTask,
	ForgejoVersion,
	ForgejoStats,
	ForgejoStorage,
	ForgejoIssue,
	ForgejoLabel,
	ForgejoMilestone,
	ForgejoComment,
	ForgejoPackage,
	ForgejoPublicKey,
	ForgejoGpgKey,
	ForgejoPull,
	ForgejoTag,
} from '@/data/schema/forgejo';

export type {
	ForgejoOwner,
	ForgejoRepo,
	ForgejoUser,
	ForgejoOrg,
	ForgejoBranch,
	ForgejoBranchCommit,
	ForgejoCommit,
	ForgejoCommitDetail,
	ForgejoRelease,
	ForgejoReleaseAsset,
	ForgejoInternalTracker,
	ForgejoTeam,
	ForgejoHook,
	ForgejoBranchProtection,
	ForgejoSecret,
	ForgejoVariable,
	ForgejoCronTask,
	ForgejoVersion,
	ForgejoStats,
	ForgejoStorage,
	ForgejoIssue,
	ForgejoLabel,
	ForgejoMilestone,
	ForgejoComment,
	ForgejoPackage,
	ForgejoPublicKey,
	ForgejoGpgKey,
	ForgejoPull,
	ForgejoTag,
};

export interface ForgejoContentEntry {
	name: string;
	path: string;
	type: string;
	size: number;
	sha: string;
	encoding?: string;
	content?: string;
	download_url?: string | null;
	html_url?: string | null;
}

export interface OpenFile {
	path: string;
	sha: string;
	text: string;
	tooLarge: boolean;
	binary: boolean;
}

export interface RepoDetail {
	branches: ForgejoBranch[];
	commits: ForgejoCommit[];
	releases: ForgejoRelease[];
	languages: Record<string, number>;
	loading: boolean;
}

export interface CreateBranchProtectionInput {
	rule_name: string;
	required_approvals: number;
	enable_push: boolean;
	require_signed_commits: boolean;
	enable_status_check: boolean;
	block_on_outdated_branch: boolean;
}

export type ForgejoCollaborator = ForgejoUser & {
	permissions?: {
		admin: boolean;
		push: boolean;
		pull: boolean;
	};
};

export type ForgejoTab =
	| 'overview'
	| 'repos'
	| 'users'
	| 'orgs'
	| 'webhooks'
	| 'issues'
	| 'packages'
	| 'files'
	| 'runners'
	| 'system';

export interface CreateTagInput {
	tag_name: string;
	target: string;
	message: string;
}

export interface CreateUserKeyInput {
	title: string;
	key: string;
	read_only: boolean;
}

export interface CreateLabelInput {
	name: string;
	color: string;
	description: string;
}

export interface CreateMilestoneInput {
	title: string;
	description: string;
	due_on?: string;
}

export type PullMergeMethod = 'merge' | 'rebase' | 'rebase-merge' | 'squash';

export interface EditPullInput {
	title?: string;
	body?: string;
}

export interface ForgejoRunner {
	id?: number;
	name?: string;
	status?: string;
	labels?: string[];
	[key: string]: unknown;
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

export type StorageHealthStatus =
	| 'ok'
	| 'schema_drift'
	| 'access_denied'
	| 'db_error'
	| 'unconfigured'
	| 'unknown';

export interface ForgejoStorageHealth {
	status: StorageHealthStatus;
	detail: string | null;
}

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
const API_BASE = '/dashboard/forgejo/api';
const REFRESH_INTERVAL_MS = 30 * 1000;
const MANUAL_REFRESH_COOLDOWN_MS = 10 * 1000;

// Maps a Forgejo `/api/v1/...` path (the shape every call site still uses) onto
// the typed axum surface at /dashboard/forgejo/api/*: strip the v1 prefix and
// rename the routes that the typed layer shortened. Lets the whole service ride
// the typed routes (normalised errors, server-side aggregation, policy) without
// touching call sites.
function toTypedPath(path: string): string {
	let p = path.startsWith('/api/v1') ? path.slice('/api/v1'.length) : path;
	p = p
		.replace('/admin/users', '/users')
		.replace('/admin/cron', '/cron')
		.replace('/admin/unadopted', '/unadopted')
		.replace('/actions/secrets', '/secrets')
		.replace('/actions/variables', '/variables')
		.replace('/branch_protections', '/protections');
	return p;
}
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
	const resp = await fetch(`${API_BASE}${toTypedPath(path)}`, {
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

	const resp = await fetch(`${API_BASE}${toTypedPath(path)}`, opts);
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

	await invalidateDataCache();

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

// Every IndexedDB key this service writes (the aggregate plus each per-resource
// list). Tracked so a mutation can wipe the exact set of stale entries instead
// of waiting out their TTL or guessing at a key prefix (UI prefs share the
// `forgejo:` namespace and must survive).
const dataCacheKeys = new Set<string>([CACHE_KEY]);

// Drop every cached read so the next load refetches from upstream. Awaited at
// the mutation chokepoint, so the reload that follows a write sees an empty
// cache and shows fresh data with no stale flash.
async function invalidateDataCache(): Promise<void> {
	await Promise.all([...dataCacheKeys].map((k) => cacheDel(k)));
}

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

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const kb = bytes / 1024;
	if (kb < 1024) return `${kb.toFixed(1)} KB`;
	const mb = kb / 1024;
	if (mb < 1024) return `${mb.toFixed(1)} MB`;
	return `${(mb / 1024).toFixed(2)} GB`;
}

const MAX_EDIT_BYTES = 512 * 1024;

function decodeBase64ToText(b64: string): { text: string; binary: boolean } {
	try {
		const bin = atob(b64.replace(/\s/g, ''));
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		if (bytes.includes(0)) return { text: '', binary: true };
		return {
			text: new TextDecoder('utf-8', { fatal: false }).decode(bytes),
			binary: false,
		};
	} catch {
		return { text: '', binary: true };
	}
}

function encodeTextToBase64(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let bin = '';
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin);
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
	public readonly $repoTags = atom<Record<string, ForgejoTag[]>>({});

	// File browser
	public readonly $filesRepo = atom<string | null>(null);
	public readonly $filesPath = atom<string>('');
	public readonly $filesEntries = atom<ForgejoContentEntry[]>([]);
	public readonly $filesLoading = atom<boolean>(false);
	public readonly $openFile = atom<OpenFile | null>(null);

	public readonly $version = atom<string | null>(null);
	public readonly $cronTasks = atom<ForgejoCronTask[]>([]);
	public readonly $unadopted = atom<string[]>([]);
	public readonly $stats = atom<ForgejoStats | null>(null);
	public readonly $storage = atom<ForgejoStorage | null>(null);
	public readonly $storageHealth = atom<ForgejoStorageHealth | null>(null);
	public readonly $runners = atom<ForgejoRunner[]>([]);
	public readonly $runnerToken = atom<string | null>(null);
	public readonly $runnerScope = atom<string>('instance');

	public readonly $issueRepo = atom<string | null>(null);
	public readonly $issueState = atom<'open' | 'closed'>('open');
	public readonly $issueType = atom<'issues' | 'pulls'>('issues');
	public readonly $issues = atom<ForgejoIssue[]>([]);
	public readonly $issuesLoading = atom<boolean>(false);
	public readonly $issueComments = atom<Record<number, ForgejoComment[]>>({});
	public readonly $pullDetails = atom<Record<number, ForgejoPull>>({});
	public readonly $repoLabels = atom<Record<string, ForgejoLabel[]>>({});
	public readonly $repoMilestones = atom<Record<string, ForgejoMilestone[]>>(
		{},
	);

	// User keys
	public readonly $userKeys = atom<Record<string, ForgejoPublicKey[]>>({});
	public readonly $userGpgKeys = atom<Record<string, ForgejoGpgKey[]>>({});
	public readonly $userKeysLoading = atom<boolean>(false);

	// Packages
	public readonly $packagesOwner = atom<string | null>(null);
	public readonly $packages = atom<Record<string, ForgejoPackage[]>>({});
	public readonly $packagesLoading = atom<boolean>(false);

	// Team repositories
	public readonly $teamRepos = atom<Record<number, ForgejoRepo[]>>({});

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
	private _lastManualRefresh = 0;
	private _authUnsub: (() => void) | undefined;

	// --- Auth ---

	public async initAuth(): Promise<void> {
		try {
			await initSupa();
			const supa = getSupa();

			if (!this._authUnsub) {
				this._authUnsub = supa.on('auth', (payload: unknown) => {
					const session = (
						payload as {
							session?: { access_token?: string };
						} | null
					)?.session;
					this._applySession(session ?? null);
				});
			}

			const sessionResult = await supa.getSession().catch(() => null);
			const session = sessionResult?.session ?? null;
			this._applySession(session);
		} catch {
			this.$authState.set('unauthenticated');
		}
	}

	private _applySession(session: { access_token?: string } | null): void {
		const token = session?.access_token;
		if (!token) {
			this.$accessToken.set(null);
			this.$authState.set('unauthenticated');
			return;
		}
		this.$accessToken.set(token);
		if (this.$authState.get() !== 'forbidden') {
			this.$authState.set('authenticated');
		}
	}

	private async _ensureFreshToken(): Promise<string | null> {
		try {
			const sessionResult = await getSupa()
				.getSession()
				.catch(() => null);
			const token = sessionResult?.session?.access_token ?? null;
			if (token) this.$accessToken.set(token as string);
			return token ?? this.$accessToken.get();
		} catch {
			return this.$accessToken.get();
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

	public async fetchData(force = false): Promise<void> {
		const token = await this._ensureFreshToken();
		if (!token) {
			this.$authState.set('unauthenticated');
			return;
		}

		this.$error.set(null);
		this.$errorReason.set(null);

		const [reposR, usersR, orgsR] = await Promise.allSettled([
			this._fetchReposRange(token),
			this._fetchUsersRange(token),
			this._fetchOrgsRange(token),
		]);

		const reasons = [reposR, usersR, orgsR]
			.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
			.map((r) => r.reason);

		// Session-expiry and upstream-down are dashboard-wide; surface globally.
		if (
			reasons.some(
				(e) => e instanceof Error && /API error: 401/.test(e.message),
			)
		) {
			this.$accessToken.set(null);
			this.$authState.set('unauthenticated');
			this.$error.set('Session expired — please sign in again.');
			this.$loading.set(false);
			return;
		}
		const upstream = reasons.find(
			(e) => e instanceof UpstreamUnavailableError,
		) as UpstreamUnavailableError | undefined;
		if (upstream) {
			this.$error.set(upstream.message);
			this.$errorReason.set(upstream.reason);
			this.$loading.set(false);
			return;
		}
		// Only a total lockout (every resource restricted) flips the whole
		// dashboard to forbidden; a single restricted resource keeps the rest.
		const restricted = reasons.filter(
			(e) => e instanceof AccessRestrictedError,
		).length;
		if (restricted === 3) {
			this.$authState.set('forbidden');
			this.$loading.set(false);
			return;
		}

		this._applyResource(reposR, 'repos', (v) => {
			this.$repos.set(v.items);
			this.$reposHasMore.set(v.hasMore);
		});
		this._applyResource(usersR, 'users', (v) => {
			this.$users.set(v.items);
			this.$usersHasMore.set(v.hasMore);
		});
		this._applyResource(orgsR, 'orgs', (v) => {
			this.$orgs.set(v.items);
			this.$orgsHasMore.set(v.hasMore);
		});

		if (
			reposR.status === 'fulfilled' &&
			usersR.status === 'fulfilled' &&
			orgsR.status === 'fulfilled'
		) {
			void saveCache(
				reposR.value.items,
				usersR.value.items,
				orgsR.value.items,
			);
		}
		this.$lastUpdated.set(new Date());
		void this.fetchStats(force);
		void this.fetchStorage(force);
		void this.fetchStorageHealth();
		this.$loading.set(false);
	}

	private _applyResource<T>(
		result: PromiseSettledResult<T>,
		ctx: string,
		apply: (value: T) => void,
	): void {
		if (result.status === 'fulfilled') {
			this.clearNotice(ctx);
			apply(result.value);
		} else {
			this.setNotice(ctx, this._noticeFor(result.reason));
		}
	}

	public async fetchStats(force = false): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;
		try {
			const resp = await fetch(
				`${API_BASE}/stats${force ? '?force=1' : ''}`,
				{
					headers: { Authorization: `Bearer ${token}` },
					signal: AbortSignal.timeout(20000),
				},
			);
			if (!resp.ok) return;
			const data = (await resp.json()) as ForgejoStats;
			if (data && typeof data.total_size_kb === 'number') {
				this.$stats.set(data);
			}
		} catch {
			return;
		}
	}

	public async fetchStorage(force = false): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;
		try {
			const resp = await fetch(
				`${API_BASE}/storage${force ? '?force=1' : ''}`,
				{
					headers: { Authorization: `Bearer ${token}` },
					signal: AbortSignal.timeout(30000),
				},
			);
			if (!resp.ok) return;
			const data = (await resp.json()) as ForgejoStorage;
			if (data && typeof data.total_bytes === 'number') {
				this.$storage.set(data);
			}
		} catch {
			return;
		}
	}

	public async fetchStorageHealth(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;
		try {
			const resp = await fetch(`${API_BASE}/storage/health`, {
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(15000),
			});
			const data = (await resp
				.json()
				.catch(() => null)) as ForgejoStorageHealth | null;
			if (data && typeof data.status === 'string') {
				this.$storageHealth.set(data);
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
		if (this._authUnsub) {
			this._authUnsub();
			this._authUnsub = undefined;
		}
	}

	public refresh(): void {
		const token = this.$accessToken.get();
		if (!token) return;
		const now = Date.now();
		const since = now - this._lastManualRefresh;
		if (since < MANUAL_REFRESH_COOLDOWN_MS) {
			const wait = Math.ceil((MANUAL_REFRESH_COOLDOWN_MS - since) / 1000);
			this.showToast('info', `Refresh cooling down, wait ${wait}s`);
			return;
		}
		this._lastManualRefresh = now;
		this.showToast('info', 'Refreshing repository cache…');
		this.$loading.set(true);
		void invalidateDataCache().then(() => this.fetchData(true));
	}

	public manualRefreshCooldownMs(): number {
		return Math.max(
			0,
			MANUAL_REFRESH_COOLDOWN_MS - (Date.now() - this._lastManualRefresh),
		);
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
		dataCacheKeys.add(cacheKey);
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

	public async loadTeamRepos(teamId: number): Promise<void> {
		await this._loadResource<ForgejoRepo[]>(
			'orgs',
			`forgejo:teamrepos:${teamId}`,
			`/api/v1/teams/${teamId}/repos?limit=${PAGE_SIZE}`,
			(d) =>
				this.$teamRepos.set({ ...this.$teamRepos.get(), [teamId]: d }),
		);
	}

	public addTeamRepo(
		teamId: number,
		org: string,
		repo: string,
	): Promise<boolean> {
		return this._run(
			`team-repo-add-${teamId}-${repo}`,
			async (t) => {
				await apiMutate(
					t,
					'PUT',
					`/api/v1/teams/${teamId}/repos/${org}/${repo}`,
				);
				await this.loadTeamRepos(teamId);
			},
			`${org}/${repo} added to team`,
		);
	}

	public removeTeamRepo(
		teamId: number,
		org: string,
		repo: string,
	): Promise<boolean> {
		return this._run(
			`team-repo-remove-${teamId}-${repo}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/teams/${teamId}/repos/${org}/${repo}`,
				);
				await this.loadTeamRepos(teamId);
			},
			`${org}/${repo} removed from team`,
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

	public deleteReleaseAsset(
		fullName: string,
		releaseId: number,
		assetId: number,
	): Promise<boolean> {
		return this._run(
			`asset-delete-${fullName}-${releaseId}-${assetId}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/repos/${fullName}/releases/${releaseId}/assets/${assetId}`,
				);
				await this.loadRepoReleases(fullName);
			},
			`Asset deleted`,
		);
	}

	// --- Tag actions ---

	public async loadRepoTags(fullName: string): Promise<void> {
		await this._loadResource<ForgejoTag[]>(
			'repoAdmin',
			`forgejo:tags:${fullName}`,
			`/api/v1/repos/${fullName}/tags?limit=${PAGE_SIZE}`,
			(d) =>
				this.$repoTags.set({
					...this.$repoTags.get(),
					[fullName]: d,
				}),
		);
	}

	public createTag(
		fullName: string,
		input: CreateTagInput,
	): Promise<boolean> {
		return this._run(
			`tag-create-${fullName}`,
			async (t) => {
				const body: Record<string, unknown> = {
					tag_name: input.tag_name,
				};
				if (input.target) body.target = input.target;
				if (input.message) body.message = input.message;
				await apiMutate(
					t,
					'POST',
					`/api/v1/repos/${fullName}/tags`,
					body,
				);
				await this.loadRepoTags(fullName);
			},
			`Tag ${input.tag_name} created`,
		);
	}

	public deleteTag(fullName: string, tag: string): Promise<boolean> {
		return this._run(
			`tag-delete-${fullName}-${tag}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/repos/${fullName}/tags/${encodeURIComponent(tag)}`,
				);
				await this.loadRepoTags(fullName);
			},
			`Tag ${tag} deleted`,
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
		this.loadRepoTags(fullName);
	}

	// --- Issue & PR moderation actions ---

	public selectIssueRepo(fullName: string): void {
		this.$issueRepo.set(fullName);
		this.loadIssues();
		this.loadRepoLabels();
		this.loadRepoMilestones();
	}

	public async loadIssueComments(index: number): Promise<void> {
		const token = this.$accessToken.get();
		const repo = this.$issueRepo.get();
		if (!token || !repo) return;
		const data = await apiFetch<ForgejoComment[]>(
			token,
			`/api/v1/repos/${repo}/issues/${index}/comments?limit=${PAGE_SIZE}`,
			[] as ForgejoComment[],
		);
		this.$issueComments.set({
			...this.$issueComments.get(),
			[index]: Array.isArray(data) ? data : [],
		});
	}

	public addIssueComment(index: number, body: string): Promise<boolean> {
		const repo = this.$issueRepo.get();
		return this._run(
			`issue-comment-${index}`,
			async (t) => {
				if (!repo) return;
				await apiMutate(
					t,
					'POST',
					`/api/v1/repos/${repo}/issues/${index}/comments`,
					{ body },
				);
				await this.loadIssueComments(index);
			},
			`Comment added to #${index}`,
		);
	}

	public async loadRepoLabels(): Promise<void> {
		const token = this.$accessToken.get();
		const repo = this.$issueRepo.get();
		if (!token || !repo) return;
		const data = await apiFetch<ForgejoLabel[]>(
			token,
			`/api/v1/repos/${repo}/labels?limit=${PAGE_SIZE}`,
			[] as ForgejoLabel[],
		);
		this.$repoLabels.set({
			...this.$repoLabels.get(),
			[repo]: Array.isArray(data) ? data : [],
		});
	}

	public createLabel(input: CreateLabelInput): Promise<boolean> {
		const repo = this.$issueRepo.get();
		return this._run(
			`label-create-${repo}`,
			async (t) => {
				if (!repo) return;
				await apiMutate(t, 'POST', `/api/v1/repos/${repo}/labels`, {
					name: input.name,
					color: input.color,
					description: input.description,
				});
				await this.loadRepoLabels();
			},
			`Label ${input.name} created`,
		);
	}

	public deleteLabel(id: number): Promise<boolean> {
		const repo = this.$issueRepo.get();
		return this._run(
			`label-delete-${id}`,
			async (t) => {
				if (!repo) return;
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/repos/${repo}/labels/${id}`,
				);
				await this.loadRepoLabels();
			},
			`Label deleted`,
		);
	}

	public async loadRepoMilestones(): Promise<void> {
		const token = this.$accessToken.get();
		const repo = this.$issueRepo.get();
		if (!token || !repo) return;
		const data = await apiFetch<ForgejoMilestone[]>(
			token,
			`/api/v1/repos/${repo}/milestones?state=all&limit=${PAGE_SIZE}`,
			[] as ForgejoMilestone[],
		);
		this.$repoMilestones.set({
			...this.$repoMilestones.get(),
			[repo]: Array.isArray(data) ? data : [],
		});
	}

	public createMilestone(input: CreateMilestoneInput): Promise<boolean> {
		const repo = this.$issueRepo.get();
		return this._run(
			`milestone-create-${repo}`,
			async (t) => {
				if (!repo) return;
				const body: Record<string, unknown> = {
					title: input.title,
					description: input.description,
				};
				if (input.due_on) body.due_on = input.due_on;
				await apiMutate(
					t,
					'POST',
					`/api/v1/repos/${repo}/milestones`,
					body,
				);
				await this.loadRepoMilestones();
			},
			`Milestone ${input.title} created`,
		);
	}

	public deleteMilestone(id: number): Promise<boolean> {
		const repo = this.$issueRepo.get();
		return this._run(
			`milestone-delete-${id}`,
			async (t) => {
				if (!repo) return;
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/repos/${repo}/milestones/${id}`,
				);
				await this.loadRepoMilestones();
			},
			`Milestone deleted`,
		);
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

	public async loadPull(index: number): Promise<void> {
		const token = this.$accessToken.get();
		const repo = this.$issueRepo.get();
		if (!token || !repo) return;
		try {
			const pull = await apiFetch<ForgejoPull>(
				token,
				`/api/v1/repos/${repo}/pulls/${index}`,
			);
			if (pull && typeof pull.number === 'number') {
				this.$pullDetails.set({
					...this.$pullDetails.get(),
					[index]: pull,
				});
			}
		} catch {
			return;
		}
	}

	public mergePull(
		index: number,
		method: PullMergeMethod,
		deleteBranch: boolean,
	): Promise<boolean> {
		const repo = this.$issueRepo.get();
		return this._run(
			`pull-merge-${index}`,
			async (t) => {
				if (!repo) return;
				await apiMutate(
					t,
					'POST',
					`/api/v1/repos/${repo}/pulls/${index}/merge`,
					{ Do: method, delete_branch_after_merge: deleteBranch },
				);
				await this.loadPull(index);
				await this.loadIssues();
			},
			`#${index} merged (${method})`,
		);
	}

	public editPull(index: number, input: EditPullInput): Promise<boolean> {
		const repo = this.$issueRepo.get();
		return this._run(
			`pull-edit-${index}`,
			async (t) => {
				if (!repo) return;
				await apiMutate(
					t,
					'PATCH',
					`/api/v1/repos/${repo}/pulls/${index}`,
					input,
				);
				await this.loadPull(index);
				await this.loadIssues();
			},
			`#${index} updated`,
		);
	}

	// --- Actions runners ---

	private _runnerListPath(scope: string): string | null {
		if (scope === 'instance') return null;
		if (scope.startsWith('org:')) return `/orgs/${scope.slice(4)}/runners`;
		return `/repos/${scope}/runners`;
	}

	private _runnerTokenPath(scope: string): string {
		if (scope === 'instance') return '/admin/runners/registration-token';
		if (scope.startsWith('org:'))
			return `/orgs/${scope.slice(4)}/runners/registration-token`;
		return `/repos/${scope}/runners/registration-token`;
	}

	public setRunnerScope(scope: string): void {
		this.$runnerScope.set(scope);
		this.$runnerToken.set(null);
		this.loadRunners();
	}

	public async loadRunners(): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;
		const path = this._runnerListPath(this.$runnerScope.get());
		if (!path) {
			this.$runners.set([]);
			return;
		}
		try {
			const resp = await fetch(`${API_BASE}${path}`, {
				headers: { Authorization: `Bearer ${token}` },
				signal: AbortSignal.timeout(15000),
			});
			if (!resp.ok) {
				this.$runners.set([]);
				return;
			}
			const data = await resp.json();
			const arr = Array.isArray(data)
				? data
				: Array.isArray(data?.runners)
					? data.runners
					: [];
			this.$runners.set(arr as ForgejoRunner[]);
		} catch {
			this.$runners.set([]);
		}
	}

	public genRunnerToken(): Promise<boolean> {
		const path = this._runnerTokenPath(this.$runnerScope.get());
		return this._run(
			'runner-token',
			async (t) => {
				const resp = await fetch(`${API_BASE}${path}`, {
					method: 'POST',
					headers: { Authorization: `Bearer ${t}` },
					signal: AbortSignal.timeout(15000),
				});
				if (!resp.ok) {
					throw new ForgejoMutationError(
						resp.status,
						`Token request failed (${resp.status})`,
					);
				}
				const data = await resp.json();
				this.$runnerToken.set(data?.token ?? null);
			},
			'Runner registration token generated',
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

	// --- User key actions ---

	public async loadUserKeys(login: string): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;
		this.$userKeysLoading.set(true);
		try {
			const [keys, gpg] = await Promise.all([
				apiFetch<ForgejoPublicKey[]>(
					token,
					`/api/v1/users/${login}/keys?limit=${PAGE_SIZE}`,
					[] as ForgejoPublicKey[],
				),
				apiFetch<ForgejoGpgKey[]>(
					token,
					`/api/v1/users/${login}/gpg_keys?limit=${PAGE_SIZE}`,
					[] as ForgejoGpgKey[],
				),
			]);
			this.$userKeys.set({
				...this.$userKeys.get(),
				[login]: Array.isArray(keys) ? keys : [],
			});
			this.$userGpgKeys.set({
				...this.$userGpgKeys.get(),
				[login]: Array.isArray(gpg) ? gpg : [],
			});
		} finally {
			this.$userKeysLoading.set(false);
		}
	}

	public addUserKey(
		login: string,
		input: CreateUserKeyInput,
	): Promise<boolean> {
		return this._run(
			`userkey-add-${login}`,
			async (t) => {
				await apiMutate(t, 'POST', `/api/v1/users/${login}/keys`, {
					title: input.title,
					key: input.key,
					read_only: input.read_only,
				});
				await this.loadUserKeys(login);
			},
			`SSH key added for ${login}`,
		);
	}

	public deleteUserKey(login: string, id: number): Promise<boolean> {
		return this._run(
			`userkey-delete-${login}-${id}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/users/${login}/keys/${id}`,
				);
				await this.loadUserKeys(login);
			},
			`SSH key removed`,
		);
	}

	// --- Package actions ---

	public async loadPackages(owner: string): Promise<void> {
		const token = this.$accessToken.get();
		if (!token) return;
		this.$packagesOwner.set(owner);
		this.$packagesLoading.set(true);
		try {
			const data = await apiFetch<ForgejoPackage[]>(
				token,
				`/api/v1/packages/${owner}?limit=${PAGE_SIZE}&page=1`,
			);
			this.$packages.set({
				...this.$packages.get(),
				[owner]: Array.isArray(data) ? data : [],
			});
			this.clearNotice('packages');
		} catch (e) {
			this.setNotice('packages', this._noticeFor(e));
		} finally {
			this.$packagesLoading.set(false);
		}
	}

	public deletePackage(owner: string, pkg: ForgejoPackage): Promise<boolean> {
		return this._run(
			`pkg-delete-${owner}-${pkg.type}-${pkg.name}-${pkg.version}`,
			async (t) => {
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/packages/${owner}/${pkg.type}/${encodeURIComponent(
						pkg.name,
					)}/${encodeURIComponent(pkg.version)}`,
				);
				await this.loadPackages(owner);
			},
			`Package ${pkg.name}@${pkg.version} deleted`,
		);
	}

	// --- File browser actions ---

	public selectFilesRepo(fullName: string): void {
		this.$filesRepo.set(fullName);
		this.$openFile.set(null);
		void this.navigateDir('');
	}

	public async navigateDir(path: string): Promise<void> {
		const token = this.$accessToken.get();
		const repo = this.$filesRepo.get();
		if (!token || !repo) return;
		this.$openFile.set(null);
		this.$filesPath.set(path);
		this.$filesLoading.set(true);
		try {
			const data = await apiFetch<
				ForgejoContentEntry[] | ForgejoContentEntry
			>(token, `/api/v1/repos/${repo}/contents/${path}`);
			const entries = Array.isArray(data) ? data : data ? [data] : [];
			entries.sort((a, b) => {
				if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
			this.$filesEntries.set(entries);
			this.clearNotice('files');
		} catch (e) {
			this.$filesEntries.set([]);
			this.setNotice('files', this._noticeFor(e));
		} finally {
			this.$filesLoading.set(false);
		}
	}

	public async openFile(entry: ForgejoContentEntry): Promise<void> {
		const token = this.$accessToken.get();
		const repo = this.$filesRepo.get();
		if (!token || !repo) return;
		this.$filesLoading.set(true);
		try {
			const data = await apiFetch<ForgejoContentEntry>(
				token,
				`/api/v1/repos/${repo}/contents/${entry.path}`,
			);
			const tooLarge = (data.size ?? 0) > MAX_EDIT_BYTES;
			let text = '';
			let binary = false;
			if (!tooLarge && data.content) {
				const decoded = decodeBase64ToText(data.content);
				text = decoded.text;
				binary = decoded.binary;
			}
			this.$openFile.set({
				path: data.path,
				sha: data.sha,
				text,
				tooLarge,
				binary,
			});
		} catch (e) {
			this.setNotice('files', this._noticeFor(e));
		} finally {
			this.$filesLoading.set(false);
		}
	}

	public closeFile(): void {
		this.$openFile.set(null);
	}

	public saveFile(
		path: string,
		sha: string,
		text: string,
		message: string,
	): Promise<boolean> {
		const repo = this.$filesRepo.get();
		return this._run(
			`file-save-${path}`,
			async (t) => {
				if (!repo) return;
				await apiMutate(
					t,
					'PUT',
					`/api/v1/repos/${repo}/contents/${path}`,
					{
						content: encodeTextToBase64(text),
						message: message || `Update ${path}`,
						sha,
					},
				);
				await this.navigateDir(this.$filesPath.get());
			},
			`Saved ${path}`,
		);
	}

	public createFile(
		name: string,
		text: string,
		message: string,
	): Promise<boolean> {
		const repo = this.$filesRepo.get();
		const dir = this.$filesPath.get();
		const path = dir ? `${dir}/${name}` : name;
		return this._run(
			`file-create-${path}`,
			async (t) => {
				if (!repo) return;
				await apiMutate(
					t,
					'POST',
					`/api/v1/repos/${repo}/contents/${path}`,
					{
						content: encodeTextToBase64(text),
						message: message || `Create ${path}`,
					},
				);
				await this.navigateDir(dir);
			},
			`Created ${path}`,
		);
	}

	public deleteFile(
		entry: ForgejoContentEntry,
		message: string,
	): Promise<boolean> {
		const repo = this.$filesRepo.get();
		return this._run(
			`file-delete-${entry.path}`,
			async (t) => {
				if (!repo) return;
				await apiMutate(
					t,
					'DELETE',
					`/api/v1/repos/${repo}/contents/${entry.path}`,
					{
						message: message || `Delete ${entry.path}`,
						sha: entry.sha,
					},
				);
				await this.navigateDir(this.$filesPath.get());
			},
			`Deleted ${entry.path}`,
		);
	}
}

export const forgejoService = new ForgejoService();
