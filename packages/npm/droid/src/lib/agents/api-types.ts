import type { AgentsStore } from './state/atoms';
import type {
	AgentTokenRow,
	BackfillResult,
	BotConfigFormDraft,
	DiscordForumChannel,
	DiscordshConfig,
	GithubRepoHook,
	PatValidation,
	Result,
	WebhookInstallResult,
} from './types';

export interface AgentsMethods {
	// auth
	initAuth(force?: boolean): Promise<void>;
	resyncOwnedGuilds(): Promise<boolean>;
	signInWithDiscord(): Promise<void>;

	// guilds
	loadOwnedGuilds(force?: boolean): Promise<void>;
	selectGuild(guildId: string): void;
	refreshSelectedGuild(): Promise<void>;

	// tokens
	loadTokens(guildId: string, force?: boolean): Promise<void>;
	addToken(input: {
		tokenName: string;
		service: string;
		tokenValue: string;
		description?: string | null;
	}): Promise<Result<{ tokenId: string }>>;
	deleteToken(tokenId: string): Promise<Result>;
	peekToken(service: string): Promise<Result<{ value: string | null }>>;
	toggleToken(tokenId: string, isActive: boolean): Promise<Result>;
	hasService(service: string): AgentTokenRow | null;

	// repo allowlist
	getRepoAllowlist(): Promise<
		Result<{ repos: string[]; raw: string | null }>
	>;
	setRepoAllowlist(repos: string[]): Promise<Result>;
	hydrateRepoAllowlistDraft(guildId: string, repos: string[]): void;
	patchRepoAllowlistDraft(guildId: string, repos: string[]): void;
	clearRepoAllowlistDraft(guildId: string): void;
	ensureRepoAllowlistLoaded(
		guildId: string,
		force?: boolean,
	): Promise<Result>;
	saveRepoAllowlistDraft(guildId: string): Promise<Result>;

	// bot config
	getBotConfig(): Promise<Result<{ config: DiscordshConfig }>>;
	setBotConfig(config: DiscordshConfig): Promise<Result>;
	hydrateBotConfigDraft(guildId: string, cfg: DiscordshConfig): void;
	patchBotConfigDraft(
		guildId: string,
		patch: Partial<BotConfigFormDraft>,
	): void;
	clearBotConfigDraft(guildId: string): void;
	ensureBotConfigLoaded(guildId: string, force?: boolean): Promise<Result>;
	saveBotConfigDraft(guildId: string): Promise<Result>;

	// webhook secret drafts
	setWebhookDraft(guildId: string, secret: string | null): void;
	clearWebhookError(guildId: string): void;
	saveWebhookDraft(
		guildId: string,
		tokenName: string,
		description: string,
	): Promise<Result<{ tokenId: string }>>;

	// PAT
	setPatDraft(guildId: string, pat: string): void;
	clearPatState(guildId: string): void;
	validatePatForGuild(guildId: string): Promise<Result>;
	savePatForGuild(
		guildId: string,
		tokenName: string,
	): Promise<Result<{ tokenId: string }>>;
	validateGithubPat(pat: string): Promise<Result<PatValidation>>;

	// backfill
	patchBackfillDraft(
		guildId: string,
		partial: Partial<{ owner: string; repo: string }>,
	): void;
	clearBackfillResult(guildId: string): void;
	runBackfillForGuild(guildId: string): Promise<void>;
	runBackfill(input: {
		owner: string;
		repo: string;
		state?: 'open' | 'closed' | 'all';
		maxPages?: number;
		perPage?: number;
	}): Promise<BackfillResult | { ok: false; error: string }>;

	// webhook install / ping / verify
	setWebhookInstallSelected(guildId: string, repo: string): void;
	clearWebhookInstallResult(guildId: string): void;
	installWebhookForGuild(guildId: string): Promise<void>;
	pingWebhookForGuild(guildId: string): Promise<void>;
	verifyWebhookInstall(guildId: string, repoFull: string): Promise<void>;
	installRepoWebhook(
		guildId: string,
		owner: string,
		repo: string,
	): Promise<WebhookInstallResult | { ok: false; error: string }>;
	pingRepoWebhook(
		guildId: string,
		owner: string,
		repo: string,
	): Promise<
		| { ok: true; hookId: number; url: string }
		| { ok: false; error: string; retryAfterMs?: number }
	>;
	listRepoWebhooks(
		guildId: string,
		owner: string,
		repo: string,
	): Promise<Result<{ expectedUrl: string; hooks: GithubRepoHook[] }>>;
	rotateWebhookForGuild(
		guildId: string,
		owner: string,
		repo: string,
	): Promise<void>;
	deleteWebhookForGuild(
		guildId: string,
		owner: string,
		repo: string,
	): Promise<Result>;
	loadWebhookDeliveries(
		guildId: string,
		owner: string,
		repo: string,
		limit?: number,
	): Promise<void>;
	webhookUrlFor(guildId: string): string;

	// discord bot / channels
	ensureGuildChannelsLoaded(guildId: string, force?: boolean): Promise<void>;
	ensureBotMembershipLoaded(guildId: string, force?: boolean): Promise<void>;
	invalidateBotMembership(guildId: string): void;
	isBotMember(
		guildId: string,
	): Promise<
		| { ok: true; isMember: boolean; joinedAt: string | null }
		| { ok: false; error: string }
	>;
	listForumChannels(
		guildId: string,
	): Promise<Result<{ channels: DiscordForumChannel[] }>>;
	botInstallUrl(guildId?: string): string | null;
	fetchBotInstallUrl(guildId: string): Promise<string | null>;

	// events
	loadEventStats(guildId: string): Promise<void>;
	loadFailedEvents(guildId: string, limit?: number): Promise<void>;
	loadPendingEvents(guildId: string, limit?: number): Promise<void>;
	requeueEvent(
		guildId: string,
		eventId: number,
		reason?: string,
	): Promise<Result>;
}

export type AgentsApi = AgentsStore & AgentsMethods;
