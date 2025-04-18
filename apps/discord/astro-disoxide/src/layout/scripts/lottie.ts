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
			console.log('[lottiePanel] init() fired');
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
				this.error = e instanceof Error ? e.message : 'Unknown error';
				console.error('[lottiePanel] init() failed:', e);
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