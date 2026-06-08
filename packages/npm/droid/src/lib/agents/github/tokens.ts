import { loadCachedTokens, saveCachedTokens } from '../cache';
import type { AgentsCtx } from '../ctx';
import type { AgentsApi } from '../api-types';
import type { AgentTokenRow, Result } from '../types';

export function makeTokens(ctx: AgentsCtx, api: AgentsApi) {
	const { store, config, endpoints, runtime } = ctx;

	async function loadTokens(guildId: string, force = false): Promise<void> {
		const accessToken = store.$accessToken.get();
		const providerToken = store.$providerToken.get();
		if (!accessToken || !providerToken) return;

		const userId = store.$userId.get();

		if (!force && userId) {
			const cached = loadCachedTokens(userId, guildId);
			if (cached) {
				store.$tokens.set(cached);
				store.$tokensError.set(null);
				return;
			}
		}

		const existing = runtime.tokensInflight.get(guildId);
		if (!force && existing) return existing;

		const prevAbort = runtime.tokensAbort.get(guildId);
		if (prevAbort) prevAbort.abort();
		const abort = new AbortController();
		runtime.tokensAbort.set(guildId, abort);

		store.$tokensLoading.set(true);
		store.$tokensError.set(null);

		const promise = (async () => {
			try {
				const resp = await fetch(endpoints.guildVault, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${accessToken}`,
					},
					body: JSON.stringify({
						command: 'tokens.list_tokens',
						server_id: guildId,
					}),
					signal: abort.signal,
				});

				const text = await resp.text();
				let body: unknown;
				try {
					body = JSON.parse(text);
				} catch {
					store.$tokensError.set(
						`HTTP ${resp.status}: ${text.slice(0, 200)}`,
					);
					return;
				}

				if (!resp.ok) {
					const errMsg =
						(body as { error?: string } | null)?.error ??
						`HTTP ${resp.status}`;
					store.$tokensError.set(errMsg);
					return;
				}

				const rows =
					(body as { tokens?: AgentTokenRow[] } | null)?.tokens ?? [];
				store.$tokens.set(rows);
				if (userId) saveCachedTokens(userId, guildId, rows);
			} catch (e) {
				if (e instanceof DOMException && e.name === 'AbortError') {
					return;
				}
				store.$tokensError.set(
					e instanceof Error ? e.message : 'Failed to load tokens',
				);
			} finally {
				store.$tokensLoading.set(false);
				runtime.tokensInflight.delete(guildId);
				if (runtime.tokensAbort.get(guildId) === abort) {
					runtime.tokensAbort.delete(guildId);
				}
			}
		})();

		runtime.tokensInflight.set(guildId, promise);
		return promise;
	}

	async function addToken(input: {
		tokenName: string;
		service: string;
		tokenValue: string;
		description?: string | null;
	}): Promise<Result<{ tokenId: string }>> {
		const guildId = store.$selectedGuildId.get();
		const accessToken = store.$accessToken.get();
		if (!guildId || !accessToken) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		const resp = await ctx.callGuildVault('tokens.set_token', accessToken, {
			server_id: guildId,
			token_name: input.tokenName,
			service: input.service,
			token_value: input.tokenValue,
			description: input.description ?? null,
		});

		if (!resp.ok) return { ok: false, error: resp.error };
		const tokenId =
			(resp.body as { token_id?: string } | null)?.token_id ?? '';
		await api.refreshSelectedGuild();
		config.notify({
			message: `Token "${input.tokenName}" registered.`,
			severity: 'success',
			duration: 3500,
		});
		return { ok: true, tokenId };
	}

	async function deleteToken(tokenId: string): Promise<Result> {
		const guildId = store.$selectedGuildId.get();
		const accessToken = store.$accessToken.get();
		if (!guildId || !accessToken) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		const resp = await ctx.callGuildVault(
			'tokens.delete_token',
			accessToken,
			{ server_id: guildId, token_id: tokenId },
		);

		if (!resp.ok) return { ok: false, error: resp.error };
		await api.refreshSelectedGuild();
		config.notify({
			message: 'Token deleted.',
			severity: 'success',
			duration: 3500,
		});
		return { ok: true };
	}

	async function peekToken(
		service: string,
	): Promise<Result<{ value: string | null }>> {
		const guildId = store.$selectedGuildId.get();
		const accessToken = store.$accessToken.get();
		if (!guildId || !accessToken) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		const resp = await ctx.callGuildVault(
			'tokens.peek_token',
			accessToken,
			{
				server_id: guildId,
				service,
			},
		);

		if (!resp.ok) return { ok: false, error: resp.error };
		const value =
			(resp.body as { value?: string | null } | null)?.value ?? null;
		return { ok: true, value };
	}

	async function toggleToken(
		tokenId: string,
		isActive: boolean,
	): Promise<Result> {
		const guildId = store.$selectedGuildId.get();
		const accessToken = store.$accessToken.get();
		if (!guildId || !accessToken) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		const resp = await ctx.callGuildVault(
			'tokens.toggle_token',
			accessToken,
			{ server_id: guildId, token_id: tokenId, is_active: isActive },
		);

		if (!resp.ok) return { ok: false, error: resp.error };
		await api.refreshSelectedGuild();
		return { ok: true };
	}

	function hasService(service: string): AgentTokenRow | null {
		const tokens = store.$tokens.get();
		return (
			tokens.find((t) => t.service === service && t.is_active) ??
			tokens.find((t) => t.service === service) ??
			null
		);
	}

	return {
		loadTokens,
		addToken,
		deleteToken,
		peekToken,
		toggleToken,
		hasService,
	};
}
