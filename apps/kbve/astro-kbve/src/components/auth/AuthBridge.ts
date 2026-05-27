// src/components/auth/AuthBridge.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supa';
import { IDBStorage } from '@/lib/storage';

const DISCORD_OAUTH_SCOPES = 'identify email guilds';
const DISCORD_PROVIDER_TOKEN_KEY = 'kbve_discord_provider_token';
const DISCORD_PROVIDER_TOKEN_AT_KEY = 'kbve_discord_provider_token_captured_at';

function safeLocalGet(key: string): string | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

function safeLocalSet(key: string, value: string): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(key, value);
	} catch {
		// quota / private mode — non-fatal
	}
}

function safeLocalRemove(key: string): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.removeItem(key);
	} catch {
		// non-fatal
	}
}

/**
 * AuthBridge handles OAuth flows in the main window context.
 * After OAuth completes, it syncs the session with the SharedWorker via IndexedDB.
 */
class AuthBridge {
	private client: SupabaseClient | null = null;
	private storage = new IDBStorage(); // Same storage as SharedWorker

	/**
	 * Initialize the window-based Supabase client for OAuth
	 */
	private ensureClient(): SupabaseClient {
		if (this.client) return this.client;

		// Use the SAME IndexedDB storage as the SharedWorker
		// This ensures session is automatically shared between window and worker
		this.client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
			auth: {
				storage: this.storage, // Critical: same storage as worker!
				persistSession: true,
				autoRefreshToken: true,
				detectSessionInUrl: true, // Important for OAuth redirects
			},
		});

		return this.client;
	}

	/**
	 * Initiate OAuth sign-in with a provider
	 */
	async signInWithOAuth(provider: 'github' | 'twitch' | 'discord') {
		const client = this.ensureClient();

		const { data, error } = await client.auth.signInWithOAuth({
			provider,
			options: {
				redirectTo: `${window.location.origin}/auth/callback`,
				skipBrowserRedirect: false,
				scopes:
					provider === 'discord' ? DISCORD_OAUTH_SCOPES : undefined,
			},
		});

		if (error) throw error;
		return data;
	}

	/**
	 * Handle OAuth callback after redirect
	 * Call this on your callback page
	 */
	async handleCallback() {
		const client = this.ensureClient();

		// Exchange the code in the URL for a session
		const { data, error } = await client.auth.getSession();

		if (error) throw error;

		// Supabase clears OAuth provider_token from session on auto-refresh,
		// so stash it now while it's still attached. The agents dashboard
		// reads this fallback for verifyGuildOwnership / Discord API calls.
		const session = data.session as {
			provider_token?: string | null;
			user?: { app_metadata?: { provider?: string } | null } | null;
		} | null;
		const providerToken = session?.provider_token ?? null;
		const provider = session?.user?.app_metadata?.provider ?? null;
		if (providerToken && provider === 'discord') {
			safeLocalSet(DISCORD_PROVIDER_TOKEN_KEY, providerToken);
			safeLocalSet(DISCORD_PROVIDER_TOKEN_AT_KEY, String(Date.now()));
		}

		return data.session;
	}

	/** Returns the Discord OAuth access token captured during the last callback. */
	getDiscordProviderToken(): string | null {
		return safeLocalGet(DISCORD_PROVIDER_TOKEN_KEY);
	}

	clearDiscordProviderToken(): void {
		safeLocalRemove(DISCORD_PROVIDER_TOKEN_KEY);
		safeLocalRemove(DISCORD_PROVIDER_TOKEN_AT_KEY);
	}

	/**
	 * Sign out (both window and worker will be notified)
	 */
	async signOut() {
		const client = this.ensureClient();
		this.clearDiscordProviderToken();
		const { error } = await client.auth.signOut();
		if (error) throw error;
	}

	/**
	 * Full cleanup: clear all auth data from IndexedDB and close the connection.
	 * Call this during logout to avoid blocking deleteDatabase from other tabs.
	 */
	async destroy() {
		this.clearDiscordProviderToken();
		try {
			await this.storage.clearAll();
		} catch {
			// best-effort
		}
		this.storage.close();
		this.client = null;
	}

	/**
	 * Get current session from window client
	 */
	async getSession() {
		const client = this.ensureClient();
		const { data, error } = await client.auth.getSession();
		if (error) throw error;
		return data.session;
	}
}

// Singleton instance
export const authBridge = new AuthBridge();
