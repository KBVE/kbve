import { openUrl } from '@tauri-apps/plugin-opener';
import { onOpenUrl } from '@tauri-apps/plugin-deep-link';
import { load, type Store } from '@tauri-apps/plugin-store';

export const SUPABASE_URL = 'https://supabase.kbve.com';
export const SUPABASE_ANON_KEY =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg';

const REDIRECT = 'chuckrpg-launcher://auth/callback';
const STORE_FILE = 'auth.json';
const SESSION_KEY = 'session';
const SKEW = 60;

export type Provider = 'github' | 'discord';

export type Session = {
	access_token: string;
	refresh_token: string;
	expires_at: number;
};

export type AuthUser = {
	id: string;
	email?: string;
	name?: string;
	avatar_url?: string;
};

let _store: Store | null = null;
async function store(): Promise<Store> {
	if (!_store) _store = await load(STORE_FILE, { autoSave: true, defaults: {} });
	return _store;
}

export async function loadSession(): Promise<Session | null> {
	return (await (await store()).get<Session>(SESSION_KEY)) ?? null;
}

export async function persist(session: Session | null): Promise<void> {
	const s = await store();
	if (session) await s.set(SESSION_KEY, session);
	else await s.delete(SESSION_KEY);
	await s.save();
}

export async function signIn(provider: Provider): Promise<void> {
	const url = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(REDIRECT)}`;
	await openUrl(url);
}

export function parseCallback(url: string): Session | null {
	const frag = url.includes('#')
		? url.slice(url.indexOf('#') + 1)
		: url.includes('?')
			? url.slice(url.indexOf('?') + 1)
			: '';
	if (!frag) return null;
	const p = new URLSearchParams(frag);
	const access_token = p.get('access_token');
	const refresh_token = p.get('refresh_token');
	if (!access_token || !refresh_token) return null;
	const expires_in = Number(p.get('expires_in') ?? '3600');
	return {
		access_token,
		refresh_token,
		expires_at: Math.floor(Date.now() / 1000) + expires_in,
	};
}

export function onCallback(cb: (s: Session) => void): Promise<() => void> {
	return onOpenUrl((urls) => {
		for (const u of urls) {
			const s = parseCallback(u);
			if (s) {
				cb(s);
				break;
			}
		}
	});
}

export async function fetchUser(session: Session): Promise<AuthUser | null> {
	const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
		headers: {
			apikey: SUPABASE_ANON_KEY,
			Authorization: `Bearer ${session.access_token}`,
		},
	});
	if (!res.ok) return null;
	const u = await res.json();
	const m = u.user_metadata ?? {};
	return {
		id: u.id,
		email: u.email,
		name: m.user_name ?? m.full_name ?? m.name ?? u.email,
		avatar_url: m.avatar_url ?? m.picture,
	};
}

async function refresh(session: Session): Promise<Session | null> {
	const res = await fetch(
		`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,
		{
			method: 'POST',
			headers: {
				apikey: SUPABASE_ANON_KEY,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ refresh_token: session.refresh_token }),
		},
	);
	if (!res.ok) return null;
	const d = await res.json();
	return {
		access_token: d.access_token,
		refresh_token: d.refresh_token,
		expires_at:
			d.expires_at ??
			Math.floor(Date.now() / 1000) + (d.expires_in ?? 3600),
	};
}

export async function ensureFresh(session: Session): Promise<Session | null> {
	if (session.expires_at - SKEW > Math.floor(Date.now() / 1000))
		return session;
	return refresh(session);
}
