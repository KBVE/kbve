import type { DiscordServer, LiveServerCardsData } from 'src/env';
import { useSharedWorkerCall } from './client';

console.log('[Alpine] Live Server Cards Running');

export default function RegisterAlpineLiveServerCards(Alpine: typeof window.Alpine) {
	Alpine.data('liveServerCards', (props: { initial: DiscordServer[] }) => ({
		servers: Object.fromEntries(props.initial.map(s => [s.server_id, s])),

		async init() {
			await this.refresh();
		},

		async refresh() {
			try {
				const updated = await useSharedWorkerCall('db_list');
		
				if (!Array.isArray(updated)) {
					console.warn('[LiveCards] db_list returned non-array:', updated);
					return;
				}
		
				updated.forEach((server: any) => {
					if (server && typeof server.server_id === 'string') {
						this.updateServer(server as DiscordServer);
					} else {
						console.warn('[LiveCards] Skipped invalid server object:', server);
					}
				});
			} catch (err) {
				console.error('[LiveCards] Refresh failed:', err);
			}
		},
		

		updateServer(server: DiscordServer) {
			this.servers[server.server_id] = server;

			const card = document.querySelector(`#server-${server.server_id}`);
			if (!card) return;

			card.querySelector('[data-field="name"]')!.textContent = server.name;
			card.querySelector('[data-field="summary"]')!.textContent = server.summary;
			card.querySelector('[data-field="invite"]')!.textContent = server.invite;
			card.querySelector('[data-field="updated_at"]')!.textContent =
				new Date(server.updated_at).toLocaleDateString();
		}
	}));
}
