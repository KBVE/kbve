import type { AgentsCtx } from '../ctx';
import type { AgentsApi } from '../api-types';
import type { PatValidation, Result } from '../types';

export function makePat(ctx: AgentsCtx, api: AgentsApi) {
	const { store } = ctx;

	function setPatDraft(guildId: string, pat: string): void {
		store.$patDrafts.set({ ...store.$patDrafts.get(), [guildId]: pat });
		const validated = { ...store.$patValidatedFor.get() };
		if (validated[guildId]) {
			delete validated[guildId];
			store.$patValidatedFor.set(validated);
		}
	}

	function clearPatState(guildId: string): void {
		const drafts = { ...store.$patDrafts.get() };
		delete drafts[guildId];
		store.$patDrafts.set(drafts);
		const validated = { ...store.$patValidatedFor.get() };
		delete validated[guildId];
		store.$patValidatedFor.set(validated);
		const errs = { ...store.$patErrors.get() };
		delete errs[guildId];
		store.$patErrors.set(errs);
	}

	async function validateGithubPat(
		pat: string,
	): Promise<Result<PatValidation>> {
		try {
			const resp = await fetch('https://api.github.com/user', {
				headers: {
					Authorization: `Bearer ${pat}`,
					Accept: 'application/vnd.github+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
			});
			if (resp.status === 401) {
				return { ok: false, error: 'GitHub rejected the token (401).' };
			}
			if (!resp.ok) {
				return {
					ok: false,
					error: `GitHub /user returned ${resp.status}.`,
				};
			}
			const user = (await resp.json()) as { login?: string };
			if (!user.login) {
				return { ok: false, error: 'GitHub response missing login.' };
			}
			const scopesHeader = resp.headers.get('x-oauth-scopes') ?? '';
			const tokenTypeHeader =
				resp.headers.get('x-github-authentication-token-type') ??
				resp.headers.get('x-github-token-type') ??
				'unknown';
			const scopes = scopesHeader
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean);
			return {
				ok: true,
				login: user.login,
				scopes,
				tokenType: tokenTypeHeader,
			};
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : 'Network error',
			};
		}
	}

	async function validatePatForGuild(guildId: string): Promise<Result> {
		const pat = store.$patDrafts.get()[guildId] ?? '';
		if (!pat) return { ok: false, error: 'No PAT entered' };
		store.$patValidatingFor.set({
			...store.$patValidatingFor.get(),
			[guildId]: true,
		});
		store.$patErrors.set({ ...store.$patErrors.get(), [guildId]: null });
		const validatedClear = { ...store.$patValidatedFor.get() };
		delete validatedClear[guildId];
		store.$patValidatedFor.set(validatedClear);
		const r = await validateGithubPat(pat);
		const validatingDone = { ...store.$patValidatingFor.get() };
		delete validatingDone[guildId];
		store.$patValidatingFor.set(validatingDone);
		if (!r.ok) {
			store.$patErrors.set({
				...store.$patErrors.get(),
				[guildId]: r.error,
			});
			return r;
		}
		store.$patValidatedFor.set({
			...store.$patValidatedFor.get(),
			[guildId]: {
				login: r.login,
				scopes: r.scopes,
				tokenType: r.tokenType,
			},
		});
		return { ok: true };
	}

	async function savePatForGuild(
		guildId: string,
		tokenName: string,
	): Promise<Result<{ tokenId: string }>> {
		const pat = store.$patDrafts.get()[guildId] ?? '';
		if (!pat) return { ok: false, error: 'No PAT entered' };
		const validated = store.$patValidatedFor.get()[guildId] ?? null;
		store.$patSavingFor.set({
			...store.$patSavingFor.get(),
			[guildId]: true,
		});
		store.$patErrors.set({ ...store.$patErrors.get(), [guildId]: null });
		const r = await api.addToken({
			tokenName,
			service: 'github',
			tokenValue: pat,
			description: validated
				? `GitHub PAT for ${validated.login}`
				: 'GitHub PAT',
		});
		const savingDone = { ...store.$patSavingFor.get() };
		delete savingDone[guildId];
		store.$patSavingFor.set(savingDone);
		if (r.ok) {
			clearPatState(guildId);
		} else {
			store.$patErrors.set({
				...store.$patErrors.get(),
				[guildId]: r.error,
			});
		}
		return r;
	}

	return {
		setPatDraft,
		clearPatState,
		validateGithubPat,
		validatePatForGuild,
		savePatForGuild,
	};
}
