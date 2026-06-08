import {
	BOT_MEMBERSHIP_CACHE_TTL_MS,
	CHANNELS_CACHE_TTL_MS,
} from '../constants';
import type { AgentsCtx } from '../ctx';
import type { DiscordForumChannel, GuildChannels, Result } from '../types';

export function makeDiscordBot(ctx: AgentsCtx) {
	const { store, config, endpoints } = ctx;

	async function ensureGuildChannelsLoaded(
		guildId: string,
		force = false,
	): Promise<void> {
		const cur = store.$guildChannels.get()[guildId];
		const fresh =
			!!cur && Date.now() - cur.cached_at < CHANNELS_CACHE_TTL_MS;
		if (fresh && !force) return;
		if (store.$guildChannelsLoading.get()[guildId]) return;
		store.$guildChannelsLoading.set({
			...store.$guildChannelsLoading.get(),
			[guildId]: true,
		});
		store.$guildChannelsError.set({
			...store.$guildChannelsError.get(),
			[guildId]: null,
		});
		const r = await ctx.callJson<GuildChannels>(endpoints.discordBot, {
			command: 'bot.list_channels',
			server_id: guildId,
		});
		const loading = { ...store.$guildChannelsLoading.get() };
		delete loading[guildId];
		store.$guildChannelsLoading.set(loading);
		if (!r.ok) {
			store.$guildChannelsError.set({
				...store.$guildChannelsError.get(),
				[guildId]: r.error,
			});
			return;
		}
		store.$guildChannels.set({
			...store.$guildChannels.get(),
			[guildId]: {
				forums: r.data.forums ?? [],
				texts: r.data.texts ?? [],
				cached_at: Date.now(),
			},
		});
	}

	async function ensureBotMembershipLoaded(
		guildId: string,
		force = false,
	): Promise<void> {
		const cur = store.$botMembership.get()[guildId];
		const fresh =
			!!cur && Date.now() - cur.cached_at < BOT_MEMBERSHIP_CACHE_TTL_MS;
		if (fresh && !force) return;
		if (store.$botMembershipLoading.get()[guildId]) return;
		store.$botMembershipLoading.set({
			...store.$botMembershipLoading.get(),
			[guildId]: true,
		});
		store.$botMembershipError.set({
			...store.$botMembershipError.get(),
			[guildId]: null,
		});
		const r = await ctx.callJson<{ is_member: boolean }>(
			endpoints.discordBot,
			{ command: 'bot.is_member', server_id: guildId },
		);
		const loading = { ...store.$botMembershipLoading.get() };
		delete loading[guildId];
		store.$botMembershipLoading.set(loading);
		if (!r.ok) {
			store.$botMembershipError.set({
				...store.$botMembershipError.get(),
				[guildId]: r.error,
			});
			return;
		}
		store.$botMembership.set({
			...store.$botMembership.get(),
			[guildId]: {
				isMember: !!r.data.is_member,
				cached_at: Date.now(),
			},
		});
	}

	function invalidateBotMembership(guildId: string): void {
		const m = { ...store.$botMembership.get() };
		delete m[guildId];
		store.$botMembership.set(m);
	}

	async function isBotMember(
		guildId: string,
	): Promise<
		| { ok: true; isMember: boolean; joinedAt: string | null }
		| { ok: false; error: string }
	> {
		const r = await ctx.callJson<{
			is_member: boolean;
			joined_at: string | null;
		}>(endpoints.discordBot, {
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

	async function listForumChannels(
		guildId: string,
	): Promise<Result<{ channels: DiscordForumChannel[] }>> {
		const r = await ctx.callJson<{ channels: DiscordForumChannel[] }>(
			endpoints.discordBot,
			{ command: 'bot.list_forum_channels', server_id: guildId },
		);
		if (!r.ok) return r;
		return { ok: true, channels: r.data.channels ?? [] };
	}

	function botInstallUrl(guildId?: string): string | null {
		const clientId = config.discordBotClientId || config.discordClientId;
		if (!clientId || !/^[0-9]{17,20}$/.test(clientId)) return null;
		const perms = '326417847872';
		const scope = 'bot applications.commands';
		const guildParam = guildId
			? `&guild_id=${guildId}&disable_guild_select=true`
			: '';
		return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${perms}&scope=${encodeURIComponent(scope)}${guildParam}`;
	}

	return {
		ensureGuildChannelsLoaded,
		ensureBotMembershipLoaded,
		invalidateBotMembership,
		isBotMember,
		listForumChannels,
		botInstallUrl,
	};
}
