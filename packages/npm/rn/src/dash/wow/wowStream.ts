import { createStreamSource } from '../createStreamSource';
import { dashFetch, dashJson } from '../dashFetch';
import type { StreamStore } from '../types';

// The MySQL lane is not a REST surface: the `wow` edge function is a single
// POST command router, matching the astro-kbve wow-account client
// (`${SUPABASE_URL}/functions/v1/wow` with `{ command, ...args }`).

export const WOW_NOT_PROVISIONED =
	'WoW backend not provisioned — MySQL credentials are missing in the cluster.';

export function isNotProvisioned(error: string | null | undefined): boolean {
	return !!error && error.includes(WOW_NOT_PROVISIONED);
}

export interface WowRealm {
	id: number;
	name: string;
	address: string;
	port: number;
	icon: number;
	timezone: number;
	population: number;
}

export interface WowRealmCounts {
	online: number;
	accounts: number;
	bannedAccounts: number;
}

export interface WowCharacter {
	guid: number;
	name: string;
	level: number;
	classId: number;
	raceId: number;
	gender: number;
	zoneId: number;
	mapId: number;
	accountId: number;
	accountName: string;
}

export interface WowAccountRow {
	id: number;
	username: string;
	email: string;
	joindate: string;
	lastIp: string;
	lastLogin: string;
	expansion: number;
	online: boolean;
	gmlevel: number;
	banned: boolean;
	banReason: string | null;
}

export interface RawRealmStatus {
	realms: {
		id: number;
		name: string;
		address: string;
		port: number;
		icon: number;
		timezone: number;
		population: number;
	}[];
	online: number;
	accounts: number;
	banned_accounts: number;
}

export interface RawOnlineCharacters {
	characters: {
		guid: number;
		name: string;
		level: number;
		class_id: number;
		race_id: number;
		gender: number;
		zone_id: number;
		map_id: number;
		account_id: number;
		account_name: string | null;
	}[];
}

export interface RawAccounts {
	accounts: {
		id: number;
		username: string;
		email: string;
		joindate: string;
		last_ip: string;
		last_login: string;
		expansion: number;
		online: number | boolean;
		gmlevel: number;
		banned: number | boolean;
		ban_reason: string | null;
	}[];
	total: number;
}

export interface WowStreamOptions {
	getToken: () => Promise<string | null>;
	baseUrl?: string;
	pollMs?: number;
}

export async function wowCommand<T>(
	baseUrl: string,
	token: string | null,
	command: string,
	args: Record<string, unknown>,
	signal: AbortSignal,
): Promise<T> {
	if (!token) throw new Error('Not signed in');
	const res = await dashFetch(`${baseUrl}/functions/v1/wow`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ command, ...args }),
		signal,
		label: `wow:${command}`,
	});
	if (res.status === 503) throw new Error(WOW_NOT_PROVISIONED);
	if (!res.ok) {
		const body = await res.text().catch(() => '');
		let reason = body;
		try {
			reason = (JSON.parse(body) as { error?: string }).error ?? body;
		} catch {
			/* non-JSON error body — use the raw text */
		}
		throw new Error(
			`wow:${command} → HTTP ${res.status}${reason ? ` ${reason}` : ''}`,
		);
	}
	return dashJson<T>(res, `wow:${command}`);
}

export function mapRealms(raw: RawRealmStatus): WowRealm[] {
	return (raw.realms ?? []).map((r) => ({
		id: r.id,
		name: r.name,
		address: r.address,
		port: r.port,
		icon: r.icon,
		timezone: r.timezone,
		population: r.population,
	}));
}

export function mapRealmCounts(raw: RawRealmStatus): WowRealmCounts {
	return {
		online: raw.online ?? 0,
		accounts: raw.accounts ?? 0,
		bannedAccounts: raw.banned_accounts ?? 0,
	};
}

export function mapCharacters(raw: RawOnlineCharacters): WowCharacter[] {
	return (raw.characters ?? [])
		.map((c) => ({
			guid: c.guid,
			name: c.name,
			level: c.level,
			classId: c.class_id,
			raceId: c.race_id,
			gender: c.gender,
			zoneId: c.zone_id,
			mapId: c.map_id,
			accountId: c.account_id,
			accountName: c.account_name ?? '',
		}))
		.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}

export function mapAccounts(raw: RawAccounts): WowAccountRow[] {
	return (raw.accounts ?? []).map((a) => ({
		id: a.id,
		username: a.username,
		email: a.email,
		joindate: a.joindate,
		lastIp: a.last_ip,
		lastLogin: a.last_login,
		expansion: a.expansion,
		online: !!a.online,
		gmlevel: a.gmlevel,
		banned: !!a.banned,
		banReason: a.ban_reason ?? null,
	}));
}

// The realm items and the realm counts come from one `staff.realm_status`
// response, but the stream fetches items and meta as separate calls; this
// short TTL lets a single poll reuse the one round trip.
const REALM_TTL_MS = 2_000;
let realmCache: { at: number; key: string; raw: RawRealmStatus } | null = null;

async function realmStatus(
	baseUrl: string,
	token: string | null,
	signal: AbortSignal,
): Promise<RawRealmStatus> {
	const key = baseUrl;
	if (realmCache && realmCache.key === key && Date.now() - realmCache.at < REALM_TTL_MS) {
		return realmCache.raw;
	}
	const raw = await wowCommand<RawRealmStatus>(
		baseUrl,
		token,
		'staff.realm_status',
		{},
		signal,
	);
	realmCache = { at: Date.now(), key, raw };
	return raw;
}

export function createWowRealmStream(
	opts: WowStreamOptions,
): StreamStore<WowRealm> {
	const { getToken, baseUrl = '', pollMs = 15_000 } = opts;
	return createStreamSource<WowRealm, WowRealm>({
		key: 'wow:realms',
		pollMs,
		cacheTtlMs: 60_000,
		id: (it) => String(it.id),
		signature: (it) =>
			`${it.name}|${it.address}:${it.port}|${it.icon}|${it.population}`,
		normalize: (x) => x,
		fetch: async ({ signal }) => {
			const token = await getToken().catch(() => null);
			return mapRealms(await realmStatus(baseUrl, token, signal));
		},
		fetchMeta: async ({ signal }) => {
			const token = await getToken().catch(() => null);
			return mapRealmCounts(await realmStatus(baseUrl, token, signal));
		},
	});
}

export function createWowCharacterStream(
	opts: WowStreamOptions,
): StreamStore<WowCharacter> {
	const { getToken, baseUrl = '', pollMs = 10_000 } = opts;
	return createStreamSource<WowCharacter, WowCharacter>({
		key: 'wow:characters',
		pollMs,
		cacheTtlMs: 30_000,
		id: (it) => String(it.guid),
		signature: (it) => `${it.level}|${it.zoneId}|${it.mapId}`,
		normalize: (x) => x,
		fetch: async ({ signal }) => {
			const token = await getToken().catch(() => null);
			return mapCharacters(
				await wowCommand<RawOnlineCharacters>(
					baseUrl,
					token,
					'staff.online_characters',
					{},
					signal,
				),
			);
		},
	});
}

export async function fetchWowAccounts(
	opts: {
		getToken: () => Promise<string | null>;
		baseUrl?: string;
	},
	args: { limit?: number; offset?: number; search?: string } = {},
	signal: AbortSignal = new AbortController().signal,
): Promise<{ accounts: WowAccountRow[]; total: number }> {
	const { getToken, baseUrl = '' } = opts;
	const token = await getToken().catch(() => null);
	const raw = await wowCommand<RawAccounts>(
		baseUrl,
		token,
		'staff.accounts',
		{
			limit: args.limit ?? 50,
			offset: args.offset ?? 0,
			search: args.search ?? '',
		},
		signal,
	);
	return { accounts: mapAccounts(raw), total: raw.total ?? 0 };
}
