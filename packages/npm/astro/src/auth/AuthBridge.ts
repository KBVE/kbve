import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { IDBStorage } from './IDBStorage';

export type OAuthProvider = 'github' | 'twitch' | 'discord';

export class AuthBridge {
	private client: SupabaseClient | null = null;
	private storage = new IDBStorage();
	private url: string;
	private anonKey: string;

	constructor(url: string, anonKey: string) {
		this.url = url;
		this.anonKey = anonKey;
	}

	private ensureClient(): SupabaseClient {
		if (this.client) return this.client;

		this.client = createClient(this.url, this.anonKey, {
			auth: {
				storage: this.storage,
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: true,
			},
		});

		return this.client;
	}

	async signInWithOAuth(provider: OAuthProvider) {
		const client = this.ensureClient();
		const { data, error } = await client.auth.signInWithOAuth({
			provider,
			options: {
				redirectTo: `${window.location.origin}/auth/callback`,
				skipBrowserRedirect: false,
			},
		});
		if (error) throw error;
		return data;
	}

	async handleCallback() {
		const client = this.ensureClient();
		const { data, error } = await client.auth.getSession();
		if (error) throw error;
		return data.session;
	}

	async signOut() {
		const client = this.ensureClient();
		const { error } = await client.auth.signOut();
		if (error) throw error;
	}

	async getSession() {
		const client = this.ensureClient();
		const { data, error } = await client.auth.getSession();
		if (error) throw error;
		return data.session;
	}
}
