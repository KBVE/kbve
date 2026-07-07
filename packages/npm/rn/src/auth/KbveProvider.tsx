import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
	AuthStore,
	authCore,
	ChatStore,
	chatCore,
	createKbveApi,
} from '@kbve/core';
import type {
	AuthEffect,
	AuthEvent,
	EffectExecutor,
	KbveApi,
} from '@kbve/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient, mapSession } from './supabase';
import { createSupabaseAuthExecutor } from './executor';
import {
	droidSignOut,
	readDroidSession,
	readDroidSessionFromIdb,
	subscribeDroidSession,
} from './droidStorage';
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
	/**
	 * `active` flips true when a droid-managed session is found in shared web
	 * storage (localStorage sync at mount, IndexedDB async). The provider then
	 * acts as a token consumer: droid's SharedWorker stays the single session
	 * writer.
	 */
	droid: { active: boolean };
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
		const droidSession = readDroidSession();
		const droid = { active: droidSession !== null };
		const client = createSupabaseClient({
			url: supabaseUrl,
			anonKey,
			tokenConsumer: droid.active,
		});
		const baseExecutor = createSupabaseAuthExecutor(client, oauthUrl);
		const executor: EffectExecutor<AuthEffect, AuthEvent> = {
			execute(effect, dispatch) {
				if (droid.active && effect.type === 'supabase.sign_out') {
					void droidSignOut({ supabaseUrl, anonKey });
					return;
				}
				baseExecutor.execute(effect, dispatch);
			},
		};
		const authStore = new AuthStore(authCore, executor);
		if (droidSession) {
			authStore.dispatch({
				type: 'session_changed',
				session: droidSession,
			});
		}
		const chatStore = new ChatStore(
			chatCore,
			createChatExecutor(client, KBVE_CHAT_URL),
		);
		const pool = createWorkerPool();
		const api = createKbveApi({
			baseUrl: apiBaseUrl ?? KBVE_API_URL,
			getToken: async () => {
				const droidSession =
					readDroidSession() ?? (await readDroidSessionFromIdb());
				if (droidSession) {
					droid.active = true;
					return droidSession.accessToken;
				}
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
		return { client, authStore, chatStore, api, pool, droid };
	}, [supabaseUrl, anonKey, apiBaseUrl, oauthUrl, pooledApi]);

	useEffect(() => {
		const { client, authStore, droid } = value;
		let disposed = false;
		let unsubOwnAuth: (() => void) | null = null;
		const startOwnAuth = () => {
			authStore.dispatch({ type: 'restore' });
			const { data } = client.auth.onAuthStateChange(
				(_event, session) => {
					authStore.dispatch({
						type: 'session_changed',
						session: mapSession(session),
					});
				},
			);
			unsubOwnAuth = () => data.subscription.unsubscribe();
		};
		void readDroidSessionFromIdb().then((idbSession) => {
			if (disposed) return;
			if (idbSession) {
				droid.active = true;
				const current = readDroidSession();
				if (
					!current ||
					(idbSession.expiresAt ?? 0) > (current.expiresAt ?? 0)
				) {
					authStore.dispatch({
						type: 'session_changed',
						session: idbSession,
					});
				}
			} else if (!droid.active) {
				startOwnAuth();
			}
		});
		const unsubDroid = subscribeDroidSession((session) => {
			if (session) {
				droid.active = true;
				authStore.dispatch({ type: 'session_changed', session });
			} else if (droid.active) {
				authStore.dispatch({ type: 'session_changed', session: null });
			}
		});
		return () => {
			disposed = true;
			unsubDroid();
			unsubOwnAuth?.();
		};
	}, [value]);

	useAutoRefresh(value.client, !value.droid.active);

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
