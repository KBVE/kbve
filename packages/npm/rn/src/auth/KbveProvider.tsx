import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
	AuthStore,
	authCore,
	ChatStore,
	chatCore,
	createKbveApi,
} from '@kbve/core';
import type { KbveApi } from '@kbve/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient, mapSession } from './supabase';
import { createSupabaseAuthExecutor } from './executor';
import { useAutoRefresh } from './useAutoRefresh';
import { AuthSafeArea } from './AuthSafeArea';
import { createChatExecutor } from '../chat/executor';
import { createWorkerPool } from '../worker/pool';
import type { WorkerPool } from '../worker/types';
import { KBVE_API_URL, KBVE_CHAT_URL } from '../config';

export interface KbveContextValue {
	client: SupabaseClient;
	authStore: AuthStore;
	chatStore: ChatStore;
	api: KbveApi;
	pool: WorkerPool;
}

const KbveContext = createContext<KbveContextValue | null>(null);

export interface KbveProviderProps {
	supabaseUrl: string;
	anonKey: string;
	/** Override the KBVE API base URL (e.g. a same-origin proxy on web). */
	apiBaseUrl?: string;
	/**
	 * Public Supabase URL for the OAuth redirect (web). When `supabaseUrl` is a
	 * same-origin proxy, set this to the real host so the browser hits
	 * supabase.kbve.com's /authorize directly instead of the proxy.
	 */
	oauthUrl?: string;
	/**
	 * Route api.* through the worker pool (off-main-thread fetch on web). Off by
	 * default — the api uses the direct transport; the pool stays available via
	 * usePool() for explicit calls.
	 */
	pooledApi?: boolean;
	children: ReactNode;
}

export function KbveProvider({
	supabaseUrl,
	anonKey,
	apiBaseUrl,
	oauthUrl,
	pooledApi = false,
	children,
}: KbveProviderProps) {
	const value = useMemo<KbveContextValue>(() => {
		const client = createSupabaseClient({ url: supabaseUrl, anonKey });
		const authStore = new AuthStore(
			authCore,
			createSupabaseAuthExecutor(client, oauthUrl),
		);
		const chatStore = new ChatStore(
			chatCore,
			createChatExecutor(client, KBVE_CHAT_URL),
		);
		const pool = createWorkerPool();
		const api = createKbveApi({
			baseUrl: apiBaseUrl ?? KBVE_API_URL,
			getToken: async () => {
				const { data } = await client.auth.getSession();
				return data.session?.access_token ?? null;
			},
			fetch: pooledApi
				? (url, opts) => {
						const isJson =
							opts.body !== undefined &&
							typeof opts.body !== 'string';
						return pool.request(url, {
							method: opts.method,
							headers: {
								...(isJson
									? { 'content-type': 'application/json' }
									: {}),
								...(opts.headers as
									| Record<string, string>
									| undefined),
							},
							body:
								opts.body === undefined
									? undefined
									: isJson
										? JSON.stringify(opts.body)
										: (opts.body as string),
						});
					}
				: undefined,
		});
		return { client, authStore, chatStore, api, pool };
	}, [supabaseUrl, anonKey, apiBaseUrl, oauthUrl, pooledApi]);

	useEffect(() => {
		const { client, authStore } = value;
		authStore.dispatch({ type: 'restore' });
		const { data } = client.auth.onAuthStateChange((_event, session) => {
			authStore.dispatch({
				type: 'session_changed',
				session: mapSession(session),
			});
		});
		return () => data.subscription.unsubscribe();
	}, [value]);

	useAutoRefresh(value.client);

	return (
		<AuthSafeArea>
			<KbveContext.Provider value={value}>
				{children}
			</KbveContext.Provider>
		</AuthSafeArea>
	);
}

export function useKbve(): KbveContextValue {
	const ctx = useContext(KbveContext);
	if (!ctx) {
		throw new Error('useKbve must be used within a KbveProvider');
	}
	return ctx;
}
