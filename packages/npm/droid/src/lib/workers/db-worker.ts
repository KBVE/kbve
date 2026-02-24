import { expose } from 'comlink';
import Dexie, { type Table } from 'dexie';
import type { DiscordServer, DiscordTag, Profile } from '../types/discord';
import { toReference } from './flexbuilder';

interface SharedWorkerGlobalScope extends Worker {
	onconnect: (event: MessageEvent) => void;
}
declare const self: SharedWorkerGlobalScope;

class AppDexie extends Dexie {
	settings!: Table<{ id: string; value: any }>;
	meta!: Table<{ key: string; value: any }>;
	i18n!: Table<{ key: string; value: string }>;
	htmlservers!: Table<{ key: string; value: string }>;
	servers!: Table<DiscordServer>;
	tags!: Table<DiscordTag>;
	profiles!: Table<Profile>;
	ws_messages!: Table<{ key: string; message: any }>;
	auth_tokens!: Table<{ key: string; value: string; expires_at?: number }>;

	constructor() {
		super('AppStorage');
		this.version(4).stores({
			settings: '&id',
			meta: '&key',
			i18n: '&key',
			htmlservers: '&key',
			servers: '&server_id',
			tags: '&tag_id',
			profiles: '&profile_id',
			ws_messages: '&key',
			auth_tokens: '&key',
		});
	}
}
const db = new AppDexie();

function delay(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}

function renderHtmlForServer(server: DiscordServer): string {
	return `
		<div class="flex flex-col gap-2 p-2">
			<img src="${server.logo}" alt="${server.name}" class="w-12 h-12 rounded-full" />
			<h3 class="text-lg font-bold">${server.name}</h3>
			<p class="text-sm opacity-70">${server.summary}</p>
			<a href="${server.invite}" class="text-purple-400 underline text-xs">Join Join Join</a>
		</div>
	`.trim();
}

// --- Comlink-Safe API ---
const storageAPI = {
	// WebSocket

	async storeWsMessage(key: string, buffer: ArrayBuffer) {
		const decoded = toReference(buffer).toObject();
		await db.ws_messages.put({ key, message: decoded });
	},

	async getWsMessage(key: string) {
		return (await db.ws_messages.get(key))?.message ?? null;
	},

	async getAllWsMessages(): Promise<{ key: string; message: any }[]> {
		const raw = await db.ws_messages.toArray();
		return raw.sort((a, b) => {
			const at = Number(a.key.split(':')[1]);
			const bt = Number(b.key.split(':')[1]);
			return bt - at;
		});
	},

	async clearWsMessages() {
		await db.ws_messages.clear();
	},

	// I18n
	async getTranslation(key: string) {
		return (await db.i18n.get(key))?.value ?? null;
	},
	async getTranslations(keys: string[]) {
		const result: Record<string, string> = {};
		for (const key of keys) {
			const val = await db.i18n.get(key);
			if (val) result[key] = val.value;
		}
		return result;
	},
	async putI18nBatch(data: Record<string, string>) {
		const entries = Object.entries(data).map(([key, value]) => ({
			key,
			value,
		}));
		await db.i18n.bulkPut(entries);
	},
	async loadI18nFromJSON(path: string) {
		const res = await fetch(path);
		if (!res.ok) {
			console.warn(
				`[db-worker] i18n fetch failed: ${res.status} ${res.statusText}`,
			);
			return;
		}
		const data = await res.json();
		await storageAPI.putI18nBatch(data);
	},
	async getAllI18nKeys(): Promise<string[]> {
		return (await db.i18n.toCollection().primaryKeys()) as string[];
	},

	async loadServersFromJSON(path: string) {
		const res = await fetch(path);
		if (!res.ok) {
			console.warn(
				`[db-worker] servers fetch failed: ${res.status} ${res.statusText}`,
			);
			return;
		}
		const data = await res.json();

		// The JSON should be a Record<string, DiscordServer>
		const servers: DiscordServer[] = Object.values(data);
		await storageAPI.putServers(servers);
		await storageAPI.syncHtmlFromServers();
	},

	// HTML PreRender
	async syncHtmlFromServers() {
		const allServers = await db.servers.toArray();
		const existingHtmlKeys = await db.htmlservers
			.toCollection()
			.primaryKeys();
		const missing: { key: string; value: string }[] = [];

		for (const server of allServers) {
			if (!existingHtmlKeys.includes(server.server_id)) {
				const html = renderHtmlForServer(server);
				missing.push({ key: server.server_id, value: html });
			}
		}

		if (missing.length > 0) {
			await db.htmlservers.bulkPut(missing);
			console.info(
				`[syncHtmlFromServers] Generated ${missing.length} HTML cards.`,
			);
		} else {
			console.info(
				'[syncHtmlFromServers] All servers already have HTML cards.',
			);
		}
	},

	// Settings
	async dbSet(id: string, value: any) {
		await db.settings.put({ id, value });
	},
	async dbGet(id: string) {
		return (await db.settings.get(id))?.value ?? null;
	},
	async dbClear() {
		await db.settings.clear();
	},

	// Meta
	async setVersion(version: string) {
		await db.meta.put({ key: 'version', value: version });
	},
	async getVersion() {
		return (await db.meta.get('version'))?.value ?? null;
	},
	async markSeeded() {
		await db.meta.put({ key: 'db_seeded', value: true });
	},
	async checkSeeded() {
		return (await db.meta.get('db_seeded'))?.value === true;
	},

	// Servers
	async putServers(servers: DiscordServer[]) {
		await db.servers.bulkPut(servers);
	},
	async getAllServers() {
		return await db.servers.toArray();
	},

	// HTML servers
	async putHtmlCards(data: { key: string; value: string }[]) {
		await db.htmlservers.bulkPut(data);
	},
	async getHtmlCard(key: string) {
		return (await db.htmlservers.get(key))?.value ?? null;
	},

	// Tags
	async putTags(tags: DiscordTag[]) {
		await db.tags.bulkPut(tags);
	},
	async getAllTags() {
		return await db.tags.toArray();
	},

	// Profiles
	async putProfiles(profiles: Profile[]) {
		await db.profiles.bulkPut(profiles);
	},
	async getAllProfiles() {
		return await db.profiles.toArray();
	},

	// Auth Tokens (IDB-backed auth storage)
	async setAuthToken(key: string, value: string, expiresAt?: number) {
		await db.auth_tokens.put({ key, value, expires_at: expiresAt });
	},
	async getAuthToken(key: string): Promise<string | null> {
		const record = await db.auth_tokens.get(key);
		if (!record) return null;
		if (record.expires_at && Date.now() > record.expires_at) {
			await db.auth_tokens.delete(key);
			return null;
		}
		return record.value;
	},
	async removeAuthToken(key: string) {
		await db.auth_tokens.delete(key);
	},
	async clearAuthTokens() {
		await db.auth_tokens.clear();
	},
};

export type LocalStorageAPI = typeof storageAPI;

const ports = new Set<MessagePort>();

self.onconnect = (event: MessageEvent) => {
	const port = event.ports[0];
	const isFirst = ports.size === 0;
	ports.add(port);
	port.start();
	port.postMessage({ type: isFirst ? 'first-connect' : 'reconnect' });
	expose(storageAPI, port);
};
