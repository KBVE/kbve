import {
	BOOTSTRAP_COOLDOWN_MS,
	FORCED_REFRESH_COOLDOWN_MS,
	INIT_DEDUP_MS,
} from '../constants';
import {
	extractJwtOwnedGuildIds,
	loadCachedGuilds,
	parseJwtPayload,
} from '../cache';
import type { AgentsCtx } from '../ctx';
import type { AgentsApi } from '../api-types';

export function makeAuth(ctx: AgentsCtx, api: AgentsApi) {
	const { store, config, endpoints, runtime } = ctx;

	async function bootstrapDiscord(providerToken: string): Promise<boolean> {
		const accessToken = store.$accessToken.get();
		if (!accessToken) return false;
		const now = Date.now();
		if (
			runtime.lastBootstrapOk &&
			now - runtime.lastBootstrapAt < BOOTSTRAP_COOLDOWN_MS
		) {
			return true;
		}
		if (runtime.bootstrapInflight) return runtime.bootstrapInflight;
		runtime.bootstrapInflight = (async () => {
			try {
				const resp = await fetch(endpoints.discordBootstrap, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${accessToken}`,
					},
					body: JSON.stringify({ provider_token: providerToken }),
				});
				if (!resp.ok) {
					if (resp.status === 429) {
						runtime.lastBootstrapAt = Date.now();
						runtime.lastBootstrapOk = true;
					}
					return false;
				}
				runtime.lastBootstrapAt = Date.now();
				runtime.lastBootstrapOk = true;
				return true;
			} catch {
				return false;
			} finally {
				runtime.bootstrapInflight = null;
			}
		})();
		return runtime.bootstrapInflight;
	}

	async function forceTokenRefresh(): Promise<boolean> {
		const now = Date.now();
		if (now - runtime.lastForcedRefreshAt < FORCED_REFRESH_COOLDOWN_MS) {
			return false;
		}
		if (runtime.refreshInflight) return runtime.refreshInflight;
		runtime.refreshInflight = (async () => {
			try {
				const accessToken = await config.refreshSession();
				if (!accessToken) {
					console.warn('[agents] refreshSession returned no session');
					return false;
				}
				store.$accessToken.set(accessToken);
				runtime.lastForcedRefreshAt = Date.now();
				return true;
			} catch (e) {
				console.warn('[agents] refreshSession threw:', e);
				return false;
			} finally {
				runtime.refreshInflight = null;
			}
		})();
		return runtime.refreshInflight;
	}

	async function resyncOwnedGuilds(): Promise<boolean> {
		const providerToken = store.$providerToken.get();
		if (!providerToken) return false;
		const ok = await bootstrapDiscord(providerToken);
		if (!ok) return false;
		return await forceTokenRefresh();
	}

	async function runInitAuth(): Promise<void> {
		try {
			const session = await config.loadSession();
			const accessToken = session.accessToken;

			if (!accessToken) {
				store.$authState.set('unauthenticated');
				return;
			}

			store.$accessToken.set(accessToken);

			const jwtPayload = parseJwtPayload(accessToken);
			const userId = (jwtPayload?.['sub'] as string | undefined) ?? null;
			if (userId) store.$userId.set(userId);

			let providerToken: string | null = session.providerToken;
			if (!providerToken) {
				providerToken = config.getDiscordProviderToken();
			}

			if (providerToken) {
				store.$providerToken.set(providerToken);
				store.$authState.set('authenticated');
				const cachedOwned = userId ? loadCachedGuilds(userId) : null;
				if (cachedOwned && cachedOwned.length > 0) {
					store.$guilds.set(cachedOwned);
					if (cachedOwned.length === 1) {
						api.selectGuild(cachedOwned[0].id);
					}
				}
				return;
			}

			const cached = userId ? loadCachedGuilds(userId) : null;
			const jwtIds = extractJwtOwnedGuildIds(accessToken);
			const jwtSet = new Set(jwtIds);

			if (cached && cached.length > 0) {
				const filtered =
					jwtIds.length > 0
						? cached.filter((g) => jwtSet.has(g.id))
						: cached;
				store.$guilds.set(filtered);
				store.$guildsStale.set(true);
				store.$authState.set('authenticated');
				if (filtered.length === 1) {
					api.selectGuild(filtered[0].id);
				}
				return;
			}

			if (jwtIds.length > 0) {
				store.$guilds.set(
					jwtIds.map((id) => ({
						id,
						name: `Guild #${id.slice(-6)}`,
						icon: null,
						owner: true,
						permissions: '0',
					})),
				);
				store.$guildsStale.set(true);
				store.$authState.set('authenticated');
				if (jwtIds.length === 1) api.selectGuild(jwtIds[0]);
				return;
			}

			store.$authState.set('discord_reauth_required');
		} catch {
			store.$authState.set('unauthenticated');
		} finally {
			runtime.lastInitAt = Date.now();
		}
	}

	async function initAuth(force = false): Promise<void> {
		if (!force) {
			if (runtime.initPromise) return runtime.initPromise;
			if (
				runtime.lastInitAt > 0 &&
				Date.now() - runtime.lastInitAt < INIT_DEDUP_MS &&
				store.$authState.get() !== 'loading'
			) {
				return;
			}
		}
		runtime.initPromise = runInitAuth();
		try {
			await runtime.initPromise;
		} finally {
			runtime.initPromise = null;
		}
	}

	async function signInWithDiscord(): Promise<void> {
		try {
			await config.signInWithDiscord();
		} catch (e) {
			config.notify({
				message:
					e instanceof Error ? e.message : 'Discord sign-in failed',
				severity: 'error',
				duration: 5000,
			});
		}
	}

	return { initAuth, resyncOwnedGuilds, signInWithDiscord };
}
