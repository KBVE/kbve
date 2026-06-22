import { createClient } from '@supabase/supabase-js';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import type { AuthSession } from '@kbve/core';
import { createWorkerPool } from '../worker/pool';

const NULL_BODY_STATUS = new Set([204, 205, 304]);

function createWorkerFetch(): typeof fetch {
	const pool = createWorkerPool();
	return async (input, init) => {
		const body = init?.body;
		if (
			input instanceof Request ||
			(body != null && typeof body !== 'string')
		)
			return fetch(input, init);

		const url = typeof input === 'string' ? input : input.toString();
		const headers: Record<string, string> = {};
		new Headers(init?.headers).forEach((value, key) => {
			headers[key] = value;
		});

		const raw = await pool.fetchRaw(url, {
			method: init?.method,
			headers,
			body: body ?? undefined,
		});
		return new Response(
			NULL_BODY_STATUS.has(raw.status) ? null : raw.body,
			{
				status: raw.status,
				statusText: raw.statusText,
				headers: raw.headers,
			},
		);
	};
}

export function createSupabaseClient(config: SupabaseConfig): SupabaseClient {
	return createClient(config.url, config.anonKey, {
		auth: {
			autoRefreshToken: true,
			persistSession: true,
			// web OAuth returns to the app URL with the code in the query;
			// let supabase-js exchange it automatically on load.
			detectSessionInUrl: true,
			flowType: 'pkce',
		},
		global: { fetch: createWorkerFetch() },
	});
}

export interface SupabaseConfig {
	url: string;
	anonKey: string;
}

function claimUsername(accessToken: string): string | null {
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
