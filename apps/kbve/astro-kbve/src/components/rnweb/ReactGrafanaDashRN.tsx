import { useMemo } from 'react';
import { StreamView, createGrafanaStream, grafanaLens } from '@kbve/rn/dash';
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

/**
 * Proof that the generic @kbve/rn/dash kit renders a real Grafana alerts stream on the
 * web via react-native-web — the same source + lens a future Expo screen mounts.
 */
export default function ReactGrafanaDashRN() {
	const store = useMemo(() => createGrafanaStream({ getToken }), []);
	return (
		<StreamView
			store={store}
			lens={grafanaLens}
			layout="rows"
			searchPlaceholder="filter by alert name / namespace / severity"
		/>
	);
}
