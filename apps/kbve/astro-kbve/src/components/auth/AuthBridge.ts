// src/components/auth/AuthBridge.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supa';
import { IDBStorage } from '@/lib/storage';

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
				// Skip if already logged in
				skipBrowserRedirect: false,
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

		// Session is now stored in IndexedDB
		// The SharedWorker will automatically pick it up
		return data.session;
	}

	/**
	 * Sign out (both window and worker will be notified)
	 */
	async signOut() {
		const client = this.ensureClient();
		const { error } = await client.auth.signOut();
		if (error) throw error;
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
