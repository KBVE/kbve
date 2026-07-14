import { useMemo } from 'react';
import { StreamView, createFactorioStream, factorioLens } from '@kbve/rn/dash';
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

export default function ReactFactorioDashRN() {
	const store = useMemo(
		() => createFactorioStream({ getToken, baseUrl: DASH_PROXY_BASE }),
		[],
	);
	return (
		<StreamView
			store={store}
			lens={factorioLens}
			layout="rows"
			searchPlaceholder="filter by server / save"
		/>
	);
}
