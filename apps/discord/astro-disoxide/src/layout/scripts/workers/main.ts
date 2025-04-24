import { wrap } from 'comlink'
import type { Remote } from 'comlink'
import { persistentMap } from '@nanostores/persistent'

import type { LocalStorageAPI } from './db-worker'
import { initializeWorkerDatabase, type InitWorkerOptions } from './init'

const EXPECTED_DB_VERSION = '1.0.0'

declare global {
	interface Window {
		_runInSW?: any
		_runInStorage?: Awaited<ReturnType<typeof initStorageComlink>>
		i18n?: typeof i18n
	}
}

//	*	Nanostores Layer

const i18nStore = persistentMap<Record<string, string>>('i18n-cache', {}, {
	encode: JSON.stringify,
	decode: JSON.parse,
})

export const i18n = {
	store: i18nStore,
	api: null as Remote<LocalStorageAPI> | null,

	get(key: string): string {
		return i18nStore.get()[key] ?? `[${key}]`
	},

	async getAsync(key: string): Promise<string> {
		const cached = i18nStore.get()[key]
		if (cached !== undefined) return cached

		if (!this.api) return `[${key}]`

		const value = await this.api.getTranslation(key)
		if (value !== null) {
			i18nStore.setKey(key, value)
			return value
		}

		return `[${key}]`
	},

	set(key: string, value: string) {
		i18nStore.setKey(key, value)
	},

	async hydrate(api: Remote<LocalStorageAPI>, keys: string[]) {
		this.api = api
		for (const key of keys) {
			const value = await api.getTranslation(key)
			if (value !== null) {
				i18nStore.setKey(key, value)
			}
		}
	},

	async hydrateLocale(locale = 'en') {
		if (!this.api) return
	
		const allKeys = await this.api.listKeysKV('i18n')
		const filteredKeys = allKeys.filter((key) => key.startsWith(`${locale}:`))
	
		const batch = await this.api.getBatchKV('i18n', filteredKeys)
		for (const [key, value] of Object.entries(batch)) {
			this.store.setKey(key, value)
		}
	}
}



// 	*	ComLink Layer

function initSWComlink() {
	if (!navigator.serviceWorker?.controller) return

	const channel = new MessageChannel()
	navigator.serviceWorker.controller.postMessage(channel.port2, [channel.port2])
	window._runInSW = wrap(channel.port1)
	channel.port1.start()
}

export async function initStorageComlink(): Promise<Remote<LocalStorageAPI>> {
	console.log('[MASTA] (init)* -> Storage ComLink...')

	const worker = new SharedWorker(
		new URL('./db-worker', import.meta.url),
		{ type: 'module' } 
	)	
	worker.port.start()


	const api = wrap<LocalStorageAPI>(worker.port)
	window._runInStorage = api

	const currentVersion = await api.getVersion()
	console.log(`[MASTA] (info) - Shared Worker ${currentVersion}`)

	if (currentVersion !== EXPECTED_DB_VERSION) {
		// console.log('[MASTA] : [INIT]!!!')

		const initOptions: InitWorkerOptions = {
			version: EXPECTED_DB_VERSION,
			i18nPath: '/i18n/db.json',
			locale: 'en',
			defaults: {
				welcome: 'Welcome to the app!',
				theme: 'dark',
			},
		}

		await initializeWorkerDatabase(api, initOptions)
	} else {
		// console.log('[MASTA] : [INIT] -> Skipped')
	}

	console.log('[MASTA] (fin) -> ComLink Storage Complete!')

	return api
}


//	*	[MASTA] Main

let initialized = false

export async function main() {
	console.log('[MASTA] - Main Execution...')
	if (initialized) return
	initialized = true

	if (navigator.serviceWorker?.controller) {
		initSWComlink()
	} else {
		navigator.serviceWorker?.addEventListener('controllerchange', () => {
			initSWComlink()
		})
	}

	const api = await initStorageComlink()
	i18n.api = api
	await i18n.hydrateLocale('en')

	if (typeof window !== 'undefined') {
		window.i18n = i18n
		console.log('[MASTA] 🌐 window.i18n ready')
	}
}

main()

//	! Astro Swap Safety

if (typeof window !== 'undefined') {
	window.addEventListener('astro:after-swap', () => {
		main()
	})
}