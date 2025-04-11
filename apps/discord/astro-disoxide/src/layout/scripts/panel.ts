import type { PanelRequest, PanelState } from 'src/env';
import { subscribeToTopic, useSharedWorkerCall } from './client';

export default function RegisterAlpinePanelManager(Alpine: typeof window.Alpine) {
	console.log('[Alpine] PanelManager loaded');

	Alpine.data('panelManager', () => ({
		open: false,
		id: '',
		view: '',
		payload: {},
		unsubscribe: null as (() => void) | null,

		async init() {
			this.unsubscribe = subscribeToTopic('panel', (state: PanelState) => {
				this.open = state.open;
				this.id = state.id;
				this.view = state.view || '';
				this.payload = state.payload || {};
			});
		},

		destroy() {
			if (this.unsubscribe) {
				this.unsubscribe();
				this.unsubscribe = null;
			}
		},

		async requestPanel(request: PanelRequest) {
			await useSharedWorkerCall('panel', request);
		},

		async openPanel(id: string, view?: PanelRequest['view'], payload?: PanelRequest['payload']) {
			await this.requestPanel({ type: 'open', id, view, payload });
		},

		async closePanel() {
			await this.requestPanel({ type: 'close', id: this.id });
		},

		async togglePanel(id: string, view?: PanelRequest['view'], payload?: PanelRequest['payload']) {
			await this.requestPanel({ type: 'toggle', id, view, payload });
		}
	}));
}
