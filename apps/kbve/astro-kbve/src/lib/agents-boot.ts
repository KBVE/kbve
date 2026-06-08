import { configureAgents } from '@kbve/astro';
import { initSupa, getSupa, SUPABASE_URL } from '@/lib/supa';
import { authBridge } from '@/components/auth/AuthBridge';

export const agents = configureAgents({
	supabaseUrl: SUPABASE_URL,
	discordBotClientId: import.meta.env.PUBLIC_DISCORD_BOT_CLIENT_ID as
		| string
		| undefined,
	discordClientId: import.meta.env.PUBLIC_DISCORD_CLIENT_ID as
		| string
		| undefined,
	async loadSession() {
		await initSupa();
		const supa = getSupa();
		const res = await supa.getSession().catch(() => null);
		const session = (res?.session ?? null) as {
			access_token?: string;
			provider_token?: string | null;
		} | null;
		return {
			accessToken: session?.access_token ?? null,
			providerToken: session?.provider_token ?? null,
		};
	},
	async refreshSession() {
		const session = await authBridge.refreshSession();
		return session?.access_token ?? null;
	},
	getDiscordProviderToken: () => authBridge.getDiscordProviderToken(),
	clearDiscordProviderToken: () => authBridge.clearDiscordProviderToken(),
	async signInWithDiscord() {
		await authBridge.signInWithOAuth('discord');
	},
});
