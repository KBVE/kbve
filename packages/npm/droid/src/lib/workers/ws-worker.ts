import { wrap, expose, type Remote } from 'comlink';
import type { LocalStorageAPI } from './db-worker';
import { toReference, builder } from './flexbuilder';


interface SharedWorkerGlobalScope extends Worker {
	onconnect: (event: MessageEvent) => void;
}
declare const self: SharedWorkerGlobalScope;


let ws: WebSocket | null = null;
let onMessageCallback: ((data: any) => void) | null = null;


// --- WebSocket API ---
const wsInstanceAPI = {
	async connect(url: string) {
		if (ws) return;

		ws = new WebSocket(url);
		ws.binaryType = 'arraybuffer';

		ws.onopen = () => console.log('[WS] Connected:', url);

        ws.onmessage = (e) => {
            try {
                console.log('[WS] Received binary message');
				
				if (e.data instanceof ArrayBuffer) {
					onMessageCallback?.(e.data);   
				}
            } catch (err) {
                console.error('[WS] Failed to forward message', err);
            }
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

