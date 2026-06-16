import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import { createChatExecutor } from '../chat/executor';
import { KBVE_API_URL, KBVE_CHAT_URL } from '../config';

export interface KbveContextValue {
	client: SupabaseClient;
	authStore: AuthStore;
	chatStore: ChatStore;
	api: KbveApi;
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
	children: ReactNode;
}

export function KbveProvider({
	supabaseUrl,
	anonKey,
	apiBaseUrl,
	oauthUrl,
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
		const api = createKbveApi({
			baseUrl: apiBaseUrl ?? KBVE_API_URL,
			getToken: async () => {
				const { data } = await client.auth.getSession();
				return data.session?.access_token ?? null;
			},
		});
		return { client, authStore, chatStore, api };
	}, [supabaseUrl, anonKey, apiBaseUrl, oauthUrl]);

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

	useEffect(() => {
		const { client } = value;
		const refresh = (state: string) => {
			if (state === 'active') {
				client.auth.startAutoRefresh();
			} else {
				client.auth.stopAutoRefresh();
			}
		};
		refresh(AppState.currentState);
		const subscription = AppState.addEventListener('change', refresh);
		return () => {
			subscription.remove();
			client.auth.stopAutoRefresh();
		};
	}, [value]);

	return (
		<SafeAreaProvider>
			<KbveContext.Provider value={value}>
				{children}
			</KbveContext.Provider>
		</SafeAreaProvider>
	);
}

export function useKbve(): KbveContextValue {
	const ctx = useContext(KbveContext);
	if (!ctx) {
		throw new Error('useKbve must be used within a KbveProvider');
	}
	return ctx;
}
