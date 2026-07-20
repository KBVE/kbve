import { useMemo } from 'react';
import { useSession } from '@kbve/astro';
import { ListingDetailView } from '@kbve/rn/markets';
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

function readId(): number | null {
	if (typeof window === 'undefined') return null;
	const raw = new URLSearchParams(window.location.search).get('id');
	const n = Number(raw);
	return Number.isFinite(n) && n > 0 ? n : null;
}

export default function ReactMarketDetailRN() {
	const { ready, authenticated } = useSession();
	const token = useMemo(() => getToken, []);
	const id = useMemo(() => readId(), []);

	if (!ready) return null;
	if (id === null) return <div>Missing or invalid ?id= parameter.</div>;

	return (
		<ListingDetailView
			id={id}
			getToken={token}
			baseUrl=""
			authenticated={authenticated}
		/>
	);
}
