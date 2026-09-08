import { load, type Store } from '@tauri-apps/plugin-store';
import type { Session } from '@kbve/tauri';

const FILE = 'auth.json';
const KEY = 'session';

let _store: Store | null = null;
async function store(): Promise<Store> {
	if (!_store) _store = await load(FILE, { autoSave: true, defaults: {} });
	return _store;
}

export async function loadSession(): Promise<Session | null> {
	return (await (await store()).get<Session>(KEY)) ?? null;
}

export async function saveSession(session: Session | null): Promise<void> {
	const s = await store();
	if (session) await s.set(KEY, session);
	else await s.delete(KEY);
	await s.save();
}
