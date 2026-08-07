import { useMemo } from 'react';
import { StreamView, createVMStream, createVMLens } from '@kbve/rn/dash';
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

export default function ReactVMDashRN() {
	const opts = useMemo(() => ({ getToken, baseUrl: DASH_PROXY_BASE }), []);
	const store = useMemo(() => createVMStream(opts), [opts]);
	const lens = useMemo(() => createVMLens(opts), [opts]);
	return (
		<StreamView
			store={store}
			lens={lens}
			layout="rows"
			searchPlaceholder="filter by VM name / namespace / status"
		/>
	);
}
