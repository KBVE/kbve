// panels.ts
import type { PanelRequest, PanelState } from 'src/env';
import { subscribeToTopic, useSharedWorkerCall } from './client';

export default function RegisterAlpinePanelManager(Alpine: typeof window.Alpine) {
	console.log('[Alpine] panelManager store loaded');

	type PanelManagerStore = {
		open: boolean;
		id: string;
		content: string;
		payload: Record<string, any>;
		unsubscribe: (() => void) | null;
		init: () => Promise<void>;
		loadContent: (id: string) => Promise<void>;
		requestPanel: (request: PanelRequest) => Promise<void>;
		openPanel: (id: string, payload?: Record<string, any>) => Promise<void>;
		closePanel: () => Promise<void>;
		togglePanel: (id: string, payload?: Record<string, any>) => Promise<void>;
	};

	const store: PanelManagerStore = {
		open: false,
		id: '',
		content: '',
		payload: {},
		unsubscribe: null,

		async init() {
			this.unsubscribe = subscribeToTopic('panel', async (state: PanelState) => {
				this.open = state.open;
				this.id = state.id;
				this.payload = state.payload || {};

				if (state.open && state.id) {
					await this.loadContent(state.id);
				} else {
					this.content = '';
				}
			});
		},

		async loadContent(id: string) {
			try {
				const html = await useSharedWorkerCall('db_get', id);
				this.content = typeof html === 'string' ? html : '';
			} catch (e) {
				console.warn('[panelManager] Failed to load content:', e);
				this.content = `<p class="text-sm text-red-400">Failed to load panel content.</p>`;
			}
		},

		async requestPanel(request: PanelRequest) {
			await useSharedWorkerCall('panel', request);
		},

		async openPanel(id: string, payload?: Record<string, any>) {
			await this.requestPanel({ type: 'open', id, payload });
		},

		async closePanel() {
			await this.requestPanel({ type: 'close', id: this.id });
		},

		async togglePanel(id: string, payload?: Record<string, any>) {
			await this.requestPanel({ type: 'toggle', id, payload });
		}
	};

	Alpine.store('panelManager', store);
	store.init(); // no more TS error
}
