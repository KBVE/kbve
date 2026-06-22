import { useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

export function useAutoRefresh(client: SupabaseClient): void {
	useEffect(() => {
		const refresh = () => {
			if (document.visibilityState === 'visible') {
				client.auth.startAutoRefresh();
			} else {
				client.auth.stopAutoRefresh();
			}
		};
		refresh();
		document.addEventListener('visibilitychange', refresh);
		return () => {
			document.removeEventListener('visibilitychange', refresh);
			client.auth.stopAutoRefresh();
		};
	}, [client]);
}
