import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthStore, authCore, ChatStore, chatCore } from '@kbve/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient, mapSession } from './supabase';
import { createSupabaseAuthExecutor } from './executor';
import { createChatExecutor } from '../chat/executor';
import { KBVE_CHAT_URL } from '../config';

export interface KbveContextValue {
	client: SupabaseClient;
	authStore: AuthStore;
	chatStore: ChatStore;
}

const KbveContext = createContext<KbveContextValue | null>(null);

export interface KbveProviderProps {
	supabaseUrl: string;
	anonKey: string;
	children: ReactNode;
}

export function KbveProvider({
	supabaseUrl,
	anonKey,
	children,
}: KbveProviderProps) {
	const value = useMemo<KbveContextValue>(() => {
		const client = createSupabaseClient({ url: supabaseUrl, anonKey });
		const authStore = new AuthStore(
			authCore,
			createSupabaseAuthExecutor(client),
		);
		const chatStore = new ChatStore(
			chatCore,
			createChatExecutor(client, KBVE_CHAT_URL),
		);
		return { client, authStore, chatStore };
	}, [supabaseUrl, anonKey]);

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
