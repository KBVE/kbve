import type { AgentsCtx } from '../ctx';
import type { AgentsApi } from '../api-types';
import type {
	GithubRepoHook,
	Result,
	WebhookDelivery,
	WebhookInstallResult,
} from '../types';

export function makeWebhook(ctx: AgentsCtx, api: AgentsApi) {
	const { store, endpoints } = ctx;

	function setWebhookDraft(guildId: string, secret: string | null): void {
		const m = { ...store.$webhookDrafts.get() };
		if (secret === null) delete m[guildId];
		else m[guildId] = secret;
		store.$webhookDrafts.set(m);
	}

	function clearWebhookError(guildId: string): void {
		const m = { ...store.$webhookErrors.get() };
		delete m[guildId];
		store.$webhookErrors.set(m);
	}

	async function saveWebhookDraft(
		guildId: string,
		tokenName: string,
		description: string,
	): Promise<Result<{ tokenId: string }>> {
		const secret = store.$webhookDrafts.get()[guildId];
		if (!secret) return { ok: false, error: 'No secret to save' };
		store.$webhookSavingFor.set({
			...store.$webhookSavingFor.get(),
			[guildId]: true,
		});
		store.$webhookErrors.set({
			...store.$webhookErrors.get(),
			[guildId]: null,
		});
		const r = await api.addToken({
			tokenName,
			service: 'github_webhook',
			tokenValue: secret,
			description,
		});
		const savingDone = { ...store.$webhookSavingFor.get() };
		delete savingDone[guildId];
		store.$webhookSavingFor.set(savingDone);
		if (r.ok) {
			setWebhookDraft(guildId, null);
		} else {
			store.$webhookErrors.set({
				...store.$webhookErrors.get(),
				[guildId]: r.error,
			});
		}
		return r;
	}

	async function installRepoWebhook(
		guildId: string,
		owner: string,
		repo: string,
	): Promise<WebhookInstallResult | { ok: false; error: string }> {
		const r = await ctx.callJson<{
			installed: boolean;
			already_present: boolean;
			hook_id: number | null;
		}>(endpoints.ghAdmin, {
			command: 'webhooks.install',
			server_id: guildId,
			owner,
			repo,
		});
		if (!r.ok) return r;
		return {
			ok: true,
			installed: !!r.data.installed,
			alreadyPresent: !!r.data.already_present,
			hookId: r.data.hook_id ?? null,
		};
	}

	async function pingRepoWebhook(
		guildId: string,
		owner: string,
		repo: string,
	): Promise<
		| { ok: true; hookId: number; url: string }
		| { ok: false; error: string; retryAfterMs?: number }
	> {
		const r = await ctx.callJson<{
			pinged: boolean;
			hook_id: number;
			url: string;
		}>(endpoints.ghAdmin, {
			command: 'webhooks.ping',
			server_id: guildId,
			owner,
			repo,
		});
		if (!r.ok) return { ok: false, error: r.error };
		return { ok: true, hookId: r.data.hook_id, url: r.data.url };
	}

	async function listRepoWebhooks(
		guildId: string,
		owner: string,
		repo: string,
	): Promise<Result<{ expectedUrl: string; hooks: GithubRepoHook[] }>> {
		const r = await ctx.callJson<{
			expected_url: string;
			hooks: GithubRepoHook[];
		}>(endpoints.ghAdmin, {
			command: 'webhooks.list',
			server_id: guildId,
			owner,
			repo,
		});
		if (!r.ok) return r;
		return {
			ok: true,
			expectedUrl: r.data.expected_url,
			hooks: r.data.hooks ?? [],
		};
	}

	function setWebhookInstallSelected(guildId: string, repo: string): void {
		store.$webhookInstallSelected.set({
			...store.$webhookInstallSelected.get(),
			[guildId]: repo,
		});
	}

	function clearWebhookInstallResult(guildId: string): void {
		const m = { ...store.$webhookInstallResults.get() };
		delete m[guildId];
		store.$webhookInstallResults.set(m);
	}

	async function installWebhookForGuild(guildId: string): Promise<void> {
		const repoFull = store.$webhookInstallSelected.get()[guildId] ?? '';
		const [owner, repo] = repoFull.split('/');
		if (!owner || !repo) return;
		store.$webhookInstallBusyFor.set({
			...store.$webhookInstallBusyFor.get(),
			[guildId]: true,
		});
		const resultsClear = { ...store.$webhookInstallResults.get() };
		delete resultsClear[guildId];
		store.$webhookInstallResults.set(resultsClear);
		const r = await installRepoWebhook(guildId, owner, repo);
		const busyDone = { ...store.$webhookInstallBusyFor.get() };
		delete busyDone[guildId];
		store.$webhookInstallBusyFor.set(busyDone);
		store.$webhookInstallResults.set({
			...store.$webhookInstallResults.get(),
			[guildId]: r,
		});
	}

	async function pingWebhookForGuild(guildId: string): Promise<void> {
		const repoFull = store.$webhookInstallSelected.get()[guildId] ?? '';
		const [owner, repo] = repoFull.split('/');
		if (!owner || !repo) return;
		store.$webhookPingBusyFor.set({
			...store.$webhookPingBusyFor.get(),
			[guildId]: true,
		});
		const r = await pingRepoWebhook(guildId, owner, repo);
		const busyDone = { ...store.$webhookPingBusyFor.get() };
		delete busyDone[guildId];
		store.$webhookPingBusyFor.set(busyDone);
		const result = r.ok
			? { ok: true as const, hookId: r.hookId, at: Date.now() }
			: { ok: false as const, error: r.error };
		store.$webhookPingResults.set({
			...store.$webhookPingResults.get(),
			[guildId]: result,
		});
	}

	async function verifyWebhookInstall(
		guildId: string,
		repoFull: string,
	): Promise<void> {
		const [owner, repo] = repoFull.split('/');
		if (!owner || !repo) return;
		const cur = store.$webhookInstallResults.get()[guildId];
		if (cur && cur.ok && (cur.installed || cur.alreadyPresent)) return;
		const r = await listRepoWebhooks(guildId, owner, repo);
		if (!r.ok) return;
		const kbveHook = r.hooks.find((h) => h.is_kbve);
		if (!kbveHook) return;
		store.$webhookInstallResults.set({
			...store.$webhookInstallResults.get(),
			[guildId]: {
				ok: true as const,
				installed: false,
				alreadyPresent: true,
				hookId: kbveHook.id,
			},
		});
	}

	async function rotateWebhookForGuild(
		guildId: string,
		owner: string,
		repo: string,
	): Promise<void> {
		store.$webhookRotateBusyFor.set({
			...store.$webhookRotateBusyFor.get(),
			[guildId]: true,
		});
		const r = await ctx.callJson<{ rotated: boolean; hook_id: number }>(
			endpoints.ghAdmin,
			{ command: 'webhooks.rotate', server_id: guildId, owner, repo },
		);
		const busy = { ...store.$webhookRotateBusyFor.get() };
		delete busy[guildId];
		store.$webhookRotateBusyFor.set(busy);
		const result = r.ok
			? { ok: true as const, hookId: r.data.hook_id, at: Date.now() }
			: { ok: false as const, error: r.error };
		store.$webhookRotateResults.set({
			...store.$webhookRotateResults.get(),
			[guildId]: result,
		});
		if (r.ok) {
			await api.refreshSelectedGuild();
		}
	}

	async function deleteWebhookForGuild(
		guildId: string,
		owner: string,
		repo: string,
	): Promise<Result> {
		store.$webhookDeleteBusyFor.set({
			...store.$webhookDeleteBusyFor.get(),
			[guildId]: true,
		});
		const r = await ctx.callJson<{
			deleted: boolean;
			already_absent?: boolean;
			hook_id?: number;
		}>(endpoints.ghAdmin, {
			command: 'webhooks.delete',
			server_id: guildId,
			owner,
			repo,
		});
		const busy = { ...store.$webhookDeleteBusyFor.get() };
		delete busy[guildId];
		store.$webhookDeleteBusyFor.set(busy);
		if (!r.ok) return { ok: false, error: r.error };
		const results = { ...store.$webhookInstallResults.get() };
		delete results[guildId];
		store.$webhookInstallResults.set(results);
		return { ok: true };
	}

	async function loadWebhookDeliveries(
		guildId: string,
		owner: string,
		repo: string,
		limit = 10,
	): Promise<void> {
		const key = `${guildId}:${owner}/${repo}`;
		store.$webhookDeliveriesLoading.set({
			...store.$webhookDeliveriesLoading.get(),
			[key]: true,
		});
		store.$webhookDeliveriesError.set({
			...store.$webhookDeliveriesError.get(),
			[key]: null,
		});
		const r = await ctx.callJson<{
			hook_id: number;
			deliveries: WebhookDelivery[];
		}>(endpoints.ghAdmin, {
			command: 'webhooks.deliveries',
			server_id: guildId,
			owner,
			repo,
			limit,
		});
		const loading = { ...store.$webhookDeliveriesLoading.get() };
		delete loading[key];
		store.$webhookDeliveriesLoading.set(loading);
		if (!r.ok) {
			store.$webhookDeliveriesError.set({
				...store.$webhookDeliveriesError.get(),
				[key]: r.error,
			});
			return;
		}
		store.$webhookDeliveries.set({
			...store.$webhookDeliveries.get(),
			[key]: r.data.deliveries ?? [],
		});
	}

	function webhookUrlFor(guildId: string): string {
		return `${endpoints.ghWebhookBase}/${guildId}`;
	}

	return {
		setWebhookDraft,
		clearWebhookError,
		saveWebhookDraft,
		installRepoWebhook,
		pingRepoWebhook,
		listRepoWebhooks,
		setWebhookInstallSelected,
		clearWebhookInstallResult,
		installWebhookForGuild,
		pingWebhookForGuild,
		verifyWebhookInstall,
		rotateWebhookForGuild,
		deleteWebhookForGuild,
		loadWebhookDeliveries,
		webhookUrlFor,
	};
}
