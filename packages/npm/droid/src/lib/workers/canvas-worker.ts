import { expose } from 'comlink';

export interface CanvasWorkerAPI {
	bindCanvas(panelId: string, canvas: OffscreenCanvas, mode?: CanvasDrawMode): Promise<void>;
	unbindCanvas(panelId: string): Promise<void>;
}

interface CanvasBinding {
	ctx: OffscreenCanvasRenderingContext2D;
	canvas: OffscreenCanvas;
	panelId: string;
	mode?: CanvasDrawMode;
	animationFrame?: number;
}

export type CanvasDrawMode = 'static' | 'animated' | 'dynamic';

const CanvasManager = {
	bindings: new Map<string, CanvasBinding>(),

	async bindCanvas(panelId: string, canvas: OffscreenCanvas, mode: CanvasDrawMode = 'animated') {
		const ctx = canvas.getContext('2d');

		if (!ctx) {
			console.error(`[CanvasWorker] Failed to get 2D context for panel ${panelId}`);
			return;
		}

		console.log(`[CanvasWorker] Successfully bound canvas for panel ${panelId} with mode ${mode}`);

		this.bindings.set(panelId, { ctx, canvas, panelId, mode });

		this.startAnimation(panelId);
	},

	startAnimation(panelId: string) {
		const binding = this.bindings.get(panelId);
		if (!binding) return;

		switch (binding.mode) {
			case 'static':
				this.drawStatic(binding);
				break;
			case 'animated':
				this.drawAnimated(binding);
				break;
			case 'dynamic':
				this.drawDynamic(binding);
				break;
			default:
				console.warn(`[CanvasWorker] Unknown draw mode for panel ${panelId}`);
		}
	},

	drawStatic(binding: CanvasBinding) {
		binding.ctx.fillStyle = 'gray';
		binding.ctx.fillRect(0, 0, binding.canvas.width, binding.canvas.height);
	},

	drawAnimated(binding: CanvasBinding) {
		let hue = 0;

		const drawFrame = () => {
			hue = (hue + 1) % 360;
			binding.ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
			binding.ctx.fillRect(0, 0, binding.canvas.width, binding.canvas.height);

			binding.animationFrame = requestAnimationFrame(drawFrame);
		};

		drawFrame();
	},

	drawDynamic(binding: CanvasBinding) {
		let time = 0;

		const drawFrame = () => {
			time += 0.05;
			binding.ctx.clearRect(0, 0, binding.canvas.width, binding.canvas.height);
			binding.ctx.beginPath();
			binding.ctx.arc(
				binding.canvas.width / 2 + Math.sin(time) * 50,
				binding.canvas.height / 2 + Math.cos(time) * 50,
				30,
				0,
				Math.PI * 2
			);
			binding.ctx.fillStyle = 'orange';
			binding.ctx.fill();
	
			binding.animationFrame = requestAnimationFrame(drawFrame);
		};

		drawFrame();
	},

	async unbindCanvas(panelId: string) {
		const binding = this.bindings.get(panelId);
		if (binding?.animationFrame) {
			cancelAnimationFrame(binding.animationFrame);
		}
		this.bindings.delete(panelId);
		console.log(`[CanvasWorker] Unbound canvas for panel ${panelId}`);
	},
};

expose(CanvasManager);
