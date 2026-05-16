import { persistentAtom } from '@nanostores/persistent';
import { $auth, setAuth, AuthPresets } from './auth';

export interface StaffPermsEnvelope {
	bitmask: number;
	cached_at: number;
	user_id: string;
}

const STAFF_CACHE_KEY = 'cache:staff:perms';
const SUPABASE_DEFAULT_URL = 'https://supabase.kbve.com';
export const STAFF_CACHE_TTL_MS = 10 * 60 * 1000;

export const $staffPermissions = persistentAtom<StaffPermsEnvelope | null>(
	STAFF_CACHE_KEY,
	null,
	{
		encode: (value) => JSON.stringify(value),
		decode: (raw) => {
			if (!raw || raw === 'null') return null;
			try {
				return JSON.parse(raw) as StaffPermsEnvelope;
			} catch {
				return null;
			}
		},
	},
);

export function getStaffPermsFromCache(userId: string): number | null {
	const entry = $staffPermissions.get();
	if (!entry) return null;
	if (entry.user_id !== userId) return null;
	if (Date.now() - entry.cached_at > STAFF_CACHE_TTL_MS) return null;
	return entry.bitmask;
}

export function setStaffPermsCache(userId: string, bitmask: number): void {
	if (!userId) return;
	$staffPermissions.set({ bitmask, cached_at: Date.now(), user_id: userId });
}

export function clearStaffPermsCache(): void {
	$staffPermissions.set(null);
}

export interface FetchStaffPermsOptions {
	token: string;
	apikey: string;
	supabaseUrl?: string;
	signal?: AbortSignal;
}

export async function fetchStaffPermissionsFromApi(
	opts: FetchStaffPermsOptions,
): Promise<number | null> {
	const base = opts.supabaseUrl ?? SUPABASE_DEFAULT_URL;
	const res = await fetch(`${base}/rest/v1/rpc/staff_permissions`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${opts.token}`,
			'Content-Type': 'application/json',
			apikey: opts.apikey,
		},
		body: '{}',
		signal: opts.signal,
	});
	if (!res.ok) return null;
	try {
		const data = await res.json();
		if (typeof data === 'number') return data;
		return null;
	} catch {
		return null;
	}
}

export async function fetchAndCacheStaffPermissions(
	opts: FetchStaffPermsOptions & { userId: string },
): Promise<number | null> {
	const bitmask = await fetchStaffPermissionsFromApi(opts);
	if (bitmask === null) return null;
	setStaffPermsCache(opts.userId, bitmask);
	return bitmask;
}

/**
 * Apply STAFF flag to `$auth` if the cached staff permissions for
 * `userId` are non-zero. Returns the bitmask (or null when no cache /
 * stale / non-matching user).
 */
export function applyStaffFlagFromCache(userId: string): number | null {
	const bitmask = getStaffPermsFromCache(userId);
	if (bitmask === null) return null;
	if (bitmask > 0) {
		const state = $auth.get();
		if (state.tone === 'auth' && state.id === userId) {
			setAuth({ flags: AuthPresets.STAFF });
		}
	}
	return bitmask;
}

/**
 * Compose: synchronously paint STAFF flag from cache, then refresh in
 * the background. Caller decides whether to await the returned
 * promise.
 */
export function bootStaffPermissions(opts: {
	userId: string;
	token: string;
	apikey: string;
	supabaseUrl?: string;
}): { cachedBitmask: number | null; refresh: Promise<number | null> } {
	const cachedBitmask = applyStaffFlagFromCache(opts.userId);
	const refresh = fetchAndCacheStaffPermissions(opts)
		.then((bitmask) => {
			if (bitmask !== null && bitmask > 0) {
				const state = $auth.get();
				if (state.tone === 'auth' && state.id === opts.userId) {
					setAuth({ flags: AuthPresets.STAFF });
				}
			}
			return bitmask;
		})
		.catch(() => null);
	return { cachedBitmask, refresh };
}
