import type { Panel, PanelId, PanelRequest, PanelState } from 'src/env';
import { subscribeToTopic, useSharedWorkerCall } from './client';

export default function RegisterAlpinePanelManager(Alpine: typeof window.Alpine) {
	console.log('[Alpine] panelManager store loaded');

	type PanelMap = Record<PanelId, Panel>;

	const defaultPanel = (id: PanelId): Panel => ({
		id,
		direction: id,
		x: 0,
		y: 0,
		width: 400,
		height: 400,
		zIndex: 9999,
		open: false,
		content: '',
		payload: {},
		transition: '',
	});

	const store = {
		panels: {
			top: defaultPanel('top'),
			right: defaultPanel('right'),
			bottom: defaultPanel('bottom'),
			left: defaultPanel('left'),
		} as PanelMap,

		unsubscribe: null as (() => void) | null,

		async init() {
			this.unsubscribe = subscribeToTopic('panel', async (state: PanelState) => {
				const panel = this.panels[state.id as PanelId];
				if (!panel) return;

				panel.open = state.open;
				panel.payload = state.payload ?? {};
				panel.content = state.content ?? '';

				if (state.open && !panel.content) {
					await this.loadContent(state.id);
				}
			});
		},

		async loadContent(id: PanelId) {
			try {
				const html = await useSharedWorkerCall('db_get', {
					store: 'htmlservers',
					key: id,
				});
				this.panels[id].content = typeof html === 'string' ? html : '';
			} catch (e) {
				console.warn(`[panelManager] Failed to load panel "${id}" content:`, e);
				this.panels[id].content = `<p class="text-sm text-red-400">Failed to load content.</p>`;
			}
		},

		async requestPanel(request: PanelRequest) {
			await useSharedWorkerCall('panel', request);
		},

		async openPanel(id: PanelId, payload?: Record<string, any>) {
			await this.requestPanel({ type: 'open', id, payload });
		},

		async closePanel(id: PanelId) {
			await this.requestPanel({ type: 'close', id });
		},

		async togglePanel(id: PanelId, payload?: Record<string, any>) {
			await this.requestPanel({ type: 'toggle', id, payload });
		},

		getPanel(id: PanelId): Panel {
			return this.panels[id];
		},

		isOpen(id: PanelId): boolean {
			return this.panels[id]?.open ?? false;
		},
	};

	Alpine.store('panelManager', store);
	store.init();
}
