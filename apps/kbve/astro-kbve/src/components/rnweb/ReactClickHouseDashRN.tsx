import { useMemo } from 'react';
import {
	StreamView,
	createClickHouseStream,
	clickhouseLens,
} from '@kbve/rn/dash';
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
	const store = useMemo(
		() => createClickHouseStream({ getToken, baseUrl: DASH_PROXY_BASE }),
		[],
	);
	return (
		<StreamView
			store={store}
			lens={clickhouseLens}
			layout="rows"
			searchPlaceholder="filter by namespace / level / message"
		/>
	);
}
