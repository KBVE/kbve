import { atom } from 'nanostores';
import { initSupa, getSupa, SUPABASE_URL } from '@/lib/supa';
import { addToast } from '@kbve/droid';

export type AuthState =
	| 'loading'
	| 'authenticated'
	| 'unauthenticated'
	| 'discord_reauth_required';

export interface DiscordGuild {
	id: string;
	name: string;
	icon: string | null;
	owner: boolean;
	permissions: string;
}

export interface DiscordshConfig {
	default_repo?: string;
	claim_channel_id?: string;
	forum_channel_id?: string;
	noticeboard_channel_id?: string;
	taskboard_channel_id?: string;
	max_assignees?: number;
	mirror_pr_events?: boolean;
	active?: boolean;
}

export interface BotConfigFormDraft {
	default_repo: string;
	claim_channel_id: string;
	forum_channel_id: string;
	noticeboard_channel_id: string;
	taskboard_channel_id: string;
	max_assignees: string;
	mirror_pr_events: boolean;
	active: boolean;
}

export function emptyBotConfigFormDraft(): BotConfigFormDraft {
	return {
		default_repo: '',
		claim_channel_id: '',
		forum_channel_id: '',
		noticeboard_channel_id: '',
		taskboard_channel_id: '',
		max_assignees: '2',
		mirror_pr_events: true,
		active: true,
	};
}

export function botConfigToFormDraft(c: DiscordshConfig): BotConfigFormDraft {
	const base = emptyBotConfigFormDraft();
	return {
		default_repo: c.default_repo ?? base.default_repo,
		claim_channel_id: c.claim_channel_id ?? base.claim_channel_id,
		forum_channel_id: c.forum_channel_id ?? base.forum_channel_id,
		noticeboard_channel_id:
			c.noticeboard_channel_id ?? base.noticeboard_channel_id,
		taskboard_channel_id:
			c.taskboard_channel_id ?? base.taskboard_channel_id,
		max_assignees:
			typeof c.max_assignees === 'number'
				? String(c.max_assignees)
				: base.max_assignees,
		mirror_pr_events:
			typeof c.mirror_pr_events === 'boolean'
				? c.mirror_pr_events
				: base.mirror_pr_events,
		active: typeof c.active === 'boolean' ? c.active : base.active,
	};
}

export function botConfigFromFormDraft(f: BotConfigFormDraft): DiscordshConfig {
	const cfg: DiscordshConfig = {
		mirror_pr_events: f.mirror_pr_events,
		active: f.active,
	};
	if (f.default_repo.trim()) cfg.default_repo = f.default_repo.trim();
	if (f.claim_channel_id.trim())
		cfg.claim_channel_id = f.claim_channel_id.trim();
	if (f.forum_channel_id.trim())
		cfg.forum_channel_id = f.forum_channel_id.trim();
	if (f.noticeboard_channel_id.trim())
		cfg.noticeboard_channel_id = f.noticeboard_channel_id.trim();
	if (f.taskboard_channel_id.trim())
		cfg.taskboard_channel_id = f.taskboard_channel_id.trim();
	const max = parseInt(f.max_assignees, 10);
	if (!Number.isNaN(max) && max > 0) cfg.max_assignees = max;
	return cfg;
}

export interface AgentTokenRow {
	token_id: string;
	token_name: string;
	service: string;
	description: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string | null;
}

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const GUILD_VAULT_URL = `${SUPABASE_URL}/functions/v1/guild-vault`;
const DISCORD_BOOTSTRAP_URL = `${SUPABASE_URL}/functions/v1/discord-bootstrap`;
const DISCORD_BOT_URL = `${SUPABASE_URL}/functions/v1/discord-bot`;
const GH_ADMIN_URL = `${SUPABASE_URL}/functions/v1/gh-admin`;

export interface DiscordForumChannel {
	id: string;
	name: string;
	parent_id: string | null;
	position: number;
}

export interface GithubRepoHook {
	id: number;
	name: string;
	active: boolean;
	events: string[];
	url: string | null;
	is_kbve: boolean;
	updated_at: string;
}
const GUILDS_CACHE_KEY = 'kbve:agents:owned_guilds_cache:v1';
const TOKENS_CACHE_KEY = 'kbve:agents:tokens_cache:v1';
// localStorage cache: offline fallback when Discord can't be reached.
const GUILDS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Live cache: skip the Discord live call within this window. Tuned to
// "long enough to dedupe across rapid ClientRouter swaps + island
// re-mounts; short enough that real changes show up on a refresh".
const GUILDS_LIVE_TTL_MS = 60 * 1000;
const TOKENS_CACHE_TTL_MS = 60 * 1000;
// initAuth dedup: any call within this window of a successful init
// is a no-op. Prevents the screenshot 429 caused by 5 islands
// across two agents pages each firing initAuth in useEffect.
const INIT_DEDUP_MS = 30 * 1000;

interface CachedGuildsBlob {
	user_id: string;
	guilds: DiscordGuild[];
	cached_at: number;
}

function parseJwtPayload(jwt: string): Record<string, unknown> | null {
	try {
		const parts = jwt.split('.');
		if (parts.length < 2) return null;
		const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
		const padded = b64 + '==='.slice((b64.length + 3) % 4);
		const json = atob(padded);
		return JSON.parse(json) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function extractJwtOwnedGuildIds(jwt: string): string[] {
	const payload = parseJwtPayload(jwt);
	if (!payload || !Array.isArray(payload.owned_guilds)) return [];
	return payload.owned_guilds.filter(
		(g): g is string => typeof g === 'string' && /^[0-9]{17,20}$/.test(g),
	);
}

function loadCachedGuilds(userId: string): DiscordGuild[] | null {
	try {
		const raw = localStorage.getItem(GUILDS_CACHE_KEY);
		if (!raw) return null;
		const blob = JSON.parse(raw) as CachedGuildsBlob;
		if (blob.user_id !== userId) return null;
		if (Date.now() - blob.cached_at > GUILDS_CACHE_TTL_MS) return null;
		if (!Array.isArray(blob.guilds)) return null;
		return blob.guilds;
	} catch {
		return null;
	}
}

function saveCachedGuilds(userId: string, guilds: DiscordGuild[]): void {
	try {
		const blob: CachedGuildsBlob = {
			user_id: userId,
			guilds,
			cached_at: Date.now(),
		};
		localStorage.setItem(GUILDS_CACHE_KEY, JSON.stringify(blob));
	} catch {
		// non-fatal
	}
}

interface CachedTokensBlob {
	user_id: string;
	tokens_by_guild: Record<
		string,
		{ tokens: AgentTokenRow[]; cached_at: number }
	>;
}

function loadCachedTokens(
	userId: string,
	guildId: string,
): AgentTokenRow[] | null {
	try {
		const raw = localStorage.getItem(TOKENS_CACHE_KEY);
		if (!raw) return null;
		const blob = JSON.parse(raw) as CachedTokensBlob;
		if (blob.user_id !== userId) return null;
		const entry = blob.tokens_by_guild?.[guildId];
		if (!entry) return null;
		if (Date.now() - entry.cached_at > TOKENS_CACHE_TTL_MS) return null;
		return entry.tokens;
	} catch {
		return null;
	}
}

function saveCachedTokens(
	userId: string,
	guildId: string,
	tokens: AgentTokenRow[],
): void {
	try {
		const raw = localStorage.getItem(TOKENS_CACHE_KEY);
		let blob: CachedTokensBlob;
		try {
			blob = raw
				? (JSON.parse(raw) as CachedTokensBlob)
				: { user_id: userId, tokens_by_guild: {} };
		} catch {
			blob = { user_id: userId, tokens_by_guild: {} };
		}
		if (blob.user_id !== userId) {
			blob = { user_id: userId, tokens_by_guild: {} };
		}
		blob.tokens_by_guild[guildId] = { tokens, cached_at: Date.now() };
		localStorage.setItem(TOKENS_CACHE_KEY, JSON.stringify(blob));
	} catch {
		// non-fatal
	}
}

function invalidateCachedTokens(userId: string, guildId: string): void {
	try {
		const raw = localStorage.getItem(TOKENS_CACHE_KEY);
		if (!raw) return;
		const blob = JSON.parse(raw) as CachedTokensBlob;
		if (blob.user_id !== userId) return;
		if (blob.tokens_by_guild?.[guildId]) {
			delete blob.tokens_by_guild[guildId];
			localStorage.setItem(TOKENS_CACHE_KEY, JSON.stringify(blob));
		}
	} catch {
		// non-fatal
	}
}

class AgentsService {
	public readonly $authState = atom<AuthState>('loading');
	public readonly $accessToken = atom<string | null>(null);
	public readonly $providerToken = atom<string | null>(null);
	public readonly $userId = atom<string | null>(null);

	public readonly $guilds = atom<DiscordGuild[]>([]);
	public readonly $guildsLoading = atom<boolean>(false);
	public readonly $guildsError = atom<string | null>(null);
	public readonly $guildsStale = atom<boolean>(false);

	public readonly $selectedGuildId = atom<string | null>(null);

	public readonly $tokens = atom<AgentTokenRow[]>([]);
	public readonly $tokensLoading = atom<boolean>(false);
	public readonly $tokensError = atom<string | null>(null);

	public readonly $botConfigDrafts = atom<Record<string, BotConfigFormDraft>>(
		{},
	);
	public readonly $botConfigSavingFor = atom<Record<string, boolean>>({});
	public readonly $botConfigErrors = atom<Record<string, string | null>>({});
	public readonly $botConfigLoadedFor = atom<Record<string, boolean>>({});

	public readonly $repoAllowlistDrafts = atom<Record<string, string[]>>({});
	public readonly $repoAllowlistSavingFor = atom<Record<string, boolean>>({});
	public readonly $repoAllowlistErrors = atom<Record<string, string | null>>(
		{},
	);
	public readonly $repoAllowlistLoadedFor = atom<Record<string, boolean>>({});

	// Dedup state — singleton so the cache survives ClientRouter swaps.
	private initPromise: Promise<void> | null = null;
	private lastInitAt = 0;
	private lastGuildFetchAt = 0;
	private guildsAbort: AbortController | null = null;
	private tokensInflight: Map<string, Promise<void>> = new Map();
	private tokensAbort: Map<string, AbortController> = new Map();

	/**
	 * Idempotent across rapid ClientRouter swaps + island re-mounts.
	 * Subsequent calls within INIT_DEDUP_MS of a successful init are
	 * no-ops; concurrent calls share the same in-flight Promise.
	 * Pass `force=true` after a sign-in/sign-out event to bypass.
	 */
	public async initAuth(force = false): Promise<void> {
		if (!force) {
			if (this.initPromise) return this.initPromise;
			if (
				this.lastInitAt > 0 &&
				Date.now() - this.lastInitAt < INIT_DEDUP_MS &&
				this.$authState.get() !== 'loading'
			) {
				return;
			}
		}
		this.initPromise = this.runInitAuth();
		try {
			await this.initPromise;
		} finally {
			this.initPromise = null;
		}
	}

	private async runInitAuth(): Promise<void> {
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

			const jwtPayload = parseJwtPayload(session.access_token as string);
			const userId = (jwtPayload?.sub as string | undefined) ?? null;
			if (userId) this.$userId.set(userId);

			const sessionProviderToken =
				(session as { provider_token?: string | null } | null)
					?.provider_token ?? null;

			let providerToken: string | null = sessionProviderToken;
			if (!providerToken) {
				const { authBridge } =
					await import('@/components/auth/AuthBridge');
				providerToken = authBridge.getDiscordProviderToken();
			}

			if (providerToken) {
				this.$providerToken.set(providerToken);
				this.$authState.set('authenticated');

				// Fire the bootstrap edge fn so the JWT hook picks up
				// fresh owned_guilds on the next mint. Best-effort; a
				// failure here doesn't block the page.
				void this.bootstrapDiscord(providerToken);
				await this.loadOwnedGuilds();
				return;
			}

			// No provider_token. Fall back to JWT claim IDs + cached
			// guild metadata; mark guild list stale so the UI can show
			// a banner. Mutations remain disabled until the user
			// re-OAuths (the mutation paths already gate on
			// $providerToken being set).
			const cached = userId ? loadCachedGuilds(userId) : null;
			const jwtIds = extractJwtOwnedGuildIds(
				session.access_token as string,
			);
			const jwtSet = new Set(jwtIds);

			if (cached && cached.length > 0) {
				const filtered =
					jwtIds.length > 0
						? cached.filter((g) => jwtSet.has(g.id))
						: cached;
				this.$guilds.set(filtered);
				this.$guildsStale.set(true);
				this.$authState.set('authenticated');
				if (filtered.length === 1) {
					this.selectGuild(filtered[0].id);
				}
				return;
			}

			if (jwtIds.length > 0) {
				// JWT claim present but no cached names — render as
				// ID-only placeholders. UI can prompt re-sign-in to
				// hydrate names from Discord.
				this.$guilds.set(
					jwtIds.map((id) => ({
						id,
						name: `Guild #${id.slice(-6)}`,
						icon: null,
						owner: true,
						permissions: '0',
					})),
				);
				this.$guildsStale.set(true);
				this.$authState.set('authenticated');
				if (jwtIds.length === 1) this.selectGuild(jwtIds[0]);
				return;
			}

			// No provider_token, no JWT claim, no cache — truly need
			// Discord re-auth to make progress.
			this.$authState.set('discord_reauth_required');
		} catch {
			this.$authState.set('unauthenticated');
		} finally {
			// Mark init complete regardless of outcome so the dedup
			// window kicks in. If init failed entirely the
			// $authState will be 'unauthenticated' and the next
			// caller's check ($authState !== 'loading') still passes
			// → no infinite retry loop.
			this.lastInitAt = Date.now();
		}
	}

	private async bootstrapDiscord(providerToken: string): Promise<void> {
		const accessToken = this.$accessToken.get();
		if (!accessToken) return;
		try {
			const resp = await fetch(DISCORD_BOOTSTRAP_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${accessToken}`,
				},
				body: JSON.stringify({ provider_token: providerToken }),
			});
			if (!resp.ok) {
				// Non-fatal: the JWT claim path + Discord-live path
				// both still work. Just log so dev tools shows it.
				const text = await resp.text();
				console.warn(
					'[agentsService] discord-bootstrap returned',
					resp.status,
					text.slice(0, 200),
				);
			}
		} catch (e) {
			console.warn('[agentsService] discord-bootstrap threw:', e);
		}
	}

	public async loadOwnedGuilds(force = false): Promise<void> {
		const providerToken = this.$providerToken.get();
		if (!providerToken) return;

		// Skip the Discord call if a successful fetch happened recently
		// AND we already have guilds in state. Critical for surviving
		// rapid ClientRouter swaps without hitting the Discord 429
		// shown in the original bug report. Explicit refresh
		// (force=true) bypasses.
		if (
			!force &&
			this.lastGuildFetchAt > 0 &&
			Date.now() - this.lastGuildFetchAt < GUILDS_LIVE_TTL_MS &&
			this.$guilds.get().length > 0
		) {
			return;
		}

		// Cancel any in-flight request from a prior mount.
		if (this.guildsAbort) this.guildsAbort.abort();
		const abort = new AbortController();
		this.guildsAbort = abort;

		this.$guildsLoading.set(true);
		this.$guildsError.set(null);

		try {
			const resp = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
				headers: { Authorization: `Bearer ${providerToken}` },
				signal: abort.signal,
			});

			if (resp.status === 401) {
				// provider_token expired/invalid. Don't blank the page —
				// flip $providerToken null + mark stale; UI keeps the
				// JWT-claim / cached guild list and mutation buttons
				// disable themselves via their existing
				// !providerToken guards. User re-OAuth refreshes
				// names + re-enables mutations.
				this.$providerToken.set(null);
				this.$guildsStale.set(true);
				try {
					const { authBridge } =
						await import('@/components/auth/AuthBridge');
					authBridge.clearDiscordProviderToken();
				} catch {
					// non-fatal
				}
				this.$guildsError.set(
					'Discord session expired — guild list may be stale. Sign in with Discord to refresh.',
				);
				return;
			}

			if (!resp.ok) {
				const body = await resp.text();
				this.$guildsError.set(
					`Discord API ${resp.status}: ${body.slice(0, 200)}`,
				);
				this.$guildsStale.set(true);
				return;
			}

			const allGuilds = (await resp.json()) as DiscordGuild[];
			const owned = allGuilds.filter((g) => g.owner === true);
			this.$guilds.set(owned);
			this.$guildsStale.set(false);
			this.lastGuildFetchAt = Date.now();

			const userId = this.$userId.get();
			if (userId) saveCachedGuilds(userId, owned);

			if (owned.length === 1) {
				this.selectGuild(owned[0].id);
			}
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') {
				// Component unmounted (or a newer call superseded this
				// one). Don't surface as an error.
				return;
			}
			this.$guildsError.set(
				e instanceof Error
					? e.message
					: 'Failed to load Discord guilds',
			);
			this.$guildsStale.set(true);
		} finally {
			this.$guildsLoading.set(false);
			if (this.guildsAbort === abort) this.guildsAbort = null;
		}
	}

	public selectGuild(guildId: string): void {
		const current = this.$selectedGuildId.get();
		if (current === guildId) return;
		this.$selectedGuildId.set(guildId);
		void this.loadTokens(guildId);
	}

	public async loadTokens(guildId: string, force = false): Promise<void> {
		const accessToken = this.$accessToken.get();
		const providerToken = this.$providerToken.get();
		if (!accessToken || !providerToken) return;

		const userId = this.$userId.get();

		// localStorage cache hit — paint instantly + skip the edge fn
		// hop. Critical for surviving ClientRouter swaps + multi-
		// island re-mounts without spamming guild-vault.
		if (!force && userId) {
			const cached = loadCachedTokens(userId, guildId);
			if (cached) {
				this.$tokens.set(cached);
				this.$tokensError.set(null);
				return;
			}
		}

		// In-flight dedup — concurrent loadTokens for the same guild
		// share a single Promise instead of firing N requests.
		const existing = this.tokensInflight.get(guildId);
		if (!force && existing) return existing;

		const prevAbort = this.tokensAbort.get(guildId);
		if (prevAbort) prevAbort.abort();
		const abort = new AbortController();
		this.tokensAbort.set(guildId, abort);

		this.$tokensLoading.set(true);
		this.$tokensError.set(null);

		const promise = (async () => {
			try {
				const resp = await fetch(GUILD_VAULT_URL, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${accessToken}`,
					},
					body: JSON.stringify({
						command: 'tokens.list_tokens',
						server_id: guildId,
						provider_token: providerToken,
					}),
					signal: abort.signal,
				});

				const text = await resp.text();
				let body: unknown;
				try {
					body = JSON.parse(text);
				} catch {
					this.$tokensError.set(
						`HTTP ${resp.status}: ${text.slice(0, 200)}`,
					);
					return;
				}

				if (!resp.ok) {
					const errMsg =
						(body as { error?: string } | null)?.error ??
						`HTTP ${resp.status}`;
					this.$tokensError.set(errMsg);
					return;
				}

				const rows =
					(body as { tokens?: AgentTokenRow[] } | null)?.tokens ?? [];
				this.$tokens.set(rows);
				if (userId) saveCachedTokens(userId, guildId, rows);
			} catch (e) {
				if (e instanceof DOMException && e.name === 'AbortError') {
					return;
				}
				this.$tokensError.set(
					e instanceof Error ? e.message : 'Failed to load tokens',
				);
			} finally {
				this.$tokensLoading.set(false);
				this.tokensInflight.delete(guildId);
				if (this.tokensAbort.get(guildId) === abort) {
					this.tokensAbort.delete(guildId);
				}
			}
		})();

		this.tokensInflight.set(guildId, promise);
		return promise;
	}

	public async refreshSelectedGuild(): Promise<void> {
		const guildId = this.$selectedGuildId.get();
		if (!guildId) return;
		// Explicit refresh — bypass cache + dedup window.
		const userId = this.$userId.get();
		if (userId) invalidateCachedTokens(userId, guildId);
		await this.loadTokens(guildId, true);
	}

	public async addToken(input: {
		tokenName: string;
		service: string;
		tokenValue: string;
		description?: string | null;
	}): Promise<{ ok: true; tokenId: string } | { ok: false; error: string }> {
		const guildId = this.$selectedGuildId.get();
		const accessToken = this.$accessToken.get();
		const providerToken = this.$providerToken.get();
		if (!guildId || !accessToken || !providerToken) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		const resp = await this.callGuildVault(
			'tokens.set_token',
			accessToken,
			{
				server_id: guildId,
				provider_token: providerToken,
				token_name: input.tokenName,
				service: input.service,
				token_value: input.tokenValue,
				description: input.description ?? null,
			},
		);

		if (!resp.ok) return { ok: false, error: resp.error };
		const tokenId =
			(resp.body as { token_id?: string } | null)?.token_id ?? '';
		await this.refreshSelectedGuild();
		addToast({
			id: `token-add-${Date.now()}`,
			message: `Token "${input.tokenName}" registered.`,
			severity: 'success',
			duration: 3500,
		});
		return { ok: true, tokenId };
	}

	public async deleteToken(
		tokenId: string,
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const guildId = this.$selectedGuildId.get();
		const accessToken = this.$accessToken.get();
		const providerToken = this.$providerToken.get();
		if (!guildId || !accessToken || !providerToken) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		const resp = await this.callGuildVault(
			'tokens.delete_token',
			accessToken,
			{
				server_id: guildId,
				provider_token: providerToken,
				token_id: tokenId,
			},
		);

		if (!resp.ok) return { ok: false, error: resp.error };
		await this.refreshSelectedGuild();
		addToast({
			id: `token-del-${Date.now()}`,
			message: 'Token deleted.',
			severity: 'success',
			duration: 3500,
		});
		return { ok: true };
	}

	public async peekToken(
		service: string,
	): Promise<
		{ ok: true; value: string | null } | { ok: false; error: string }
	> {
		const guildId = this.$selectedGuildId.get();
		const accessToken = this.$accessToken.get();
		const providerToken = this.$providerToken.get();
		if (!guildId || !accessToken || !providerToken) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		const resp = await this.callGuildVault(
			'tokens.peek_token',
			accessToken,
			{
				server_id: guildId,
				provider_token: providerToken,
				service,
			},
		);

		if (!resp.ok) return { ok: false, error: resp.error };
		const value =
			(resp.body as { value?: string | null } | null)?.value ?? null;
		return { ok: true, value };
	}

	public async getRepoAllowlist(): Promise<
		| {
				ok: true;
				repos: string[];
				raw: string | null;
		  }
		| { ok: false; error: string }
	> {
		const r = await this.peekToken('github_repos');
		if (!r.ok) return { ok: false, error: r.error };
		if (!r.value) return { ok: true, repos: [], raw: null };
		try {
			const parsed = JSON.parse(r.value) as { repos?: unknown };
			const repos = Array.isArray(parsed.repos)
				? parsed.repos.filter((x): x is string => typeof x === 'string')
				: [];
			return { ok: true, repos, raw: r.value };
		} catch {
			return { ok: true, repos: [], raw: r.value };
		}
	}

	public async setRepoAllowlist(
		repos: string[],
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const r = await this.addToken({
			tokenName: 'github-repos',
			service: 'github_repos',
			tokenValue: JSON.stringify({ repos }),
			description:
				'Per-guild repo allowlist consumed by gh-webhook and gh-backfill',
		});
		if (!r.ok) return { ok: false, error: r.error };
		return { ok: true };
	}

	public async getBotConfig(): Promise<
		| {
				ok: true;
				config: DiscordshConfig;
		  }
		| { ok: false; error: string }
	> {
		const r = await this.peekToken('discordsh_config');
		if (!r.ok) return { ok: false, error: r.error };
		if (!r.value) return { ok: true, config: {} };
		try {
			const parsed = JSON.parse(r.value) as Record<string, unknown>;
			return { ok: true, config: parsed as DiscordshConfig };
		} catch {
			return { ok: true, config: {} };
		}
	}

	public async setBotConfig(
		config: DiscordshConfig,
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const r = await this.addToken({
			tokenName: 'discordsh-config',
			service: 'discordsh_config',
			tokenValue: JSON.stringify(config),
			description:
				'Per-guild DiscordSH bot config (channels, defaults, toggles)',
		});
		if (!r.ok) return { ok: false, error: r.error };
		return { ok: true };
	}

	public hydrateBotConfigDraft(guildId: string, cfg: DiscordshConfig): void {
		const drafts = this.$botConfigDrafts.get();
		this.$botConfigDrafts.set({
			...drafts,
			[guildId]: botConfigToFormDraft(cfg),
		});
		const loaded = this.$botConfigLoadedFor.get();
		this.$botConfigLoadedFor.set({ ...loaded, [guildId]: true });
	}

	public patchBotConfigDraft(
		guildId: string,
		patch: Partial<BotConfigFormDraft>,
	): void {
		const drafts = this.$botConfigDrafts.get();
		const cur = drafts[guildId] ?? emptyBotConfigFormDraft();
		this.$botConfigDrafts.set({
			...drafts,
			[guildId]: { ...cur, ...patch },
		});
	}

	public clearBotConfigDraft(guildId: string): void {
		const drafts = { ...this.$botConfigDrafts.get() };
		delete drafts[guildId];
		this.$botConfigDrafts.set(drafts);
		const loaded = { ...this.$botConfigLoadedFor.get() };
		delete loaded[guildId];
		this.$botConfigLoadedFor.set(loaded);
	}

	public async ensureBotConfigLoaded(
		guildId: string,
		force = false,
	): Promise<{ ok: true } | { ok: false; error: string }> {
		if (!force && this.$botConfigLoadedFor.get()[guildId]) {
			return { ok: true };
		}
		const r = await this.getBotConfig();
		if (!r.ok) {
			const errs = { ...this.$botConfigErrors.get() };
			errs[guildId] = r.error;
			this.$botConfigErrors.set(errs);
			return r;
		}
		this.hydrateBotConfigDraft(guildId, r.config);
		const errs = { ...this.$botConfigErrors.get() };
		errs[guildId] = null;
		this.$botConfigErrors.set(errs);
		return { ok: true };
	}

	public async saveBotConfigDraft(
		guildId: string,
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const drafts = this.$botConfigDrafts.get();
		const draft = drafts[guildId];
		if (!draft) {
			return { ok: false, error: 'No draft loaded yet' };
		}
		const saving = { ...this.$botConfigSavingFor.get(), [guildId]: true };
		this.$botConfigSavingFor.set(saving);
		const errs = { ...this.$botConfigErrors.get(), [guildId]: null };
		this.$botConfigErrors.set(errs);
		const r = await this.setBotConfig(botConfigFromFormDraft(draft));
		const savingDone = { ...this.$botConfigSavingFor.get() };
		delete savingDone[guildId];
		this.$botConfigSavingFor.set(savingDone);
		if (!r.ok) {
			const errs2 = {
				...this.$botConfigErrors.get(),
				[guildId]: r.error,
			};
			this.$botConfigErrors.set(errs2);
		}
		return r;
	}

	public hydrateRepoAllowlistDraft(guildId: string, repos: string[]): void {
		const drafts = this.$repoAllowlistDrafts.get();
		this.$repoAllowlistDrafts.set({ ...drafts, [guildId]: repos });
		const loaded = this.$repoAllowlistLoadedFor.get();
		this.$repoAllowlistLoadedFor.set({ ...loaded, [guildId]: true });
	}

	public patchRepoAllowlistDraft(guildId: string, repos: string[]): void {
		const drafts = this.$repoAllowlistDrafts.get();
		this.$repoAllowlistDrafts.set({ ...drafts, [guildId]: repos });
	}

	public clearRepoAllowlistDraft(guildId: string): void {
		const drafts = { ...this.$repoAllowlistDrafts.get() };
		delete drafts[guildId];
		this.$repoAllowlistDrafts.set(drafts);
		const loaded = { ...this.$repoAllowlistLoadedFor.get() };
		delete loaded[guildId];
		this.$repoAllowlistLoadedFor.set(loaded);
	}

	public async ensureRepoAllowlistLoaded(
		guildId: string,
		force = false,
	): Promise<{ ok: true } | { ok: false; error: string }> {
		if (!force && this.$repoAllowlistLoadedFor.get()[guildId]) {
			return { ok: true };
		}
		const r = await this.getRepoAllowlist();
		if (!r.ok) {
			const errs = {
				...this.$repoAllowlistErrors.get(),
				[guildId]: r.error,
			};
			this.$repoAllowlistErrors.set(errs);
			return r;
		}
		this.hydrateRepoAllowlistDraft(guildId, r.repos);
		const errs = { ...this.$repoAllowlistErrors.get(), [guildId]: null };
		this.$repoAllowlistErrors.set(errs);
		return { ok: true };
	}

	public async saveRepoAllowlistDraft(
		guildId: string,
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const drafts = this.$repoAllowlistDrafts.get();
		const repos = drafts[guildId];
		if (!repos) {
			return { ok: false, error: 'No draft loaded yet' };
		}
		const saving = {
			...this.$repoAllowlistSavingFor.get(),
			[guildId]: true,
		};
		this.$repoAllowlistSavingFor.set(saving);
		const errs = {
			...this.$repoAllowlistErrors.get(),
			[guildId]: null,
		};
		this.$repoAllowlistErrors.set(errs);
		const r = await this.setRepoAllowlist(repos);
		const savingDone = { ...this.$repoAllowlistSavingFor.get() };
		delete savingDone[guildId];
		this.$repoAllowlistSavingFor.set(savingDone);
		if (!r.ok) {
			const errs2 = {
				...this.$repoAllowlistErrors.get(),
				[guildId]: r.error,
			};
			this.$repoAllowlistErrors.set(errs2);
		}
		return r;
	}

	public async toggleToken(
		tokenId: string,
		isActive: boolean,
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const guildId = this.$selectedGuildId.get();
		const accessToken = this.$accessToken.get();
		const providerToken = this.$providerToken.get();
		if (!guildId || !accessToken || !providerToken) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		const resp = await this.callGuildVault(
			'tokens.toggle_token',
			accessToken,
			{
				server_id: guildId,
				provider_token: providerToken,
				token_id: tokenId,
				is_active: isActive,
			},
		);

		if (!resp.ok) return { ok: false, error: resp.error };
		await this.refreshSelectedGuild();
		return { ok: true };
	}

	private async callGuildVault(
		command: string,
		accessToken: string,
		extra: Record<string, unknown>,
	): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
		try {
			const resp = await fetch(GUILD_VAULT_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${accessToken}`,
				},
				body: JSON.stringify({ command, ...extra }),
			});
			const text = await resp.text();
			let body: unknown;
			try {
				body = JSON.parse(text);
			} catch {
				return {
					ok: false,
					error: `HTTP ${resp.status}: ${text.slice(0, 200)}`,
				};
			}
			if (!resp.ok) {
				const b = body as {
					error?: string;
					sqlstate?: string | null;
					hint?: string | null;
					context?: string | null;
				} | null;
				const parts: string[] = [];
				parts.push(b?.error ?? `HTTP ${resp.status}`);
				if (b?.sqlstate) parts.push(`sqlstate=${b.sqlstate}`);
				if (b?.hint) parts.push(`hint=${b.hint}`);
				if (b?.context) parts.push(`context=${b.context}`);
				return { ok: false, error: parts.join(' · ') };
			}
			return { ok: true, body };
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : 'Network error',
			};
		}
	}

	public hasService(service: string): AgentTokenRow | null {
		const tokens = this.$tokens.get();
		return (
			tokens.find((t) => t.service === service && t.is_active) ??
			tokens.find((t) => t.service === service) ??
			null
		);
	}

	public webhookUrlFor(guildId: string): string {
		return `${SUPABASE_URL}/functions/v1/gh-webhook/${guildId}`;
	}

	private async callJson<T>(
		url: string,
		body: Record<string, unknown>,
	): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
		const accessToken = this.$accessToken.get();
		if (!accessToken) return { ok: false, error: 'Not authenticated' };
		try {
			const resp = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${accessToken}`,
				},
				body: JSON.stringify(body),
			});
			const text = await resp.text();
			let parsed: unknown;
			try {
				parsed = text.length > 0 ? JSON.parse(text) : {};
			} catch {
				return {
					ok: false,
					error: `HTTP ${resp.status}: ${text.slice(0, 200)}`,
				};
			}
			if (!resp.ok) {
				const b = parsed as {
					error?: string;
					sqlstate?: string | null;
					hint?: string | null;
					context?: string | null;
				} | null;
				const parts: string[] = [b?.error ?? `HTTP ${resp.status}`];
				if (b?.sqlstate) parts.push(`sqlstate=${b.sqlstate}`);
				if (b?.hint) parts.push(`hint=${b.hint}`);
				if (b?.context) parts.push(`context=${b.context}`);
				return { ok: false, error: parts.join(' · ') };
			}
			return { ok: true, data: parsed as T };
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : 'Network error',
			};
		}
	}

	public async isBotMember(
		guildId: string,
	): Promise<
		| { ok: true; isMember: boolean; joinedAt: string | null }
		| { ok: false; error: string }
	> {
		const r = await this.callJson<{
			is_member: boolean;
			joined_at: string | null;
		}>(DISCORD_BOT_URL, {
			command: 'bot.is_member',
			server_id: guildId,
		});
		if (!r.ok) return r;
		return {
			ok: true,
			isMember: !!r.data.is_member,
			joinedAt: r.data.joined_at ?? null,
		};
	}

	public async listForumChannels(
		guildId: string,
	): Promise<
		| { ok: true; channels: DiscordForumChannel[] }
		| { ok: false; error: string }
	> {
		const r = await this.callJson<{ channels: DiscordForumChannel[] }>(
			DISCORD_BOT_URL,
			{
				command: 'bot.list_forum_channels',
				server_id: guildId,
			},
		);
		if (!r.ok) return r;
		return { ok: true, channels: r.data.channels ?? [] };
	}

	public async installRepoWebhook(
		guildId: string,
		owner: string,
		repo: string,
	): Promise<
		| {
				ok: true;
				installed: boolean;
				alreadyPresent: boolean;
				hookId: number | null;
		  }
		| { ok: false; error: string }
	> {
		const r = await this.callJson<{
			installed: boolean;
			already_present: boolean;
			hook_id: number | null;
		}>(GH_ADMIN_URL, {
			command: 'webhooks.install',
			server_id: guildId,
			owner,
			repo,
		});
		if (!r.ok) return r;
		return {
			ok: true,
			installed: !!r.data.installed,
			alreadyPresent: !!r.data.already_present,
			hookId: r.data.hook_id ?? null,
		};
	}

	public async listRepoWebhooks(
		guildId: string,
		owner: string,
		repo: string,
	): Promise<
		| {
				ok: true;
				expectedUrl: string;
				hooks: GithubRepoHook[];
		  }
		| { ok: false; error: string }
	> {
		const r = await this.callJson<{
			expected_url: string;
			hooks: GithubRepoHook[];
		}>(GH_ADMIN_URL, {
			command: 'webhooks.list',
			server_id: guildId,
			owner,
			repo,
		});
		if (!r.ok) return r;
		return {
			ok: true,
			expectedUrl: r.data.expected_url,
			hooks: r.data.hooks ?? [],
		};
	}

	public botInstallUrl(guildId?: string): string | null {
		const clientId =
			(import.meta.env.PUBLIC_DISCORD_BOT_CLIENT_ID as
				| string
				| undefined) ??
			(import.meta.env.PUBLIC_DISCORD_CLIENT_ID as string | undefined);
		if (!clientId || !/^[0-9]{17,20}$/.test(clientId)) return null;
		const perms = '326417847872';
		const scope = 'bot applications.commands';
		const guildParam = guildId
			? `&guild_id=${guildId}&disable_guild_select=true`
			: '';
		return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${perms}&scope=${encodeURIComponent(scope)}${guildParam}`;
	}

	public async validateGithubPat(
		pat: string,
	): Promise<
		| { ok: true; login: string; scopes: string[]; tokenType: string }
		| { ok: false; error: string }
	> {
		try {
			const resp = await fetch('https://api.github.com/user', {
				headers: {
					Authorization: `Bearer ${pat}`,
					Accept: 'application/vnd.github+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
			});
			if (resp.status === 401) {
				return { ok: false, error: 'GitHub rejected the token (401).' };
			}
			if (!resp.ok) {
				return {
					ok: false,
					error: `GitHub /user returned ${resp.status}.`,
				};
			}
			const user = (await resp.json()) as { login?: string };
			if (!user.login) {
				return { ok: false, error: 'GitHub response missing login.' };
			}
			const scopesHeader = resp.headers.get('x-oauth-scopes') ?? '';
			const tokenTypeHeader =
				resp.headers.get('x-github-authentication-token-type') ??
				resp.headers.get('x-github-token-type') ??
				'unknown';
			const scopes = scopesHeader
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			return {
				ok: true,
				login: user.login,
				scopes,
				tokenType: tokenTypeHeader,
			};
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : 'Network error',
			};
		}
	}

	public async runBackfill(input: {
		owner: string;
		repo: string;
		state?: 'open' | 'closed' | 'all';
		maxPages?: number;
		perPage?: number;
	}): Promise<
		| {
				ok: true;
				upserted: number;
				pages: number;
				rateLimitRemaining: number | null;
		  }
		| { ok: false; error: string }
	> {
		const accessToken = this.$accessToken.get();
		const guildId = this.$selectedGuildId.get();
		if (!accessToken || !guildId) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		try {
			const resp = await fetch(
				`${SUPABASE_URL}/functions/v1/gh-backfill`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${accessToken}`,
					},
					body: JSON.stringify({
						owner: input.owner,
						repo: input.repo,
						guild_id: guildId,
						state: input.state ?? 'open',
						max_pages: input.maxPages ?? 1,
						per_page: input.perPage ?? 30,
					}),
				},
			);
			const text = await resp.text();
			let body: unknown;
			try {
				body = JSON.parse(text);
			} catch {
				return {
					ok: false,
					error: `HTTP ${resp.status}: ${text.slice(0, 200)}`,
				};
			}
			if (!resp.ok) {
				const errMsg =
					(body as { error?: string } | null)?.error ??
					`HTTP ${resp.status}`;
				return { ok: false, error: errMsg };
			}
			const b = body as {
				upserted?: number;
				pages_walked?: number;
				rate_limit_remaining?: number | null;
			};
			return {
				ok: true,
				upserted: b.upserted ?? 0,
				pages: b.pages_walked ?? 0,
				rateLimitRemaining: b.rate_limit_remaining ?? null,
			};
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : 'Network error',
			};
		}
	}

	public async signInWithDiscord(): Promise<void> {
		try {
			const { authBridge } = await import('@/components/auth/AuthBridge');
			await authBridge.signInWithOAuth('discord');
		} catch (e) {
			addToast({
				id: `discord-signin-err-${Date.now()}`,
				message:
					e instanceof Error ? e.message : 'Discord sign-in failed',
				severity: 'error',
				duration: 5000,
			});
		}
	}
}

export const agentsService = new AgentsService();
