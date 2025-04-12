import { initCanvasWorker, destroyCanvasWorker } from './client'; // or wherever it's defined

export default function RegisterAlpineLottiePanel(Alpine: typeof window.Alpine) {
	Alpine.data('lottiePanel', () => ({
		error: null,
		workerReady: false,

		async init() {
			try {
				const container = document.getElementById("lottie-container");
				if (!container) throw new Error("Missing lottie-container");

				const canvas = document.createElement("canvas");
				canvas.className = "w-full h-full";
				container.appendChild(canvas);

				await initCanvasWorker(canvas, "/assets/json/lottie/animu.lottie");
				this.workerReady = true;
			} catch (e) {
				this.error = (e as Error).message;
			}
		},

		async destroy() {
			const container = document.getElementById("lottie-container");
			if (container) container.innerHTML = "";

			await destroyCanvasWorker(); // 🧼 Fully clean up worker instance
			this.workerReady = false;
		}
	}));
}
