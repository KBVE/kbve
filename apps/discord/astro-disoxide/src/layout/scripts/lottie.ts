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
				this.error = 'This panel requires a browser environment.';
				return;
			}
			if (typeof OffscreenCanvas === 'undefined') {
				this.error = 'OffscreenCanvas is not supported in your browser.';
				return;
			}
			if (typeof SharedWorker === 'undefined') {
				this.error = 'SharedWorker is not supported in your browser.';
				return;
			}
		
			try {
				const container = document.getElementById('lottie-container');
				if (!container) throw new Error('Missing lottie-container');
		
				let canvas = container.querySelector('canvas') as HTMLCanvasElement;
				if (!canvas) {
					canvas = document.createElement('canvas');
					canvas.className = 'w-full h-full';
					container.appendChild(canvas);
				}
		
				// ? Only create new id if we don't already have one
				const id = this.canvasId || createCanvasId('lottie');
				this.canvasId = id;
		
				const lottieUrl = new URL(
					'http://localhost:4321/assets/json/lottie/animu.json'
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