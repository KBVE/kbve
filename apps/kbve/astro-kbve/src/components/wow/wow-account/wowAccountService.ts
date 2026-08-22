import { SUPABASE_URL } from '@/lib/supa';
import { buildCredential } from '@/lib/wow-srp6';

const WOW_ENDPOINT = `${SUPABASE_URL}/functions/v1/wow`;
const FETCH_TIMEOUT_MS = 15_000;

export interface WowAccount {
	username: string;
	suggested_username: string;
	status: number;
	is_provisioned: boolean;
	provisioned_at: string | null;
	created_at: string;
}

export interface WowAccountStatus {
	account: WowAccount | null;
	/** Name a fresh derivation would produce. Display only — never hashed against. */
	suggestedUsername: string | null;
	/** True when the user has no KBVE username, so no game name can be derived. */
	needsKbveUsername: boolean;
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

export async function getStatus(
	accessToken: string,
): Promise<WowAccountStatus> {
	const data = await postWow<{
		found: boolean;
		needs_kbve_username: boolean;
		account: WowAccount | null;
		suggested_username: string | null;
	}>('account.status', {}, accessToken);

	return {
		account: data.found ? data.account : null,
		suggestedUsername: data.suggested_username,
		needsKbveUsername: data.needs_kbve_username,
	};
}

/**
 * Creates the game account in two calls, and the order is load-bearing.
 *
 * The game name is derived from the KBVE username, truncated to the 16
 * characters the 3.3.5a login box accepts, and may carry a collision suffix.
 * Only the server knows which name it actually took, and SRP6 folds that name
 * into the verifier — so the reservation has to come back before the password
 * is turned into anything. Deriving against a guessed name would produce an
 * account nobody can log into.
 *
 * The password is consumed here, in the browser. Nothing upstream — edge
 * worker, Postgres, logs — ever sees the plaintext.
 */
export async function createAccount(
	password: string,
	accessToken: string,
): Promise<string> {
	const reserved = await postWow<{ username: string; provisioned: boolean }>(
		'account.reserve',
		{},
		accessToken,
	);
	if (reserved.provisioned) {
		throw new Error('You already have a game account');
	}

	const { salt, verifier } = await buildCredential(
		reserved.username,
		password,
	);
	const data = await postWow<{ success: boolean; username: string }>(
		'account.provision',
		{ salt, verifier },
		accessToken,
	);
	return data.username;
}

export async function setPassword(
	username: string,
	password: string,
	accessToken: string,
): Promise<void> {
	const { salt, verifier } = await buildCredential(username, password);
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
