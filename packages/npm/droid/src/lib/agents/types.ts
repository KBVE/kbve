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

export interface AgentTokenRow {
	token_id: string;
	token_name: string;
	service: string;
	description: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string | null;
}

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

export interface WebhookDelivery {
	id: number;
	guid: string;
	delivered_at: string;
	redelivery: boolean;
	duration: number;
	status: string;
	status_code: number;
	event: string;
	action: string | null;
}

export interface EventQueueStats {
	last_delivered_at: string | null;
	last_recorded_at: string | null;
	pending_count: number;
	in_flight_count: number;
	delivered_count: number;
	failed_count: number;
	oldest_pending_at: string | null;
}

export interface FailedEvent {
	id: number;
	owner: string;
	repo: string;
	number: number;
	event_type: string;
	actor: string | null;
	delivery_attempts: number;
	last_error: string | null;
	created_at: string;
	updated_at: string;
}

export interface PendingEvent {
	id: number;
	owner: string;
	repo: string;
	number: number;
	event_type: string;
	actor: string | null;
	delivery_state: number;
	delivery_attempts: number;
	created_at: string;
	claimed_at: string | null;
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
