import { expose, proxy } from 'comlink'
import { persistentAtom, persistentMap } from '@nanostores/persistent'
import Dexie, { type Table } from 'dexie'

interface SharedWorkerGlobalScope extends Worker {
	onconnect: (event: MessageEvent) => void;
}
declare const self: SharedWorkerGlobalScope

// --- Nanostores Layer ---
const atomStore = new Map<string, ReturnType<typeof persistentAtom<string | undefined>>>()
const mapStore = new Map<string, ReturnType<typeof persistentMap<Record<string, any>>>>()

function getAtom(key: string) {
	if (!atomStore.has(key)) {
		atomStore.set(key, persistentAtom<string | undefined>(key, undefined))
	}
	return atomStore.get(key)!
}

function getMap(key: string) {
	if (!mapStore.has(key)) {
		mapStore.set(
			key,
			persistentMap<Record<string, any>>(key, {}, {
				encode: JSON.stringify,
				decode: JSON.parse
			})
		)
	}
	return mapStore.get(key)!
}

// --- Dexie Layer ---
class AppDexie extends Dexie {
	settings!: Table<{ id: string; value: any }, string>
	constructor() {
		super('AppStorage')
		this.version(1).stores({
			settings: '&id',
		})
	}
}
const db = new AppDexie()

// --- Unified Storage API ---
const storageAPI = {
	// ATOM
	getAtom(key: string): string | undefined {
		return getAtom(key).get()
	},
	setAtom(key: string, value: string) {
		getAtom(key).set(value)
	},
	subscribeAtom(key: string, cb: (val: string | undefined) => void) {
		const unsub = getAtom(key).subscribe(proxy(cb))
		return () => unsub()
	},
	hasAtom(key: string): boolean {
		return atomStore.has(key)
	},

	// MAP
	getMapKey(mapKey: string, field: string): any {
		return getMap(mapKey).get()[field]
	},
	setMapKey(mapKey: string, field: string, value: any) {
		getMap(mapKey).setKey(field, value)
	},
	getMapSnapshot(mapKey: string): Record<string, any> {
		return getMap(mapKey).get()
	},
	deleteMapKey(mapKey: string, field: string) {
		const map = getMap(mapKey)
		const current = { ...map.get() }
		delete current[field]
		map.set(current)
	},
	subscribeMap(mapKey: string, cb: (val: Record<string, any>) => void) {
		const unsub = getMap(mapKey).subscribe(proxy(cb))
		return () => unsub()
	},
	hasMap(mapKey: string): boolean {
		return mapStore.has(mapKey)
	},

	// DEXIE
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

	// i18n helpers (now using getMap)
	async loadI18nFromJSON(path = '/i18n/db.json') {
		try {
			const res = await fetch(path)
			const data: Record<string, string> = await res.json()
			for (const [key, value] of Object.entries(data)) {
				getMap('i18n-cache').setKey(key, value)
			}
		} catch (e) {
			console.warn('[i18n] Failed to load translations:', e)
		}
	},

	getLocale(): string {
		return getAtom('locale').get() ?? 'en'
	},
	setLocale(locale: string) {
		getAtom('locale').set(locale)
	},

	getTranslation(lang: string, ns: string, key: string): string | undefined {
		return getMap('i18n-cache').get()[`${lang}:${ns}:${key}`]
	},
	setTranslation(lang: string, ns: string, key: string, value: string) {
		getMap('i18n-cache').setKey(`${lang}:${ns}:${key}`, value)
	},

	// Clear everything
	clearAll() {
		for (const atom of atomStore.values()) atom.set(undefined)
		for (const map of mapStore.values()) map.set({})
		localStorage.clear()
		db.settings.clear()
	}
}

export type LocalStorageAPI = typeof storageAPI

self.onconnect = (event: MessageEvent) => {
	const port = event.ports[0]
	port.start()
	expose(storageAPI, port)
}
