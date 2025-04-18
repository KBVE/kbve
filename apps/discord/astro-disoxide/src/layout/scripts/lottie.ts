import { initCanvasWorker, destroyCanvasWorker, createCanvasId } from './client';

export default function RegisterAlpineLottiePanel(Alpine: typeof window.Alpine) {
	Alpine.data('lottiePanel', () => ({
		error: null as string | null,
		workerReady: false,
		canvasId: '',

		async init() {
			console.log('[lottiePanel] init() fired');
			try {
				const container = document.getElementById('lottie-container');
				if (!container) throw new Error('Missing lottie-container');

				const canvas = document.createElement('canvas');
				canvas.className = 'w-full h-full';
				container.appendChild(canvas);

				// Generate unique ID for this canvas instance
				const id = createCanvasId('lottie');
				this.canvasId = id;

				const lottieUrl = new URL(
					'http://localhost:4321/assets/json/lottie/animu.json',
				).toString();

				await initCanvasWorker(id, canvas, 'lottie', lottieUrl);
				this.workerReady = true;
			} catch (e) {
				this.error = (e as Error).message;
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
		},
	}));
}
