import { expose } from 'comlink';
import Dexie, { type Table } from 'dexie';
import type { DiscordServer, DiscordTag, Profile } from '../types/discord';
import { toReference } from './flexbuilder';

interface SharedWorkerGlobalScope extends Worker {
	onconnect: (event: MessageEvent) => void;
}
declare const self: SharedWorkerGlobalScope;

class AppDexie extends Dexie {
	settings!: Table<{ id: string; value: any }, string>;
	meta!: Table<{ key: string; value: any }, string>;
	i18n!: Table<{ key: string; value: string }, string>;
	htmlservers!: Table<{ key: string; value: string }, string>;
	servers!: Table<DiscordServer, string>;
	tags!: Table<DiscordTag, string>;
	profiles!: Table<Profile, string>;
	ws_messages!: Table<{ key: string; message: any }, string>;

	constructor() {
		super('AppStorage');
		this.version(3).stores({
			settings: '&id',
			meta: '&key',
			i18n: '&key',
			htmlservers: '&key',
			servers: '&server_id',
			tags: '&tag_id',
			profiles: '&profile_id',
			ws_messages: '&key',
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
	async loadI18nFromJSON(path = 'https://discord.sh/i18n/db.json') {
	const res = await fetch(path);
	const data = await res.json();
	await storageAPI.putI18nBatch(data);
	},
	async getAllI18nKeys(): Promise<string[]> {
		const all = await db.i18n.toCollection().primaryKeys();
		return all as string[];
	},

	async loadServersFromJSON(path = 'https://discord.sh/data/servers.json') {
		const res = await fetch(path);
		const data = await res.json();
	
		// The JSON should be a Record<string, DiscordServer>
		const servers: DiscordServer[] = Object.values(data);
		await storageAPI.putServers(servers);
		await storageAPI.syncHtmlFromServers();
	},

	// HTML PreRender
	async syncHtmlFromServers() {
		const allServers = await db.servers.toArray();
		const existingHtmlKeys = await db.htmlservers.toCollection().primaryKeys();
		const missing: { key: string; value: string }[] = [];
	
		for (const server of allServers) {
			if (!existingHtmlKeys.includes(server.server_id)) {
				const html = renderHtmlForServer(server);
				missing.push({ key: server.server_id, value: html });
			}
		}
	
		if (missing.length > 0) {
			await db.htmlservers.bulkPut(missing);
			console.info(`[syncHtmlFromServers] Generated ${missing.length} HTML cards.`);
		} else {
			console.info('[syncHtmlFromServers] All servers already have HTML cards.');
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
};

export type LocalStorageAPI = typeof storageAPI;

self.onconnect = (event: MessageEvent) => {
	const port = event.ports[0];
	port.start();
	expose(storageAPI, port);
};
