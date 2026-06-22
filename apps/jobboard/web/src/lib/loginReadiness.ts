import { kvStore } from '@kbve/rn/store';

const OWNER_KEY = 'cache-owner-uid';

interface SessionClient {
	auth: {
		getSession(): Promise<{
			data: { session: { access_token?: string } | null };
		}>;
	};
}

export async function reconcileCache(
	uid: string,
): Promise<'cleared' | 'matched'> {
	const owner = await kvStore.get<string>(OWNER_KEY);
	if (owner === uid) return 'matched';
	await kvStore.clear();
	await kvStore.set(OWNER_KEY, uid);
	return 'cleared';
}

export async function ensureSessionReady(
	client: SessionClient,
	timeoutMs = 4000,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const { data } = await client.auth.getSession();
		if (data.session?.access_token) return true;
		await new Promise((res) => setTimeout(res, 150));
	}
	return false;
}
