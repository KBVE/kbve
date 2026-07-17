import { useMemo } from 'react';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
// @ts-expect-error — vite emits the wasm as a same-origin asset and returns its URL
import canvaskitWasmUrl from 'canvaskit-wasm/bin/full/canvaskit.wasm?url';
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
	return (
		<WithSkiaWeb
			getComponent={() =>
				import('@kbve/rn/workflows').then((m) => ({
					default: m.WorkflowsCanvas,
				}))
			}
			componentProps={{ config }}
			opts={{ locateFile: () => canvaskitWasmUrl as string }}
			fallback={<span>Loading workflows canvas…</span>}
		/>
	);
}
