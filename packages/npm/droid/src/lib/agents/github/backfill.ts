import type { AgentsCtx } from '../ctx';
import type { BackfillResult } from '../types';

type Fail = { ok: false; error: string };

export function makeBackfill(ctx: AgentsCtx) {
	const { store, endpoints } = ctx;

	function patchBackfillDraft(
		guildId: string,
		partial: Partial<{ owner: string; repo: string }>,
	): void {
		const drafts = store.$backfillDrafts.get();
		const cur = drafts[guildId] ?? { owner: '', repo: '' };
		store.$backfillDrafts.set({
			...drafts,
			[guildId]: { ...cur, ...partial },
		});
	}

	function clearBackfillResult(guildId: string): void {
		const m = { ...store.$backfillResults.get() };
		delete m[guildId];
		store.$backfillResults.set(m);
	}

	async function runBackfill(input: {
		owner: string;
		repo: string;
		state?: 'open' | 'closed' | 'all';
		maxPages?: number;
		perPage?: number;
	}): Promise<BackfillResult | Fail> {
		const accessToken = store.$accessToken.get();
		const guildId = store.$selectedGuildId.get();
		if (!accessToken || !guildId) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		try {
			const resp = await fetch(endpoints.ghBackfill, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${accessToken}`,
				},
				body: JSON.stringify({
					owner: input.owner,
					repo: input.repo,
					guild_id: guildId,
					state: input.state ?? 'open',
					max_pages: input.maxPages ?? 1,
					per_page: input.perPage ?? 30,
				}),
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
				const errMsg =
					(body as { error?: string } | null)?.error ??
					`HTTP ${resp.status}`;
				return { ok: false, error: errMsg };
			}
			const b = body as {
				upserted?: number;
				pages_walked?: number;
				rate_limit_remaining?: number | null;
			};
			return {
				ok: true,
				upserted: b.upserted ?? 0,
				pages: b.pages_walked ?? 0,
				rateLimitRemaining: b.rate_limit_remaining ?? null,
			};
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : 'Network error',
			};
		}
	}

	async function runBackfillForGuild(guildId: string): Promise<void> {
		const draft = store.$backfillDrafts.get()[guildId] ?? {
			owner: '',
			repo: '',
		};
		if (!draft.owner || !draft.repo) return;
		store.$backfillBusyFor.set({
			...store.$backfillBusyFor.get(),
			[guildId]: true,
		});
		const resultsClear = { ...store.$backfillResults.get() };
		delete resultsClear[guildId];
		store.$backfillResults.set(resultsClear);
		const r = await runBackfill({
			owner: draft.owner,
			repo: draft.repo,
			state: 'open',
			maxPages: 1,
			perPage: 30,
		});
		const busyDone = { ...store.$backfillBusyFor.get() };
		delete busyDone[guildId];
		store.$backfillBusyFor.set(busyDone);
		store.$backfillResults.set({
			...store.$backfillResults.get(),
			[guildId]: r,
		});
	}

	return {
		patchBackfillDraft,
		clearBackfillResult,
		runBackfill,
		runBackfillForGuild,
	};
}
