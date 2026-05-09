import { SITE_GRAPH_WORKER_SOURCE } from './worker-source';
import type { SiteGraphData } from '../types';

let activePort: MessagePort | null = null;
let activeWorker: SharedWorker | null = null;
let blobUrl: string | null = null;

interface PendingResolver {
	resolve: (data: SiteGraphData) => void;
	reject: (err: Error) => void;
}
const pending = new Map<string, PendingResolver>();

function attachListener(port: MessagePort): void {
	port.onmessage = (e: MessageEvent) => {
		const { type, requestId, data, message } = e.data ?? {};
		if (!requestId) return;
		const resolver = pending.get(requestId);
		if (!resolver) return;
		pending.delete(requestId);
		if (type === 'data') resolver.resolve(data);
		else if (type === 'error') resolver.reject(new Error(message));
	};
}

/**
 * Registers an existing `MessagePort` (from a SharedWorker the consumer
 * already created) so the cache module routes its fetches through it.
 * Pass `null` to disconnect.
 */
export function setSiteGraphWorker(port: MessagePort | null): void {
	activePort = port;
	if (port) {
		attachListener(port);
		port.start?.();
	}
}

/** Returns the active port, if any. Mainly useful for tests. */
export function getSiteGraphWorkerPort(): MessagePort | null {
	return activePort;
}

/**
 * Disposes of any worker created by `createSiteGraphWorker` and revokes
 * the underlying Blob URL.
 */
export function clearSiteGraphWorker(): void {
	activePort = null;
	activeWorker = null;
	if (blobUrl) {
		try {
			URL.revokeObjectURL(blobUrl);
		} catch {
			// Ignore — page may already be torn down.
		}
		blobUrl = null;
	}
}

/**
 * Creates a SharedWorker from the bundled worker source via Blob URL,
 * registers its port, and returns the worker (or `null` when SharedWorker
 * isn't available in the current environment, e.g. SSR / Safari without
 * support / hardened CSP).
 *
 * Idempotent: calling twice returns the same worker.
 */
export function createSiteGraphWorker(): SharedWorker | null {
	if (activeWorker) return activeWorker;
	if (typeof SharedWorker === 'undefined') return null;
	if (typeof Blob === 'undefined' || typeof URL === 'undefined') return null;

	try {
		const blob = new Blob([SITE_GRAPH_WORKER_SOURCE], {
			type: 'application/javascript',
		});
		blobUrl = URL.createObjectURL(blob);
		activeWorker = new SharedWorker(blobUrl, { name: 'kbve-sitegraph' });
		setSiteGraphWorker(activeWorker.port);
		return activeWorker;
	} catch {
		blobUrl = null;
		activeWorker = null;
		return null;
	}
}

/**
 * Resolve `endpoint` to an absolute URL against the page origin before
 * posting it to the SharedWorker. Blob URL workers have
 * `self.location.href = blob:https://origin/uuid`, and relative-URL
 * resolution against a `blob:` base is browser-dependent: some resolve
 * to the parent origin, others fail or throw. Sending an absolute URL
 * sidesteps that ambiguity entirely so the worker's `fetch(endpoint)`
 * always hits the right host.
 */
function resolveEndpoint(endpoint: string): string {
	try {
		if (typeof window === 'undefined') return endpoint;
		return new URL(endpoint, window.location.href).toString();
	} catch {
		return endpoint;
	}
}

/**
 * Issues a `get` request through the registered worker port, if any.
 * Returns `null` when no worker is wired so callers can fall back to a
 * direct fetch.
 */
export function fetchViaWorker(
	endpoint: string,
): Promise<SiteGraphData> | null {
	const port = activePort;
	if (!port) return null;
	const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const absoluteEndpoint = resolveEndpoint(endpoint);
	return new Promise<SiteGraphData>((resolve, reject) => {
		pending.set(requestId, { resolve, reject });
		try {
			port.postMessage({
				type: 'get',
				endpoint: absoluteEndpoint,
				requestId,
			});
		} catch (err) {
			pending.delete(requestId);
			reject(err instanceof Error ? err : new Error(String(err)));
		}
	});
}
