import { wrap } from 'comlink'
import type { LocalStorageAPI } from './db-worker'


declare global {
	interface Window {
		_runInSW?: any
		_runInStorage?: Awaited<ReturnType<typeof initStorageComlink>>
	}
}

function initSWComlink() {
	if (!navigator.serviceWorker?.controller) return

	const channel = new MessageChannel()
	navigator.serviceWorker.controller.postMessage(channel.port2, [channel.port2])
	window._runInSW = wrap(channel.port1)
	channel.port1.start()
}

export function initStorageComlink() {
	console.log('[MASTA] - ComLink Storage...')

	const worker = new SharedWorker(new URL('./db-worker', import.meta.url));
	worker.port.start()
	const api = wrap<LocalStorageAPI>(worker.port)
	window._runInStorage = api
	return api
}

let initialized = false

export function main() {
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

	initStorageComlink()
}

main()

if (typeof window !== 'undefined') {
	window.addEventListener('astro:after-swap', () => {
		main()
	})
}