import {
	botConfigFromFormDraft,
	botConfigToFormDraft,
	emptyBotConfigFormDraft,
} from '../formDrafts';
import type { AgentsCtx } from '../ctx';
import type { AgentsApi } from '../api-types';
import type { BotConfigFormDraft, DiscordshConfig, Result } from '../types';

export function makeRepoConfig(ctx: AgentsCtx, api: AgentsApi) {
	const { store } = ctx;

	async function getRepoAllowlist(): Promise<
		Result<{ repos: string[]; raw: string | null }>
	> {
		const r = await api.peekToken('github_repos');
		if (!r.ok) return { ok: false, error: r.error };
		if (!r.value) return { ok: true, repos: [], raw: null };
		try {
			const parsed = JSON.parse(r.value) as { repos?: unknown };
			const repos = Array.isArray(parsed.repos)
				? parsed.repos.filter((x): x is string => typeof x === 'string')
				: [];
			return { ok: true, repos, raw: r.value };
		} catch {
			return { ok: true, repos: [], raw: r.value };
		}
	}

	async function setRepoAllowlist(repos: string[]): Promise<Result> {
		const r = await api.addToken({
			tokenName: 'github-repos',
			service: 'github_repos',
			tokenValue: JSON.stringify({ repos }),
			description:
				'Per-guild repo allowlist consumed by gh-webhook and gh-backfill',
		});
		if (!r.ok) return { ok: false, error: r.error };
		return { ok: true };
	}

	function hydrateRepoAllowlistDraft(guildId: string, repos: string[]): void {
		store.$repoAllowlistDrafts.set({
			...store.$repoAllowlistDrafts.get(),
			[guildId]: repos,
		});
		store.$repoAllowlistLoadedFor.set({
			...store.$repoAllowlistLoadedFor.get(),
			[guildId]: true,
		});
	}

	function patchRepoAllowlistDraft(guildId: string, repos: string[]): void {
		store.$repoAllowlistDrafts.set({
			...store.$repoAllowlistDrafts.get(),
			[guildId]: repos,
		});
	}

	function clearRepoAllowlistDraft(guildId: string): void {
		const drafts = { ...store.$repoAllowlistDrafts.get() };
		delete drafts[guildId];
		store.$repoAllowlistDrafts.set(drafts);
		const loaded = { ...store.$repoAllowlistLoadedFor.get() };
		delete loaded[guildId];
		store.$repoAllowlistLoadedFor.set(loaded);
	}

	async function ensureRepoAllowlistLoaded(
		guildId: string,
		force = false,
	): Promise<Result> {
		if (!force && store.$repoAllowlistLoadedFor.get()[guildId]) {
			return { ok: true };
		}
		const r = await getRepoAllowlist();
		if (!r.ok) {
			store.$repoAllowlistErrors.set({
				...store.$repoAllowlistErrors.get(),
				[guildId]: r.error,
			});
			return r;
		}
		hydrateRepoAllowlistDraft(guildId, r.repos);
		store.$repoAllowlistErrors.set({
			...store.$repoAllowlistErrors.get(),
			[guildId]: null,
		});
		return { ok: true };
	}

	async function saveRepoAllowlistDraft(guildId: string): Promise<Result> {
		const repos = store.$repoAllowlistDrafts.get()[guildId];
		if (!repos) return { ok: false, error: 'No draft loaded yet' };
		store.$repoAllowlistSavingFor.set({
			...store.$repoAllowlistSavingFor.get(),
			[guildId]: true,
		});
		store.$repoAllowlistErrors.set({
			...store.$repoAllowlistErrors.get(),
			[guildId]: null,
		});
		const r = await setRepoAllowlist(repos);
		const savingDone = { ...store.$repoAllowlistSavingFor.get() };
		delete savingDone[guildId];
		store.$repoAllowlistSavingFor.set(savingDone);
		if (!r.ok) {
			store.$repoAllowlistErrors.set({
				...store.$repoAllowlistErrors.get(),
				[guildId]: r.error,
			});
		}
		return r;
	}

	async function getBotConfig(): Promise<
		Result<{ config: DiscordshConfig }>
	> {
		const r = await api.peekToken('discordsh_config');
		if (!r.ok) return { ok: false, error: r.error };
		if (!r.value) return { ok: true, config: {} };
		try {
			const parsed = JSON.parse(r.value) as Record<string, unknown>;
			return { ok: true, config: parsed as DiscordshConfig };
		} catch {
			return { ok: true, config: {} };
		}
	}

	async function setBotConfig(config: DiscordshConfig): Promise<Result> {
		const r = await api.addToken({
			tokenName: 'discordsh-config',
			service: 'discordsh_config',
			tokenValue: JSON.stringify(config),
			description:
				'Per-guild DiscordSH bot config (channels, defaults, toggles)',
		});
		if (!r.ok) return { ok: false, error: r.error };
		return { ok: true };
	}

	function hydrateBotConfigDraft(
		guildId: string,
		cfg: DiscordshConfig,
	): void {
		store.$botConfigDrafts.set({
			...store.$botConfigDrafts.get(),
			[guildId]: botConfigToFormDraft(cfg),
		});
		store.$botConfigLoadedFor.set({
			...store.$botConfigLoadedFor.get(),
			[guildId]: true,
		});
	}

	function patchBotConfigDraft(
		guildId: string,
		patch: Partial<BotConfigFormDraft>,
	): void {
		const drafts = store.$botConfigDrafts.get();
		const cur = drafts[guildId] ?? emptyBotConfigFormDraft();
		store.$botConfigDrafts.set({
			...drafts,
			[guildId]: { ...cur, ...patch },
		});
	}

	function clearBotConfigDraft(guildId: string): void {
		const drafts = { ...store.$botConfigDrafts.get() };
		delete drafts[guildId];
		store.$botConfigDrafts.set(drafts);
		const loaded = { ...store.$botConfigLoadedFor.get() };
		delete loaded[guildId];
		store.$botConfigLoadedFor.set(loaded);
	}

	async function ensureBotConfigLoaded(
		guildId: string,
		force = false,
	): Promise<Result> {
		if (!force && store.$botConfigLoadedFor.get()[guildId]) {
			return { ok: true };
		}
		const r = await getBotConfig();
		if (!r.ok) {
			store.$botConfigErrors.set({
				...store.$botConfigErrors.get(),
				[guildId]: r.error,
			});
			return r;
		}
		hydrateBotConfigDraft(guildId, r.config);
		store.$botConfigErrors.set({
			...store.$botConfigErrors.get(),
			[guildId]: null,
		});
		return { ok: true };
	}

	async function saveBotConfigDraft(guildId: string): Promise<Result> {
		const draft = store.$botConfigDrafts.get()[guildId];
		if (!draft) return { ok: false, error: 'No draft loaded yet' };
		store.$botConfigSavingFor.set({
			...store.$botConfigSavingFor.get(),
			[guildId]: true,
		});
		store.$botConfigErrors.set({
			...store.$botConfigErrors.get(),
			[guildId]: null,
		});
		const r = await setBotConfig(botConfigFromFormDraft(draft));
		const savingDone = { ...store.$botConfigSavingFor.get() };
		delete savingDone[guildId];
		store.$botConfigSavingFor.set(savingDone);
		if (!r.ok) {
			store.$botConfigErrors.set({
				...store.$botConfigErrors.get(),
				[guildId]: r.error,
			});
		}
		return r;
	}

	return {
		getRepoAllowlist,
		setRepoAllowlist,
		hydrateRepoAllowlistDraft,
		patchRepoAllowlistDraft,
		clearRepoAllowlistDraft,
		ensureRepoAllowlistLoaded,
		saveRepoAllowlistDraft,
		getBotConfig,
		setBotConfig,
		hydrateBotConfigDraft,
		patchBotConfigDraft,
		clearBotConfigDraft,
		ensureBotConfigLoaded,
		saveBotConfigDraft,
	};
}
