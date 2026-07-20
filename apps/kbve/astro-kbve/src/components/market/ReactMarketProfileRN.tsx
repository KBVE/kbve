import { useMemo } from 'react';
import { useSession } from '@kbve/astro';
import { MarketProfileView } from '@kbve/rn/markets';
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

export default function ReactMarketProfileRN() {
	const { ready, authenticated } = useSession();
	const token = useMemo(() => getToken, []);
	if (!ready) return null;
	return <MarketProfileView getToken={token} baseUrl="" authenticated={authenticated} />;
}
