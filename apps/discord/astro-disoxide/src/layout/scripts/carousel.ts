import { useSharedWorkerCall } from './client';
import type { DiscordServer } from 'src/env';

export default function RegisterAlpineCarousel(Alpine: typeof window.Alpine) {
	Alpine.data('carousel', () => ({
		slides: [] as [string, DiscordServer][],
		currentSlideIndex: 1,
		autoplay: true,
		autoplayInterval: 5000,
		intervalId: null as number | null,

		async init() {
			const servers: any[] = await useSharedWorkerCall('db_list');

			this.slides = servers
				.filter((s): s is DiscordServer => s?.server_id)
				.map((s) => [s.server_id, s]);

			if (this.autoplay) this.startAutoplay();
		},

		destroy() {
			this.stopAutoplay();
		},

		startAutoplay() {
			this.stopAutoplay();
			this.intervalId = window.setInterval(() => this.next(), this.autoplayInterval);
		},

		stopAutoplay() {
			if (this.intervalId !== null) {
				clearInterval(this.intervalId);
				this.intervalId = null;
			}
		},

		previous() {
			this.scrollToSlide(this.currentSlideIndex - 1);
		},

		next() {
			this.scrollToSlide(this.currentSlideIndex + 1);
		},

		goTo(index: number) {
			this.scrollToSlide(index);
		},

		scrollToSlide(index: number) {
			if (index < 1) index = this.slides.length;
			if (index > this.slides.length) index = 1;

			this.currentSlideIndex = index;

			requestAnimationFrame(() => {
				const container = this.$refs.container as HTMLElement;
				const [id] = this.slides[index - 1] ?? [];
				const card = container?.querySelector(`#server-${id}`) as HTMLElement;

				if (container && card) {
					const offset = card.offsetLeft - container.offsetLeft;
					container.scrollTo({ left: offset, behavior: 'smooth' });
				}
			});
		},

		openPanel(id: string, payload: DiscordServer) {
			const panelManager = Alpine.store('panelManager') as {
				openPanel: (id: string, payload: any) => Promise<void>;
			};

			if (panelManager?.openPanel) {
				// Ensure the payload is safely cloneable
				const cloned = JSON.parse(JSON.stringify(payload));
				void panelManager.openPanel(id, cloned);
			} else {
				console.warn('[Carousel] panelManager store not found or misconfigured');
			}
		},

		onMouseEnter() {
			this.stopAutoplay();
		},

		onMouseLeave() {
			if (this.autoplay) this.startAutoplay();
		}
	}));
}
