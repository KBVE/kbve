import { GUILDS_LIVE_TTL_MS } from '../constants';
import { invalidateCachedTokens, saveCachedGuilds } from '../cache';
import type { AgentsCtx } from '../ctx';
import type { AgentsApi } from '../api-types';
import type { DiscordGuild } from '../types';

export function makeGuilds(ctx: AgentsCtx, api: AgentsApi) {
	const { store, config, endpoints, runtime } = ctx;

	function selectGuild(guildId: string): void {
		const current = store.$selectedGuildId.get();
		if (current === guildId) return;
		store.$selectedGuildId.set(guildId);
		void api.loadTokens(guildId);
	}

	async function loadOwnedGuilds(force = false): Promise<void> {
		const providerToken = store.$providerToken.get();
		if (!providerToken) return;

		if (
			!force &&
			runtime.lastGuildFetchAt > 0 &&
			Date.now() - runtime.lastGuildFetchAt < GUILDS_LIVE_TTL_MS &&
			store.$guilds.get().length > 0
		) {
			return;
		}

		if (runtime.guildsAbort) runtime.guildsAbort.abort();
		const abort = new AbortController();
		runtime.guildsAbort = abort;

		store.$guildsLoading.set(true);
		store.$guildsError.set(null);

		try {
			const resp = await fetch(
				`${endpoints.discordApiBase}/users/@me/guilds`,
				{
					headers: { Authorization: `Bearer ${providerToken}` },
					signal: abort.signal,
				},
			);

			if (resp.status === 401) {
				store.$providerToken.set(null);
				store.$guildsStale.set(true);
				try {
					config.clearDiscordProviderToken();
				} catch {
					/* non-fatal */
				}
				store.$guildsError.set(
					'Discord session expired — guild list may be stale. Sign in with Discord to refresh.',
				);
				return;
			}

			if (!resp.ok) {
				const body = await resp.text();
				store.$guildsError.set(
					`Discord API ${resp.status}: ${body.slice(0, 200)}`,
				);
				store.$guildsStale.set(true);
				return;
			}

			const allGuilds = (await resp.json()) as DiscordGuild[];
			const owned = allGuilds.filter((g) => g.owner === true);
			store.$guilds.set(owned);
			store.$guildsStale.set(false);
			runtime.lastGuildFetchAt = Date.now();

			const userId = store.$userId.get();
			if (userId) saveCachedGuilds(userId, owned);

			if (owned.length === 1) {
				selectGuild(owned[0].id);
			}
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') {
				return;
			}
			store.$guildsError.set(
				e instanceof Error
					? e.message
					: 'Failed to load Discord guilds',
			);
			store.$guildsStale.set(true);
		} finally {
			store.$guildsLoading.set(false);
			if (runtime.guildsAbort === abort) runtime.guildsAbort = null;
		}
	}

	async function refreshSelectedGuild(): Promise<void> {
		const guildId = store.$selectedGuildId.get();
		if (!guildId) return;
		const userId = store.$userId.get();
		if (userId) invalidateCachedTokens(userId, guildId);
		await api.loadTokens(guildId, true);
	}

	return { selectGuild, loadOwnedGuilds, refreshSelectedGuild };
}
