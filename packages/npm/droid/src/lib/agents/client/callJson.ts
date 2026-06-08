import type { AgentsCtx, CallJson } from '../ctx';

export function makeCallJson(ctx: AgentsCtx): CallJson {
	return async function callJson<T>(
		url: string,
		body: Record<string, unknown>,
		opts: { retriedAfterResync?: boolean } = {},
	) {
		const accessToken = ctx.store.$accessToken.get();
		if (!accessToken) return { ok: false, error: 'Not authenticated' };
		try {
			const resp = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${accessToken}`,
				},
				body: JSON.stringify(body),
			});
			const text = await resp.text();
			let parsed: unknown;
			try {
				parsed = text.length > 0 ? JSON.parse(text) : {};
			} catch {
				return {
					ok: false,
					error: `HTTP ${resp.status}: ${text.slice(0, 200)}`,
				};
			}
			if (!resp.ok) {
				const b = parsed as {
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
						return ctx.callJson<T>(url, body, {
							retriedAfterResync: true,
						});
					}
				}
				const parts: string[] = [errMsg || `HTTP ${resp.status}`];
				if (b?.sqlstate) parts.push(`sqlstate=${b.sqlstate}`);
				if (b?.hint) parts.push(`hint=${b.hint}`);
				if (b?.context) parts.push(`context=${b.context}`);
				return { ok: false, error: parts.join(' · ') };
			}
			return { ok: true, data: parsed as T };
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : 'Network error',
			};
		}
	};
}
