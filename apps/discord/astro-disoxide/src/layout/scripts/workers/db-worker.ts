import { expose } from 'comlink'
import Dexie, { type Table } from 'dexie'

interface SharedWorkerGlobalScope extends Worker {
	onconnect: (event: MessageEvent) => void;
}
declare const self: SharedWorkerGlobalScope


// --- Dexie Layer ---
type BatchableTable = keyof Pick<AppDexie, 'meta' | 'settings' | 'i18n'>

class AppDexie extends Dexie {
	settings!: Table<{ id: string; value: any }, string>
	meta!: Table<{ key: string; value: any }, string> 
	i18n!: Table<{ key: string; value: string }, string>

	constructor() {
		super('AppStorage')
		this.version(2).stores({
			settings: '&id',
			meta: '&key',
			i18n: '&key',
		})
	}
}
const db = new AppDexie()

// --- Unified Storage API ---
const storageAPI = {

	// ADVANCE
	async getBatchKV<T extends BatchableTable>(
		table: T,
		keys: string[]
	): Promise<Record<string, any>> {
		const tableRef = db[table] as Table<{ key: string; value: any }, string>
		const entries = await tableRef.bulkGet(keys)
	
		const result: Record<string, any> = {}
		entries.forEach((entry, i) => {
			if (entry) result[keys[i]] = entry.value
		})
	
		return result
	},
	async putBatchKV<T extends BatchableTable>(
		table: T,
		data: Record<string, any>
	): Promise<void> {
		const tableRef = db[table] as Table<{ key: string; value: any }, string>
	
		const entries = Object.entries(data).map(([key, value]) => ({
			key,
			value,
		}))
	
		await tableRef.bulkPut(entries)
	},
	async putBatchKVFromJSON<T extends BatchableTable>(table: T, path: string): Promise<void> {
		try {
			const res = await fetch(path)
			const json = await res.json()
			await storageAPI.putBatchKV(table, json)
			console.log(`[db-worker] Loaded ${table} from ${path}:`, Object.keys(json).length, 'entries')
		} catch (e) {
			console.warn(`[db-worker] Failed to load ${table} from ${path}:`, e)
		}
	},
	async listKeysKV<T extends BatchableTable>(table: T): Promise<string[]> {
		const tableRef = db[table] as Table<any, string>
		return await tableRef.toCollection().primaryKeys()
	},
	async getKeysByPrefix<T extends BatchableTable>(table: T, prefix: string): Promise<string[]> {
		const allKeys = await storageAPI.listKeysKV(table)
		return allKeys.filter(key => key.startsWith(prefix))
	},
	// SETTINGS (General)
	async dbSet(id: string, value: any) {
		await db.settings.put({ id, value })
	},
	async dbGet(id: string) {
		const entry = await db.settings.get(id)
		return entry?.value ?? null
	},
	async dbDelete(id: string) {
		await db.settings.delete(id)
	},
	async dbKeys(): Promise<string[]> {
		return (await db.settings.toCollection().primaryKeys()) as string[]
	},
	async dbClear() {
		await db.settings.clear()
	},

	// META (Versioning)
	async getVersion(): Promise<string | null> {
		const entry = await db.meta.get('version')
		return entry?.value ?? null
	},
	async setVersion(version: string) {
		await db.meta.put({ key: 'version', value: version })
	},

	// I18N TABLE
	async loadI18nFromJSON(path = '/i18n/db.json') {
		await storageAPI.putBatchKVFromJSON('i18n', path)
	},
	async getTranslation(key: string): Promise<string | null> {
		const entry = await db.i18n.get(key)
		return entry?.value ?? null
	},
	async getTranslations(keys: string[]): Promise<Record<string, string>> {
		const result: Record<string, string> = {}
		for (const key of keys) {
			const entry = await db.i18n.get(key)
			if (entry) result[key] = entry.value
		}
		return result
	}
}

export type LocalStorageAPI = typeof storageAPI

self.onconnect = (event: MessageEvent) => {
	const port = event.ports[0]
	port.start()
	expose(storageAPI, port)
}