import { useMemo, type ComponentType } from 'react';
import { WithSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
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

interface WorkflowsCanvasProps {
	config: { baseUrl: string; getToken: () => Promise<string | null> };
}

export default function ReactWorkflowsDashRN() {
	const config = useMemo(() => ({ baseUrl: DASH_PROXY_BASE, getToken }), []);
	return (
		<WithSkiaWeb<WorkflowsCanvasProps>
			getComponent={() =>
				import('@kbve/rn/workflows').then((m) => ({
					default:
						m.WorkflowsCanvas as ComponentType<WorkflowsCanvasProps>,
				}))
			}
			componentProps={{ config }}
			opts={{ locateFile: () => canvaskitWasmUrl as string }}
			fallback={<span>Loading workflows canvas…</span>}
		/>
	);
}
