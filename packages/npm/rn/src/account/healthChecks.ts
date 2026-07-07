import type { HealthCheck } from './types';

export interface WebCaps {
	serviceWorker: boolean;
	storage: boolean;
	indexedDB: boolean;
	online: boolean;
}

export function evaluateHealthChecks(caps: WebCaps): HealthCheck[] {
	return [
		{
			label: 'Service Worker',
			status: caps.serviceWorker ? 'ok' : 'unavailable',
		},
		{ label: 'Local Storage', status: caps.storage ? 'ok' : 'unavailable' },
		{ label: 'IndexedDB', status: caps.indexedDB ? 'ok' : 'unavailable' },
		{
			label: 'Network',
			status: caps.online ? 'ok' : 'error',
			detail: caps.online ? undefined : 'Offline',
		},
	];
}
