import { useEffect } from 'react';
import { AppState } from 'react-native';
import type { SupabaseClient } from '@supabase/supabase-js';

export function useAutoRefresh(client: SupabaseClient): void {
	useEffect(() => {
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
	}, [client]);
}
