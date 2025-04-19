import type {DotLottieInstance, PanelId, PanelManagerStore } from 'src/env';

export default function RegisterAlpineLottiePanel(Alpine: typeof window.Alpine) {
	Alpine.data('lottiePanel', (panelId: PanelId = 'right') => ({
		error: null as string | null,
		player: null as DotLottieInstance | null,
		isVisible: false,
		observer: null as IntersectionObserver | null,

		async init() {
			console.log(`[lottiePanel] init() for panel "${panelId}"`);

			if (typeof window === 'undefined') {
				this.error = 'This panel requires a browser environment.';
				return;
			}

			try {
				const container = document.getElementById(`lottie-container-${panelId}`);
				if (!container) throw new Error(`Missing lottie-container-${panelId}`);

				container.innerHTML = '';

				const canvas = document.createElement('canvas');
				canvas.className = 'w-full h-full';
				canvas.id = `lottieCanvas-${panelId}`;
				container.appendChild(canvas);

				const store = Alpine.store('panelManager') as PanelManagerStore;
				const panel = store.getPanel(panelId);
				const lottieUrl = panel?.payload?.lottie || 'https://lottie.host/placeholder.json';

				const { DotLottie } = await import(
					// @ts-ignore
					'https://esm.sh/@lottiefiles/dotlottie-web'
				) as { DotLottie: any };

				this.player = new DotLottie({
					canvas,
					src: lottieUrl,
					loop: true,
					autoplay: false,
					mode: 'normal',
				});

				// 👁️‍🗨️ IntersectionObserver for viewport visibility
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
					}
				);

				this.observer.observe(canvas);
			} catch (e) {
				console.error(`[lottiePanel] init() error for "${panelId}":`, e);
				this.error = e instanceof Error ? e.message : String(e);
			}
		},

		onVisible() {
			this.isVisible = true;
			this.player?.play?.();
			console.log(`[lottiePanel] "${panelId}" visible: playing`);
		},

		onHidden() {
			this.isVisible = false;
			this.player?.pause?.();
			console.log(`[lottiePanel] "${panelId}" hidden: paused`);
		},

		destroy() {
			this.player?.destroy?.();
			this.player = null;

			const canvas = document.getElementById(`lottieCanvas-${panelId}`);
			if (canvas && this.observer) {
				this.observer.unobserve(canvas);
			}
			this.observer = null;

			const container = document.getElementById(`lottie-container-${panelId}`);
			if (container) container.innerHTML = '';

			this.error = null;
			this.isVisible = false;
		},
	}));
}
