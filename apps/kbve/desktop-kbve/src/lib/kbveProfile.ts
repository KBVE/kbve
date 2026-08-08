export const KBVE_API_BASE = 'https://kbve.com';

export interface KbveProviderInfo {
	username?: string;
	avatar_url?: string;
	is_guild_member?: boolean;
	is_live?: boolean;
}

export interface KbveProfile {
	user_id: string;
	username?: string;
	email?: string;
	profile_exists?: boolean;
	discord?: KbveProviderInfo;
	github?: KbveProviderInfo;
	twitch?: KbveProviderInfo;
	connected_providers?: string[];
	[k: string]: unknown;
}

export interface KbveBalance {
	account_id: string;
	credits: number;
	khash: number;
	updated_at: string;
}

export async function fetchKbveBalance(
	token: string,
	signal?: AbortSignal,
): Promise<KbveBalance | null> {
	try {
		const res = await fetch(`${KBVE_API_BASE}/api/v1/wallet/me/balance`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
			},
			signal,
		});
		if (!res.ok) return null;
		const json = (await res.json()) as KbveBalance;
		if (!json || !json.account_id) return null;
		return json;
	} catch {
		return null;
	}
}

export async function fetchKbveProfile(
	token: string,
	signal?: AbortSignal,
): Promise<KbveProfile | null> {
	try {
		const res = await fetch(`${KBVE_API_BASE}/api/v1/profile/me`, {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${token}`,
				Accept: 'application/json',
			},
			signal,
		});
		if (!res.ok) return null;
		const json = (await res.json()) as KbveProfile;
		if (!json || !json.user_id) return null;
		return json;
	} catch {
		return null;
	}
}
