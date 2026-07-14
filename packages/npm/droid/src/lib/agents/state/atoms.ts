import { atom, type WritableAtom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import type {
	AgentTokenRow,
	AuthState,
	BackfillResult,
	BotConfigFormDraft,
	DiscordGuild,
	EventQueueStats,
	FailedEvent,
	GuildChannels,
	PatValidation,
	PendingEvent,
	WebhookDelivery,
	WebhookInstallResult,
	WebhookOpResult,
} from '../types';

type Fail = { ok: false; error: string };

function jsonPersistent<T>(key: string, fallback: T): WritableAtom<T> {
	return persistentAtom<T>(key, fallback, {
		encode: (v) => JSON.stringify(v),
		decode: (raw) => {
			try {
				return raw ? (JSON.parse(raw) as T) : fallback;
			} catch {
				return fallback;
			}
		},
	});
}

export function createAgentsStore() {
	return {
		$authState: atom<AuthState>('loading'),
		$accessToken: atom<string | null>(null),
		$providerToken: atom<string | null>(null),
		$userId: atom<string | null>(null),

		$guilds: atom<DiscordGuild[]>([]),
		$guildsLoading: atom<boolean>(false),
		$guildsError: atom<string | null>(null),
		$guildsStale: atom<boolean>(false),

		$selectedGuildId: atom<string | null>(null),

		$tokens: atom<AgentTokenRow[]>([]),
		$tokensLoading: atom<boolean>(false),
		$tokensError: atom<string | null>(null),

		$botConfigDrafts: atom<Record<string, BotConfigFormDraft>>({}),
		$botConfigSavingFor: atom<Record<string, boolean>>({}),
		$botConfigErrors: atom<Record<string, string | null>>({}),
		$botConfigLoadedFor: atom<Record<string, boolean>>({}),

		$repoAllowlistDrafts: atom<Record<string, string[]>>({}),
		$repoAllowlistSavingFor: atom<Record<string, boolean>>({}),
		$repoAllowlistErrors: atom<Record<string, string | null>>({}),
		$repoAllowlistLoadedFor: atom<Record<string, boolean>>({}),

		$webhookDrafts: atom<Record<string, string | null>>({}),
		$webhookSavingFor: atom<Record<string, boolean>>({}),
		$webhookErrors: atom<Record<string, string | null>>({}),

		$patDrafts: atom<Record<string, string>>({}),
		$patValidatedFor: atom<Record<string, PatValidation | null>>({}),
		$patValidatingFor: atom<Record<string, boolean>>({}),
		$patSavingFor: atom<Record<string, boolean>>({}),
		$patErrors: atom<Record<string, string | null>>({}),

		$backfillDrafts: atom<Record<string, { owner: string; repo: string }>>(
			{},
		),
		$backfillBusyFor: atom<Record<string, boolean>>({}),
		$backfillResults: atom<Record<string, BackfillResult | Fail | null>>(
			{},
		),

		$webhookInstallSelected: atom<Record<string, string>>({}),
		$webhookInstallBusyFor: atom<Record<string, boolean>>({}),
		$webhookInstallResults: atom<
			Record<string, WebhookInstallResult | Fail | null>
		>({}),
		$webhookPingBusyFor: atom<Record<string, boolean>>({}),
		$webhookPingResults: atom<
			Record<string, WebhookOpResult | Fail | null>
		>({}),

		$guildChannels: jsonPersistent<
			Record<string, GuildChannels & { cached_at: number }>
		>('kbve:agents:guild_channels:v1', {}),
		$guildChannelsLoading: atom<Record<string, boolean>>({}),
		$guildChannelsError: atom<Record<string, string | null>>({}),

		$botMembership: jsonPersistent<
			Record<string, { isMember: boolean; cached_at: number }>
		>('kbve:agents:bot_membership:v1', {}),
		$botMembershipLoading: atom<Record<string, boolean>>({}),
		$botMembershipError: atom<Record<string, string | null>>({}),

		$webhookDeliveries: atom<Record<string, WebhookDelivery[]>>({}),
		$webhookDeliveriesLoading: atom<Record<string, boolean>>({}),
		$webhookDeliveriesError: atom<Record<string, string | null>>({}),

		$webhookRotateBusyFor: atom<Record<string, boolean>>({}),
		$webhookRotateResults: atom<
			Record<string, WebhookOpResult | Fail | null>
		>({}),
		$webhookDeleteBusyFor: atom<Record<string, boolean>>({}),

		$eventStats: atom<Record<string, EventQueueStats>>({}),
		$eventStatsLoading: atom<Record<string, boolean>>({}),
		$failedEvents: atom<Record<string, FailedEvent[]>>({}),
		$failedEventsLoading: atom<Record<string, boolean>>({}),
		$pendingEvents: atom<Record<string, PendingEvent[]>>({}),
		$pendingEventsLoading: atom<Record<string, boolean>>({}),
		$eventRequeueBusyFor: atom<Record<string, boolean>>({}),
	};
}

export type AgentsStore = ReturnType<typeof createAgentsStore>;
