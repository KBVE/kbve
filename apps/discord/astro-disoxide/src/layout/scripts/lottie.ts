export default function RegisterAlpineLottiePanel(Alpine: typeof window.Alpine) {

	type PanelManagerStore = {
		payload?: Record<string, any>;
	};

	Alpine.data('lottiePanel', (): {
		error: string | null;
		player: any;
		isVisible: boolean;
		observer: IntersectionObserver | null;
		init(): Promise<void>;
		onVisible(): void;
		onHidden(): void;
		destroy(): void;
	} => ({
		error: null,
		player: null,
		isVisible: false,
		observer: null,

		async init() {
			console.log('[lottiePanel] init() - dynamic + optimized');

			if (typeof window === 'undefined') {
				this.error = 'This panel requires a browser environment.';
				return;
			}

			try {
				const container = document.getElementById('lottie-container');
				if (!container) throw new Error('Missing lottie-container');

				// Clean previous instance
				container.innerHTML = '';

				const canvas = document.createElement('canvas');
				canvas.className = 'w-full h-full';
				canvas.id = 'lottieCanvas';
				container.appendChild(canvas);

				const payload = Alpine.store('panelManager').payload ?? {};
				const lottieUrl = payload?.lottie || 'https://lottie.host/placeholder.json';

				const { DotLottie } = await import(
					// @ts-ignore
					'https://esm.sh/@lottiefiles/dotlottie-web'
				) as { DotLottie: any };

				this.player = new DotLottie({
					canvas,
					src: lottieUrl,
					loop: true,
					autoplay: false, // ❗ Don't autoplay until visible
					mode: 'normal',
				});

				// Setup intersection observer
				this.observer = new IntersectionObserver(
					(entries) => {
						for (const entry of entries) {
							if (entry.isIntersecting) {
								this.onVisible();
							} else {
								this.onHidden();
							}
						}
					},
					{
						root: null,
						threshold: 0.1,
					},
				);

				this.observer.observe(canvas);
			} catch (e) {
				console.error('[lottiePanel] init() caught:', e);
				this.error = e instanceof Error ? e.message : String(e);
			}
		},

		onVisible() {
			this.isVisible = true;
			if (this.player?.play) {
				this.player.play();
				console.log('[lottiePanel] Playing animation');
			}
		},

		onHidden() {
			this.isVisible = false;
			if (this.player?.pause) {
				this.player.pause();
				console.log('[lottiePanel] Paused animation');
			}
		},

		destroy() {
			if (this.player?.destroy) {
				this.player.destroy();
			}
			this.player = null;

			const canvas = document.getElementById('lottieCanvas');
			if (canvas && this.observer) {
				this.observer.unobserve(canvas);
			}
			this.observer = null;

			const container = document.getElementById('lottie-container');
			if (container) container.innerHTML = '';

			this.error = null;
			this.isVisible = false;
		},
	}));
}
