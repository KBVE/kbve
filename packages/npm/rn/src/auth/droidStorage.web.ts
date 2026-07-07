import Dexie from 'dexie';
import type { Table } from 'dexie';
import type { AuthSession } from '@kbve/core';
import { claimUsername } from './supabase';

const SESSION_KEY = 'sb-auth-token';
const PROFILE_KEY = 'cache:profile:me';
const STAFF_KEY = 'cache:staff:perms';
const SYNC_CHANNEL = 'kbve-droid-sync';
const AUTH_DB = 'sb-auth-v2';

interface KVPair {
	key: string;
	value: string;
}

class DroidAuthDB extends Dexie {
	kv!: Table<KVPair>;

	constructor() {
		super(AUTH_DB);
		this.version(1).stores({ kv: 'key' });
	}
}

interface RawSession {
	access_token: string;
	refresh_token?: string;
	expires_at?: number;
	user?: { id: string; email?: string };
}

interface ProfileEnvelope {
	profile: { username?: string };
	user_id: string;
}

function parseRawSession(raw: string | null): RawSession | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		const candidate =
			parsed.currentSession &&
			typeof parsed.currentSession === 'object' &&
			'access_token' in parsed.currentSession
				? parsed.currentSession
				: parsed;
		if (!candidate.access_token || !candidate.user?.id) return null;
		return candidate as RawSession;
	} catch {
		return null;
	}
}

function readProfileUsername(userId: string): string | null {
	if (typeof localStorage === 'undefined') return null;
	try {
		const raw = localStorage.getItem(PROFILE_KEY);
		if (!raw || raw === 'null') return null;
		const envelope = JSON.parse(raw) as ProfileEnvelope;
		if (envelope?.user_id !== userId) return null;
		return envelope.profile?.username ?? null;
	} catch {
		return null;
	}
}

function toAuthSession(raw: RawSession | null): AuthSession | null {
	if (!raw?.user?.id) return null;
	return {
		accessToken: raw.access_token,
		refreshToken: raw.refresh_token ?? '',
		expiresAt: raw.expires_at ?? null,
		user: {
			id: raw.user.id,
			email: raw.user.email ?? null,
			username:
				readProfileUsername(raw.user.id) ??
				claimUsername(raw.access_token),
		},
	};
}

export function readDroidSession(): AuthSession | null {
	if (typeof localStorage === 'undefined') return null;
	return toAuthSession(parseRawSession(localStorage.getItem(SESSION_KEY)));
}

export async function readDroidSessionFromIdb(): Promise<AuthSession | null> {
	if (typeof indexedDB === 'undefined') return null;
	const db = new DroidAuthDB();
	try {
		const item = await db.kv.get(SESSION_KEY);
		if (item?.value) {
			return toAuthSession(parseRawSession(item.value));
		}
		// AuthBridge persists via supabase-js' default storageKey
		// (sb-<ref>-auth-token) into the same kv table — scan for it.
		const rows = await db.kv.toArray();
		for (const row of rows) {
			if (!/^sb-.+auth-token$/.test(row.key)) continue;
			const session = toAuthSession(parseRawSession(row.value));
			if (session) return session;
		}
		return null;
	} catch {
		return null;
	} finally {
		db.close();
	}
}

export function subscribeDroidSession(
	cb: (session: AuthSession | null) => void,
): () => void {
	if (typeof window === 'undefined') return () => undefined;
	const emit = () => {
		const session = readDroidSession();
		if (session) return cb(session);
		void readDroidSessionFromIdb().then(cb);
	};
	const onStorage = (event: StorageEvent) => {
		if (event.key === null) return emit();
		if (event.key === SESSION_KEY || event.key === PROFILE_KEY) emit();
	};
	window.addEventListener('storage', onStorage);
	let channel: BroadcastChannel | null = null;
	if (typeof BroadcastChannel !== 'undefined') {
		try {
			channel = new BroadcastChannel(SYNC_CHANNEL);
			channel.onmessage = (event: MessageEvent) => {
				const type = event.data?.type;
				if (type === 'profile-refresh' || type === 'profile-clear') {
					emit();
				}
			};
		} catch {
			channel = null;
		}
	}
	return () => {
		window.removeEventListener('storage', onStorage);
		channel?.close();
	};
}

export interface DroidSignOutConfig {
	supabaseUrl: string;
	anonKey: string;
}

export async function droidSignOut(config: DroidSignOutConfig): Promise<void> {
	const session = readDroidSession() ?? (await readDroidSessionFromIdb());
	if (session) {
		try {
			await fetch(`${config.supabaseUrl}/auth/v1/logout`, {
				method: 'POST',
				headers: {
					apikey: config.anonKey,
					Authorization: `Bearer ${session.accessToken}`,
				},
			});
		} catch {
			/* best effort */
		}
	}
	try {
		localStorage.removeItem(SESSION_KEY);
		localStorage.removeItem(PROFILE_KEY);
		localStorage.removeItem(STAFF_KEY);
	} catch {
		/* best effort */
	}
	if (typeof indexedDB !== 'undefined') {
		const db = new DroidAuthDB();
		try {
			await db.kv.clear();
		} catch {
			/* best effort */
		} finally {
			db.close();
		}
	}
	if (typeof BroadcastChannel !== 'undefined') {
		try {
			const channel = new BroadcastChannel(SYNC_CHANNEL);
			channel.postMessage({ type: 'profile-clear' });
			channel.close();
		} catch {
			/* best effort */
		}
	}
}
