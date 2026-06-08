import { addToast } from '../state/toasts';
import type { ToastSeverity } from '../types/ui-event-types';

export interface AgentsNotice {
	message: string;
	severity: ToastSeverity;
	duration?: number;
}

export interface AgentsSession {
	accessToken: string | null;
	providerToken: string | null;
}

export interface AgentsConfig {
	supabaseUrl: string;
	discordBotClientId?: string;
	discordClientId?: string;

	loadSession(): Promise<AgentsSession>;
	refreshSession(): Promise<string | null>;

	getDiscordProviderToken(): string | null;
	clearDiscordProviderToken(): void;

	signInWithDiscord(): Promise<void>;

	notify?(notice: AgentsNotice): void;
}

export interface ResolvedAgentsConfig extends Required<
	Omit<AgentsConfig, 'notify'>
> {
	notify(notice: AgentsNotice): void;
}

function defaultNotify(notice: AgentsNotice): void {
	addToast({
		id: `agents-${notice.severity}-${Date.now()}`,
		message: notice.message,
		severity: notice.severity,
		duration: notice.duration ?? 3500,
	});
}

export function resolveAgentsConfig(
	config: AgentsConfig,
): ResolvedAgentsConfig {
	return {
		supabaseUrl: config.supabaseUrl.replace(/\/$/, ''),
		discordBotClientId: config.discordBotClientId ?? '',
		discordClientId: config.discordClientId ?? '',
		loadSession: config.loadSession,
		refreshSession: config.refreshSession,
		getDiscordProviderToken: config.getDiscordProviderToken,
		clearDiscordProviderToken: config.clearDiscordProviderToken,
		signInWithDiscord: config.signInWithDiscord,
		notify: config.notify ?? defaultNotify,
	};
}

export interface AgentsEndpoints {
	discordApiBase: string;
	guildVault: string;
	discordBootstrap: string;
	discordBot: string;
	ghAdmin: string;
	ghBackfill: string;
	ghWebhookBase: string;
}

export function buildEndpoints(supabaseUrl: string): AgentsEndpoints {
	const base = supabaseUrl.replace(/\/$/, '');
	return {
		discordApiBase: 'https://discord.com/api/v10',
		guildVault: `${base}/functions/v1/guild-vault`,
		discordBootstrap: `${base}/functions/v1/discord-bootstrap`,
		discordBot: `${base}/functions/v1/discord-bot`,
		ghAdmin: `${base}/functions/v1/gh-admin`,
		ghBackfill: `${base}/functions/v1/gh-backfill`,
		ghWebhookBase: `${base}/functions/v1/gh-webhook`,
	};
}
