import { AuthBridge, SupabaseGateway, bootAuth, $auth } from '@kbve/astro';

export const SUPABASE_URL = 'https://supabase.kbve.com';
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';

const EDGE_URL = `${SUPABASE_URL}/functions/v1`;

export const authBridge = new AuthBridge(SUPABASE_URL, SUPABASE_ANON_KEY);

let _gateway: SupabaseGateway | null = null;
let _initPromise: Promise<void> | null = null;

/**
 * Fallback: if the gateway didn't find a session (it uses localStorage),
 * check AuthBridge which stores the OAuth session in IndexedDB.
 * This bridges the storage mismatch between the two clients.
 */
async function syncAuthBridgeSession(): Promise<void> {
	const current = $auth.get();
	if (current.tone === 'auth') return;

	try {
		const session = await authBridge.getSession();
		if (session?.user) {
			const u = session.user;
			$auth.set({
				tone: 'auth',
				name:
					u.user_metadata?.full_name ||
					u.user_metadata?.name ||
					u.email?.split('@')[0] ||
					'User',
				avatar:
					u.user_metadata?.avatar_url ||
					u.user_metadata?.picture ||
					undefined,
				id: u.id ?? '',
				error: undefined,
			});
		}
	} catch {
		// AuthBridge has no session either — stay anonymous
	}
}

export function initSupa(): Promise<void> {
	if (_initPromise) return _initPromise;

	_gateway = new SupabaseGateway();
	_initPromise = _gateway
		.init(SUPABASE_URL, SUPABASE_ANON_KEY)
		.then(() => bootAuth(_gateway!))
		.then(() => syncAuthBridgeSession())
		.catch((e) => {
			_initPromise = null;
			throw e;
		});

	return _initPromise;
}

export function getSupa(): SupabaseGateway {
	if (!_gateway) throw new Error('Call initSupa() first');
	return _gateway;
}

/**
 * Call a Supabase edge function.
 * Automatically attaches the user's JWT if authenticated,
 * or falls back to the anon key for anonymous access.
 */
export async function callEdge<T = unknown>(
	fnName: string,
	body: Record<string, unknown>,
): Promise<T> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		apikey: SUPABASE_ANON_KEY,
	};

	try {
		const session = await authBridge.getSession();
		if (session?.access_token) {
			headers['Authorization'] = `Bearer ${session.access_token}`;
		}
	} catch {
		// No session — proceed as anonymous
	}

	const res = await fetch(`${EDGE_URL}/${fnName}`, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	});

	const data = await res.json();

	if (!res.ok) {
		throw new Error(data?.error || `Edge function error (${res.status})`);
	}

	return data as T;
}
