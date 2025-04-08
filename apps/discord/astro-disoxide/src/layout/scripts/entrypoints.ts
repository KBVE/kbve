import type { Alpine } from 'alpinejs';
import RegisterAlpineMetricsComponents from './metrics';

export default function RegisterAlpineEntrypoints(Alpine: Alpine) {
	console.log('[Alpine] Entrypoints loaded');

	Alpine.data('astro', () => ({
		pageLoaded: 1,
    sidebarOpen: JSON.parse(localStorage.getItem('sidebarOpen') ?? 'true'),

		toggleSidebar() {
			this.sidebarOpen = !this.sidebarOpen;
			localStorage.setItem('sidebarOpen', JSON.stringify(this.sidebarOpen));
		},
		refreshOnPageLoad: {
			['@astro:page-load.document']() {
				this.pageLoaded++;
			}
		}
	}));

	RegisterAlpineMetricsComponents(Alpine);

	return Alpine;
}
