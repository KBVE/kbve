import { Platform } from 'react-native';
import { setupURLPolyfill } from 'react-native-url-polyfill';
import AsyncStorage from '@react-native-async-storage/async-storage';

if (Platform.OS !== 'web') {
	setupURLPolyfill();
}
import { createClient } from '@supabase/supabase-js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AuthSession } from '@kbve/core';

export interface SupabaseConfig {
	url: string;
	anonKey: string;
	tokenConsumer?: boolean;
}

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
	return createClient(config.url, config.anonKey, {
		auth: {
			storage: AsyncStorage,
			autoRefreshToken: true,
			persistSession: true,
			detectSessionInUrl: false,
			flowType: 'pkce',
		},
	});
}

export function claimUsername(accessToken: string): string | null {
	try {
		const payload = accessToken.split('.')[1];
		if (!payload) return null;
		const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
		const claims = JSON.parse(json) as { kbve_username?: string };
		return claims.kbve_username ?? null;
	} catch {
		return null;
	}
}

export function mapSession(session: Session | null): AuthSession | null {
	if (!session) return null;
	return {
		accessToken: session.access_token,
		refreshToken: session.refresh_token,
		expiresAt: session.expires_at ?? null,
		user: {
			id: session.user.id,
			email: session.user.email ?? null,
			username: claimUsername(session.access_token),
		},
	};
}
