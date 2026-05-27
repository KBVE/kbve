import { atom } from 'nanostores';
import { initSupa, getSupa, SUPABASE_URL } from '@/lib/supa';
import { addToast } from '@kbve/droid';

export type AuthState =
	| 'loading'
	| 'authenticated'
	| 'unauthenticated'
	| 'discord_reauth_required';

export interface DiscordGuild {
	id: string;
	name: string;
	icon: string | null;
	owner: boolean;
	permissions: string;
}

export interface AgentTokenRow {
	token_id: string;
	token_name: string;
	service: string;
	description: string | null;
	is_active: boolean;
	created_at: string;
	updated_at: string | null;
}

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const GUILD_VAULT_URL = `${SUPABASE_URL}/functions/v1/guild-vault`;

class AgentsService {
	public readonly $authState = atom<AuthState>('loading');
	public readonly $accessToken = atom<string | null>(null);
	public readonly $providerToken = atom<string | null>(null);

	public readonly $guilds = atom<DiscordGuild[]>([]);
	public readonly $guildsLoading = atom<boolean>(false);
	public readonly $guildsError = atom<string | null>(null);

	public readonly $selectedGuildId = atom<string | null>(null);

	public readonly $tokens = atom<AgentTokenRow[]>([]);
	public readonly $tokensLoading = atom<boolean>(false);
	public readonly $tokensError = atom<string | null>(null);

	public async initAuth(): Promise<void> {
		try {
			await initSupa();
			const supa = getSupa();
			const sessionResult = await supa.getSession().catch(() => null);
			const session = sessionResult?.session ?? null;

			if (!session?.access_token) {
				this.$authState.set('unauthenticated');
				return;
			}

			this.$accessToken.set(session.access_token as string);

			const providerToken =
				(session as { provider_token?: string | null } | null)
					?.provider_token ?? null;
			if (!providerToken) {
				this.$authState.set('discord_reauth_required');
				return;
			}

			this.$providerToken.set(providerToken);
			this.$authState.set('authenticated');

			await this.loadOwnedGuilds();
		} catch {
			this.$authState.set('unauthenticated');
		}
	}

	public async loadOwnedGuilds(): Promise<void> {
		const providerToken = this.$providerToken.get();
		if (!providerToken) return;

		this.$guildsLoading.set(true);
		this.$guildsError.set(null);

		try {
			const resp = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
				headers: { Authorization: `Bearer ${providerToken}` },
			});

			if (resp.status === 401) {
				this.$authState.set('discord_reauth_required');
				this.$providerToken.set(null);
				this.$guildsError.set(
					'Discord session expired. Re-sign-in required.',
				);
				return;
			}

			if (!resp.ok) {
				const body = await resp.text();
				this.$guildsError.set(
					`Discord API ${resp.status}: ${body.slice(0, 200)}`,
				);
				return;
			}

			const allGuilds = (await resp.json()) as DiscordGuild[];
			const owned = allGuilds.filter((g) => g.owner === true);
			this.$guilds.set(owned);

			if (owned.length === 1) {
				this.selectGuild(owned[0].id);
			}
		} catch (e) {
			this.$guildsError.set(
				e instanceof Error
					? e.message
					: 'Failed to load Discord guilds',
			);
		} finally {
			this.$guildsLoading.set(false);
		}
	}

	public selectGuild(guildId: string): void {
		const current = this.$selectedGuildId.get();
		if (current === guildId) return;
		this.$selectedGuildId.set(guildId);
		void this.loadTokens(guildId);
	}

	public async loadTokens(guildId: string): Promise<void> {
		const accessToken = this.$accessToken.get();
		const providerToken = this.$providerToken.get();
		if (!accessToken || !providerToken) return;

		this.$tokensLoading.set(true);
		this.$tokensError.set(null);

		try {
			const resp = await fetch(GUILD_VAULT_URL, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${accessToken}`,
				},
				body: JSON.stringify({
					command: 'tokens.list_tokens',
					server_id: guildId,
					provider_token: providerToken,
				}),
			});

			const text = await resp.text();
			let body: unknown;
			try {
				body = JSON.parse(text);
			} catch {
				this.$tokensError.set(
					`HTTP ${resp.status}: ${text.slice(0, 200)}`,
				);
				return;
			}

			if (!resp.ok) {
				const errMsg =
					(body as { error?: string } | null)?.error ??
					`HTTP ${resp.status}`;
				this.$tokensError.set(errMsg);
				return;
			}

			const rows =
				(body as { tokens?: AgentTokenRow[] } | null)?.tokens ?? [];
			this.$tokens.set(rows);
		} catch (e) {
			this.$tokensError.set(
				e instanceof Error ? e.message : 'Failed to load tokens',
			);
		} finally {
			this.$tokensLoading.set(false);
		}
	}

	public async refreshSelectedGuild(): Promise<void> {
		const guildId = this.$selectedGuildId.get();
		if (guildId) await this.loadTokens(guildId);
	}

	public async addToken(input: {
		tokenName: string;
		service: string;
		tokenValue: string;
		description?: string | null;
	}): Promise<{ ok: true; tokenId: string } | { ok: false; error: string }> {
		const guildId = this.$selectedGuildId.get();
		const accessToken = this.$accessToken.get();
		const providerToken = this.$providerToken.get();
		if (!guildId || !accessToken || !providerToken) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		const resp = await this.callGuildVault(
			'tokens.set_token',
			accessToken,
			{
				server_id: guildId,
				provider_token: providerToken,
				token_name: input.tokenName,
				service: input.service,
				token_value: input.tokenValue,
				description: input.description ?? null,
			},
		);

		if (!resp.ok) return { ok: false, error: resp.error };
		const tokenId =
			(resp.body as { token_id?: string } | null)?.token_id ?? '';
		await this.refreshSelectedGuild();
		addToast({
			id: `token-add-${Date.now()}`,
			message: `Token "${input.tokenName}" registered.`,
			severity: 'success',
			duration: 3500,
		});
		return { ok: true, tokenId };
	}

	public async deleteToken(
		tokenId: string,
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const guildId = this.$selectedGuildId.get();
		const accessToken = this.$accessToken.get();
		const providerToken = this.$providerToken.get();
		if (!guildId || !accessToken || !providerToken) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		const resp = await this.callGuildVault(
			'tokens.delete_token',
			accessToken,
			{
				server_id: guildId,
				provider_token: providerToken,
				token_id: tokenId,
			},
		);

		if (!resp.ok) return { ok: false, error: resp.error };
		await this.refreshSelectedGuild();
		addToast({
			id: `token-del-${Date.now()}`,
			message: 'Token deleted.',
			severity: 'success',
			duration: 3500,
		});
		return { ok: true };
	}

	public async toggleToken(
		tokenId: string,
		isActive: boolean,
	): Promise<{ ok: true } | { ok: false; error: string }> {
		const guildId = this.$selectedGuildId.get();
		const accessToken = this.$accessToken.get();
		const providerToken = this.$providerToken.get();
		if (!guildId || !accessToken || !providerToken) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		const resp = await this.callGuildVault(
			'tokens.toggle_token',
			accessToken,
			{
				server_id: guildId,
				provider_token: providerToken,
				token_id: tokenId,
				is_active: isActive,
			},
		);

		if (!resp.ok) return { ok: false, error: resp.error };
		await this.refreshSelectedGuild();
		return { ok: true };
	}

	private async callGuildVault(
		command: string,
		accessToken: string,
		extra: Record<string, unknown>,
	): Promise<{ ok: true; body: unknown } | { ok: false; error: string }> {
		try {
			const resp = await fetch(GUILD_VAULT_URL, {
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
				const errMsg =
					(body as { error?: string } | null)?.error ??
					`HTTP ${resp.status}`;
				return { ok: false, error: errMsg };
			}
			return { ok: true, body };
		} catch (e) {
			return {
				ok: false,
				error: e instanceof Error ? e.message : 'Network error',
			};
		}
	}

	public hasService(service: string): AgentTokenRow | null {
		const tokens = this.$tokens.get();
		return (
			tokens.find((t) => t.service === service && t.is_active) ??
			tokens.find((t) => t.service === service) ??
			null
		);
	}

	public webhookUrlFor(guildId: string): string {
		return `${SUPABASE_URL}/functions/v1/gh-webhook/${guildId}`;
	}

	public async validateGithubPat(
		pat: string,
	): Promise<
		| { ok: true; login: string; scopes: string[]; tokenType: string }
		| { ok: false; error: string }
	> {
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

	public async runBackfill(input: {
		owner: string;
		repo: string;
		state?: 'open' | 'closed' | 'all';
		maxPages?: number;
		perPage?: number;
	}): Promise<
		| {
				ok: true;
				upserted: number;
				pages: number;
				rateLimitRemaining: number | null;
		  }
		| { ok: false; error: string }
	> {
		const accessToken = this.$accessToken.get();
		const guildId = this.$selectedGuildId.get();
		if (!accessToken || !guildId) {
			return { ok: false, error: 'No guild selected or session missing' };
		}

		try {
			const resp = await fetch(
				`${SUPABASE_URL}/functions/v1/gh-backfill`,
				{
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
				},
			);
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

	public async signInWithDiscord(): Promise<void> {
		try {
			const { authBridge } = await import('@/components/auth/AuthBridge');
			await authBridge.signInWithOAuth('discord');
		} catch (e) {
			addToast({
				id: `discord-signin-err-${Date.now()}`,
				message:
					e instanceof Error ? e.message : 'Discord sign-in failed',
				severity: 'error',
				duration: 5000,
			});
		}
	}
}

export const agentsService = new AgentsService();
