import { SUPABASE_URL } from '@/lib/supa';
import { buildCredential } from '@/lib/wow-srp6';

const WOW_ENDPOINT = `${SUPABASE_URL}/functions/v1/wow`;
const FETCH_TIMEOUT_MS = 15_000;

export interface WowAccount {
	username: string;
	status: number;
	is_provisioned: boolean;
	provisioned_at: string | null;
	created_at: string;
}

async function postWow<T>(
	command: string,
	body: Record<string, unknown>,
	accessToken: string,
): Promise<T> {
	const resp = await fetch(WOW_ENDPOINT, {
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

export async function getAccount(
	accessToken: string,
): Promise<WowAccount | null> {
	const data = await postWow<{ found: boolean; account?: WowAccount | null }>(
		'account.status',
		{},
		accessToken,
	);
	return data.found && data.account ? data.account : null;
}

/**
 * The password is turned into an SRP6 salt/verifier pair here, in the browser,
 * and only that pair is sent. Nothing upstream — edge worker, Postgres, logs —
 * ever sees the plaintext, which is the whole reason this runs client-side.
 */
export async function createAccount(
	username: string,
	password: string,
	accessToken: string,
): Promise<string> {
	const upper = username.trim().toUpperCase();
	const { salt, verifier } = await buildCredential(upper, password);
	const data = await postWow<{ success: boolean; username: string }>(
		'account.create',
		{ username: upper, salt, verifier },
		accessToken,
	);
	return data.username;
}

export async function setPassword(
	username: string,
	password: string,
	accessToken: string,
): Promise<void> {
	const { salt, verifier } = await buildCredential(
		username.toUpperCase(),
		password,
	);
	await postWow<{ success: boolean }>(
		'account.set_password',
		{ salt, verifier },
		accessToken,
	);
}

/**
 * Frees a username that was reserved but never provisioned. Only reachable
 * while the claim is unprovisioned — a live account is never dropped this way,
 * because that would orphan the row the realm actually authenticates against.
 */
export async function releaseClaim(accessToken: string): Promise<boolean> {
	const data = await postWow<{ success: boolean; released: boolean }>(
		'account.release',
		{},
		accessToken,
	);
	return data.released;
}
