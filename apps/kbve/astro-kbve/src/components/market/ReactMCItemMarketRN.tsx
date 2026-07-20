import { useMemo } from 'react';
import { MCItemMarketSidecar } from '@kbve/rn/markets';
import { initSupa, getSupa } from '@/lib/supa';

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

export default function ReactMCItemMarketRN({ itemRef }: { itemRef: string }) {
	const token = useMemo(() => getToken, []);
	return <MCItemMarketSidecar itemRef={itemRef} getToken={token} baseUrl="" />;
}
