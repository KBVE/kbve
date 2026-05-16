import { persistentAtom } from '@nanostores/persistent';

export interface DroidProfile {
	user_id: string;
	username?: string;
	email?: string;
	profile_exists?: boolean;
	discord?: {
		username?: string;
		avatar_url?: string;
		is_guild_member?: boolean;
	};
	github?: { username?: string; avatar_url?: string };
	twitch?: { username?: string; avatar_url?: string; is_live?: boolean };
	connected_providers?: string[];
	[k: string]: unknown;
}

export interface ProfileCacheEnvelope {
	profile: DroidProfile;
	cached_at: number;
	user_id: string;
}

const PROFILE_CACHE_KEY = 'cache:profile:me';
const SUPABASE_SESSION_STORAGE_KEY = 'sb-auth-token';
export const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;
export const PROFILE_DEFAULT_API_BASE = 'https://kbve.com';

export const $profileCache = persistentAtom<ProfileCacheEnvelope | null>(
	PROFILE_CACHE_KEY,
	null,
	{
		encode: (value) => JSON.stringify(value),
		decode: (raw) => {
			if (!raw || raw === 'null') return null;
			try {
				return JSON.parse(raw) as ProfileCacheEnvelope;
			} catch {
				return null;
			}
		},
	},
);

export function getProfileFromCache(userId: string): DroidProfile | null {
	const entry = $profileCache.get();
	if (!entry) return null;
	if (entry.user_id !== userId) return null;
	if (Date.now() - entry.cached_at > PROFILE_CACHE_TTL_MS) return null;
	return entry.profile;
}

export function setProfileCache(profile: DroidProfile): void {
	if (!profile.user_id) return;
	$profileCache.set({
		profile,
		cached_at: Date.now(),
		user_id: profile.user_id,
	});
}

export function clearProfileCache(): void {
	$profileCache.set(null);
}

export interface CachedSupabaseSession {
	access_token: string;
	refresh_token?: string;
	expires_at?: number;
	user?: {
		id: string;
		email?: string;
		user_metadata?: Record<string, unknown>;
		[k: string]: unknown;
	};
	[k: string]: unknown;
}

export function readSupabaseSessionFromStorage(): CachedSupabaseSession | null {
	if (typeof localStorage === 'undefined') return null;
	const raw = localStorage.getItem(SUPABASE_SESSION_STORAGE_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		if (
			parsed.currentSession &&
			typeof parsed.currentSession === 'object' &&
			'access_token' in parsed.currentSession
		) {
			return parsed.currentSession as CachedSupabaseSession;
		}
		if ('access_token' in parsed) {
			return parsed as CachedSupabaseSession;
		}
		return null;
	} catch {
		return null;
	}
}

export interface FetchProfileOptions {
	token: string;
	apiBase?: string;
	signal?: AbortSignal;
}

export async function fetchProfileFromApi(
	opts: FetchProfileOptions,
): Promise<DroidProfile | null> {
	const base = opts.apiBase ?? PROFILE_DEFAULT_API_BASE;
	const res = await fetch(`${base}/api/v1/profile/me`, {
		method: 'GET',
		headers: {
			Authorization: `Bearer ${opts.token}`,
			Accept: 'application/json',
		},
		signal: opts.signal,
	});
	if (!res.ok) return null;
	try {
		const json = (await res.json()) as DroidProfile;
		if (!json || !json.user_id) return null;
		return json;
	} catch {
		return null;
	}
}

export async function fetchAndCacheProfile(
	opts: FetchProfileOptions,
): Promise<DroidProfile | null> {
	const profile = await fetchProfileFromApi(opts);
	if (profile) setProfileCache(profile);
	return profile;
}

export interface ProfileFastPaintResult {
	session: CachedSupabaseSession;
	profile: DroidProfile;
	stale: boolean;
}

export function readProfileForFastPaint(): ProfileFastPaintResult | null {
	const session = readSupabaseSessionFromStorage();
	if (!session?.user?.id || !session.access_token) return null;
	const entry = $profileCache.get();
	if (!entry || entry.user_id !== session.user.id) return null;
	return {
		session,
		profile: entry.profile,
		stale: Date.now() - entry.cached_at > PROFILE_CACHE_TTL_MS,
	};
}
