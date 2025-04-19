import { initCanvasWorker, destroyCanvasWorker, createCanvasId } from './client';

export default function RegisterAlpineLottiePanel(Alpine: typeof window.Alpine) {
	Alpine.data('lottiePanel', (): {
		error: string | null;
		workerReady: boolean;
		canvasId: string;
		init(): Promise<void>;
		destroy(): Promise<void>;
	} => ({
		error: null,
		workerReady: false,
		canvasId: '',

		async init() {
			console.log('[lottiePanel] init() fired 2.0');
		
			if (typeof window === 'undefined') {
				console.warn('[lottiePanel] Skipping init — not in a browser environment.');
				this.error = 'This panel requires a browser environment.';
				return;
			}
		
			if (typeof OffscreenCanvas === 'undefined') {
				console.warn('[lottiePanel] Skipping init — OffscreenCanvas not supported.');
				this.error = 'OffscreenCanvas is not supported in your browser.';
				return;
			}
		
			if (typeof SharedWorker === 'undefined') {
				console.warn('[lottiePanel] Skipping init — SharedWorker not available.');
				this.error = 'SharedWorker is not supported in your browser.';
				return;
			}
		
			try {
				const container = document.getElementById('lottie-container');
				if (!container) throw new Error('Missing lottie-container');
		
				const canvas = document.createElement('canvas');
				canvas.className = 'w-full h-full';
				container.appendChild(canvas);
		
				const id = createCanvasId('lottie');
				this.canvasId = id;
		
				const lottieUrl = new URL(
					'http://localhost:4321/assets/json/lottie/animu.json',
				).toString();
		
				await initCanvasWorker(id, canvas, 'lottie', lottieUrl);
				this.workerReady = true;
			} catch (e) {
				console.error('[lottiePanel] init() caught:', e);
				this.error = e instanceof Error ? e.message : String(e);
			}
		},

		async destroy() {
			const container = document.getElementById('lottie-container');
			if (container) container.innerHTML = '';

			if (this.canvasId) {
				await destroyCanvasWorker(this.canvasId);
			}
			this.workerReady = false;
			this.canvasId = '';
			this.error = null;
		},
	}));
}