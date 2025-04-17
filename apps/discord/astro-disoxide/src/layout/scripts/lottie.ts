import { initCanvasWorker, destroyCanvasWorker } from './client';

export default function RegisterAlpineLottiePanel(Alpine: typeof window.Alpine) {
	Alpine.data('lottiePanel', () => ({
		error: null as string | null,
		workerReady: false,

		async init() {
			try {
				const container = document.getElementById("lottie-container");
				if (!container) throw new Error("Missing lottie-container");

				const canvas = document.createElement("canvas");
				canvas.className = "w-full h-full";
				container.appendChild(canvas);

				//const lottieUrl = new URL("/assets/json/lottie/animu.lottie", location.origin).toString();
				const lottieUrl = new URL("http://localhost:4321/assets/json/lottie/animu.json").toString();
				await initCanvasWorker(canvas, lottieUrl);
				this.workerReady = true;
			} catch (e) {
				this.error = (e as Error).message;
			}
		},

		async destroy() {
			const container = document.getElementById("lottie-container");
			if (container) container.innerHTML = "";

			await destroyCanvasWorker();
			this.workerReady = false;
		}
	}));
}
