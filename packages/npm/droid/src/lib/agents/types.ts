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

export type { AgentTokenRow, AgentError } from './generated/agents-schema';
export type {
	DiscordshConfig,
	GithubRepoHook,
	WebhookDelivery,
	EventQueueStats,
	FailedEvent,
	PendingEvent,
} from './generated/discordsh-agents-schema';

export interface DiscordForumChannel {
	id: string;
	name: string;
	parent_id: string | null;
	position: number;
}

export interface DiscordChannel {
	id: string;
	name: string;
	parent_id: string | null;
	position: number;
}

export interface GuildChannels {
	forums: DiscordChannel[];
	texts: DiscordChannel[];
}

export interface PatValidation {
	login: string;
	scopes: string[];
	tokenType: string;
}

export interface BackfillResult {
	ok: true;
	upserted: number;
	pages: number;
	rateLimitRemaining: number | null;
}

export interface WebhookInstallResult {
	ok: true;
	installed: boolean;
	alreadyPresent: boolean;
	hookId: number | null;
}

export interface WebhookOpResult {
	ok: true;
	hookId: number;
	at: number;
}

export type Result<T = unknown> =
	| ({ ok: true } & T)
	| { ok: false; error: string };
