import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { IDBStorage } from './IDBStorage';
import { setSharedToken, clearSharedToken } from './cross-domain';

export type OAuthProvider = 'github' | 'twitch' | 'discord';

export class AuthBridge {
	private client: SupabaseClient | null = null;
	private storage = new IDBStorage();
	private url: string;
	private anonKey: string;
	private _sealed = false;

	constructor(url: string, anonKey: string) {
		this.url = url;
		this.anonKey = anonKey;
	}

	private ensureClient(): SupabaseClient {
		if (this.client) return this.client;

		// After handleCallback() seeds the session, the bridge is sealed.
		// autoRefreshToken is disabled post-seal so only the SharedWorker
		// owns token refresh writes — prevents IDB contention.
		this.client = createClient(this.url, this.anonKey, {
			auth: {
				storage: this.storage,
				persistSession: true,
				autoRefreshToken: !this._sealed,
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
		// Set shared cookie so other *.kbve.com subdomains can detect the session
		if (data.session?.access_token) {
			setSharedToken(data.session.access_token);
		}
		// Seal after callback — SharedWorker now owns token refresh
		this._sealed = true;
		return data.session;
	}

	async signOut() {
		const client = this.ensureClient();
		const { error } = await client.auth.signOut();
		clearSharedToken();
		if (error) throw error;
	}

	/**
	 * Full cleanup: clear all auth data from IndexedDB and close the connection.
	 * Call this during logout to avoid blocking `deleteDatabase` from other tabs.
	 */
	async destroy() {
		try {
			await this.storage.clearAll();
		} catch {
			// best-effort
		}
		this.storage.close();
		this.client = null;
	}

	async getSession(refreshBufferSec = 30) {
		const client = this.ensureClient();
		const { data, error } = await client.auth.getSession();
		if (error) throw error;

		const session = data.session;
		if (!session) return null;

		const nowSec = Math.floor(Date.now() / 1000);
		const expiresAt = session.expires_at ?? 0;
		const isStale = expiresAt > 0 && expiresAt - nowSec <= refreshBufferSec;
		if (!isStale) return session;

		const { data: refreshed, error: refreshError } =
			await client.auth.refreshSession();
		if (refreshError || !refreshed.session) return null;

		setSharedToken(refreshed.session.access_token);
		return refreshed.session;
	}
}
