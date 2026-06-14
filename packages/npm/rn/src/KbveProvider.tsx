import { createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { AuthStore, authCore } from '@kbve/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient, mapSession } from './supabase';
import { createSupabaseAuthExecutor } from './auth-executor';

export interface KbveContextValue {
	client: SupabaseClient;
	authStore: AuthStore;
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
		return { client, authStore };
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

	return (
		<KbveContext.Provider value={value}>{children}</KbveContext.Provider>
	);
}

export function useKbve(): KbveContextValue {
	const ctx = useContext(KbveContext);
	if (!ctx) {
		throw new Error('useKbve must be used within a KbveProvider');
	}
	return ctx;
}
