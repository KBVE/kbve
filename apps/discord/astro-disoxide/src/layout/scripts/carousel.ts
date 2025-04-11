import type { CarouselSlide } from "src/env";

console.log('[Alpine] Carousel Running');

export default function RegisterAlpineCarousel(Alpine: typeof window.Alpine) {
	Alpine.data('carousel', (initSlides: CarouselSlide[] = []) => ({
		slides: initSlides,
		currentSlideIndex: 1,
		autoplay: true,
		autoplayInterval: 5000,
		intervalId: null as number | null,

		init() {
			if (this.autoplay) {
				this.startAutoplay();
			}
		},

		destroy() {
			this.stopAutoplay();
		},

		startAutoplay() {
			this.stopAutoplay();
			this.intervalId = window.setInterval(() => {
				this.next();
			}, this.autoplayInterval);
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
				const container = this.$refs.container;
				const card = container?.querySelector(`#${this.slides[index - 1]?.id}`);
				if (card) {
					card.scrollIntoView({ behavior: 'smooth', inline: 'start' });
				}
			});
		},

		onMouseEnter() {
			this.stopAutoplay();
		},

		onMouseLeave() {
			if (this.autoplay) {
				this.startAutoplay();
			}
		}
	}));
}
