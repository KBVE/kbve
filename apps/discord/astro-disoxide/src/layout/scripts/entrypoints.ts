import type { Alpine } from 'alpinejs';
import RegisterAlpineMetricsComponents from './metrics';
import RegisterAlpineCarousel from './carousel';
import RegisterAlpineLiveServerCards from './livecards';
import RegisterAlpinePanelManager from './panel';

export default function RegisterAlpineEntrypoints(Alpine: Alpine) {
	console.log('[Alpine] Entrypoints loaded');

	Alpine.data('astro', () => {
		// Read once, outside the return
		const initialSidebar = Number(localStorage.getItem('sidebarOpen')) ?? 1;

		return {
			pageLoaded: 1,
			sidebarOpen: initialSidebar === 1,

			toggleSidebar() {
				this.sidebarOpen = !this.sidebarOpen;
				localStorage.setItem(
					'sidebarOpen',
					this.sidebarOpen ? '1' : '0',
				);
				console.log('Hitting it from here');
			},

			refreshOnPageLoad: {
				['@astro:page-load.document']() {
					this.pageLoaded++;
				},
			},
		};
	});

	RegisterAlpineMetricsComponents(Alpine);
	RegisterAlpineCarousel(Alpine);
	RegisterAlpineLiveServerCards(Alpine);
	RegisterAlpinePanelManager(Alpine);

	return Alpine;
}
