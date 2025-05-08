import { wrap, expose, type Remote } from 'comlink';
import type { LocalStorageAPI } from './db-worker';
import { toReference, builder } from './flexbuilder';


interface SharedWorkerGlobalScope extends Worker {
	onconnect: (event: MessageEvent) => void;
}
declare const self: SharedWorkerGlobalScope;


type FieldMap = Record<string, string>;
type StreamRequest = { stream: string; id: string };


let dbApi: Remote<LocalStorageAPI> | null = null;
let ws: WebSocket | null = null;
let onMessageCallback: ((data: any) => void) | null = null;


async function connectDbWorker() {
    if (dbApi) return;
	const dbWorker = new SharedWorker(new URL('./db-worker', import.meta.url), {
		type: 'module',
	});
	dbWorker.port.start();
	dbApi = wrap<LocalStorageAPI>(dbWorker.port);
	await dbApi.getVersion();
}

// --- Flexbuffer Builders ---




// --- WebSocket API ---
const wsInstanceAPI = {
	async connect(url: string) {
		if (ws) return;

		ws = new WebSocket(url);
		ws.binaryType = 'arraybuffer';

		ws.onopen = () => console.log('[WS] Connected:', url);

		ws.onmessage = async (e) => {
			const bytes = new Uint8Array(e.data);
			const decoded = toReference(bytes.buffer).toObject();

			await connectDbWorker();
			await dbApi?.dbSet(`ws:${Date.now()}`, decoded);

			if (onMessageCallback) onMessageCallback(decoded);
		};

		ws.onerror = (e) => console.error('[WS] Error:', e);
		ws.onclose = () => {
			console.log('[WS] Disconnected');
			ws = null;
		};
	},

	async send(payload: Uint8Array) {
		if (ws?.readyState === WebSocket.OPEN) {
			ws.send(payload);
		} else {
			console.warn('[WS] Tried to send while disconnected');
		}
	},

	async close() {
		ws?.close();
		ws = null;
	},

	onMessage(callback: (data: any) => void) {
		onMessageCallback = callback;
	},
};

export type WSInstance = typeof wsInstanceAPI;

self.onconnect = (event: MessageEvent) => {
	const port = event.ports[0];
	port.start();
	expose(wsInstanceAPI, port);
};