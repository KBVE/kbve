import { useMemo } from 'react';
import { StreamView, createEdgeStream, edgeLens } from '@kbve/rn/dash';
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

export default function ReactEdgeDashRN() {
	const store = useMemo(
		() => createEdgeStream({ getToken, baseUrl: DASH_PROXY_BASE }),
		[],
	);
	return (
		<StreamView
			store={store}
			lens={edgeLens}
			layout="rows"
			searchPlaceholder="filter by function name / status"
		/>
	);
}
