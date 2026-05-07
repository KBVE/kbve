import { SUPABASE_URL } from '@/lib/supa';

const MC_ENDPOINT = `${SUPABASE_URL}/functions/v1/mc`;
const FETCH_TIMEOUT_MS = 10_000;

export interface MojangProfile {
	mc_uuid: string;
	username: string;
}

export interface LinkStatus {
	mc_uuid: string;
	status: number;
	is_verified: boolean;
	is_pending: boolean;
	created_at: string;
	updated_at: string;
}

async function postMc<T>(
	command: string,
	body: Record<string, unknown>,
	accessToken: string,
): Promise<T> {
	const resp = await fetch(MC_ENDPOINT, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({ command, ...body }),
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
	});

	const json = await resp.json().catch(() => ({}));
	if (!resp.ok) {
		const reason =
			(json as { error?: string }).error ?? `HTTP ${resp.status}`;
		throw new Error(reason);
	}
	return json as T;
}

export async function mojangLookup(
	username: string,
	accessToken: string,
): Promise<MojangProfile | null> {
	const data = await postMc<{ found: boolean } & MojangProfile>(
		'mojang.lookup',
		{ username },
		accessToken,
	);
	if (!data.found) return null;
	return { mc_uuid: data.mc_uuid, username: data.username };
}

export async function requestLink(
	mc_uuid: string,
	accessToken: string,
): Promise<number> {
	const data = await postMc<{ success: boolean; verification_code: number }>(
		'auth.request_link',
		{ mc_uuid },
		accessToken,
	);
	return data.verification_code;
}

export async function getLinkStatus(
	accessToken: string,
): Promise<LinkStatus | null> {
	const data = await postMc<{ found: boolean; link?: LinkStatus }>(
		'auth.status',
		{},
		accessToken,
	);
	return data.found && data.link ? data.link : null;
}

export async function unlink(accessToken: string): Promise<boolean> {
	const data = await postMc<{ success: boolean; was_linked: boolean }>(
		'auth.unlink',
		{},
		accessToken,
	);
	return data.was_linked;
}
