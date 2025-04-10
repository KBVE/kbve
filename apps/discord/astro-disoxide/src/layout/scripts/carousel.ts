import type { CarouselSlide, DiscordServer, CarouselData } from "src/env";

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
			this.currentSlideIndex =
				this.currentSlideIndex > 1
					? this.currentSlideIndex - 1
					: this.slides.length;
		},

		next() {
			this.currentSlideIndex =
				this.currentSlideIndex < this.slides.length
					? this.currentSlideIndex + 1
					: 1;
		},

		goTo(index: number) {
			if (index >= 1 && index <= this.slides.length) {
				this.currentSlideIndex = index;
			}
		}
	}));
}
