import { useMemo } from 'react';
import { StreamView, createArgoStream, createArgoLens } from '@kbve/rn/dash';
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
 * Proof that the generic @kbve/rn/dash kit renders a real ArgoCD stream on the
 * web via react-native-web — the same source + lens a future Expo screen mounts.
 */
export default function ReactArgoDashRN() {
	const store = useMemo(() => createArgoStream({ getToken }), []);
	const lens = useMemo(() => createArgoLens({ getToken }), []);
	return (
		<StreamView
			store={store}
			lens={lens}
			layout="rows"
			searchPlaceholder="filter by name / namespace / project"
		/>
	);
}
