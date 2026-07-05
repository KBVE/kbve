import { useMemo } from 'react';
import {
	StreamView,
	createMinecraftStream,
	minecraftLens,
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

export default function ReactMinecraftDashRN() {
	const store = useMemo(
		() => createMinecraftStream({ getToken, baseUrl: DASH_PROXY_BASE }),
		[],
	);
	return (
		<StreamView
			store={store}
			lens={minecraftLens}
			layout="rows"
			searchPlaceholder="filter by server / world"
		/>
	);
}
