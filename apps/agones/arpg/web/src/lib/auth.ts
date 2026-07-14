import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseUrl, SUPABASE_ANON_KEY } from './supa';

let client: SupabaseClient | null = null;

function ensureClient(): SupabaseClient {
	if (client) return client;
	client = createClient(getSupabaseUrl(), SUPABASE_ANON_KEY, {
		auth: {
			persistSession: true,
			autoRefreshToken: true,
			detectSessionInUrl: true,
		},
	});
	return client;
}

export const authBridge = {
	async getSession() {
		const { data, error } = await ensureClient().auth.getSession();
		if (error) throw error;
		return data.session;
	},
	async signInWithOAuth(provider: 'github' | 'twitch' | 'discord') {
		const { data, error } = await ensureClient().auth.signInWithOAuth({
			provider,
			options: {
				redirectTo: `${window.location.origin}/`,
				scopes: provider === 'discord' ? 'identify email' : undefined,
			},
		});
		if (error) throw error;
		return data;
	},
	async signOut() {
		const { error } = await ensureClient().auth.signOut();
		if (error) throw error;
	},
};
