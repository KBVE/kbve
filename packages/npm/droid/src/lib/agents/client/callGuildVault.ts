import type { AgentsCtx, CallGuildVault } from '../ctx';

export function makeCallGuildVault(ctx: AgentsCtx): CallGuildVault {
	return async function callGuildVault(
		command: string,
		accessToken: string,
		extra: Record<string, unknown>,
		opts: { retriedAfterResync?: boolean } = {},
	) {
		try {
			const resp = await fetch(ctx.endpoints.guildVault, {
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
				const errMsg = b?.error ?? '';
				const looksStale =
					resp.status === 403 &&
					/owned_guilds/i.test(errMsg) &&
					!opts.retriedAfterResync;
				if (looksStale) {
					const resynced = await ctx.resyncOwnedGuilds();
					if (resynced) {
						const newToken = ctx.store.$accessToken.get();
						if (newToken) {
							return ctx.callGuildVault(
								command,
								newToken,
								extra,
								{
									retriedAfterResync: true,
								},
							);
						}
					}
				}
				const parts: string[] = [errMsg || `HTTP ${resp.status}`];
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
	};
}
