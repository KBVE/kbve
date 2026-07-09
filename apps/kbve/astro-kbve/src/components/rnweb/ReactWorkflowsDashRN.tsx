import { useMemo } from 'react';
import { WorkflowsCanvas } from '@kbve/rn/workflows';
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

export default function ReactWorkflowsDashRN() {
	const config = useMemo(() => ({ baseUrl: DASH_PROXY_BASE, getToken }), []);
	return <WorkflowsCanvas config={config} />;
}
