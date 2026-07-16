import { useCallback } from 'react';
import { ClickHouseView } from '@kbve/rn/dash';
import { initSupa, getSupa } from '@/lib/supa';
import { DASH_PROXY_BASE } from './dashProxyBase';

async function getToken(): Promise<string | null> {
	try {
		await initSupa();
		const result = await getSupa()
			.getSession()
			.catch(() => null);
		return result?.session?.access_token ?? null;
	} catch {
		return null;
	}
}

export default function ReactClickHouseDashRN() {
	const token = useCallback(getToken, []);
	return <ClickHouseView getToken={token} baseUrl={DASH_PROXY_BASE} />;
}
