import type { Remote } from 'comlink';
import type { CanvasWorkerAPI } from '../workers/canvas-worker';
import { addToast, removeToast } from './toasts';
import { openTooltip, closeTooltip, openModal, closeModal } from './ui';
import type {
	ToastPayload,
	TooltipPayload,
	ModalPayload,
} from '../types/ui-event-types';

export type RenderPath = 'dom' | 'canvas' | 'auto';

interface OverlayManagerConfig {
	preferredPath: RenderPath;
	canvasWorker?: Remote<CanvasWorkerAPI>;
}

/**
 * Unified overlay manager that routes to DOM or Canvas rendering.
 *
 * - 'dom': Uses nanostores → React components (Phases 1–6)
 * - 'canvas': Uses CanvasUIRenderer in canvas-worker (Phase 9)
 * - 'auto': Uses canvas if OffscreenCanvas is available AND a canvas worker
 *           is bound, otherwise falls back to DOM
 */
export class OverlayManager {
	private path: RenderPath;
	private canvasWorker: Remote<CanvasWorkerAPI> | null;
	private canvasBound = false;

	constructor(config: OverlayManagerConfig) {
		this.path = config.preferredPath;
		this.canvasWorker = config.canvasWorker ?? null;
	}

	private get effectivePath(): 'dom' | 'canvas' {
		if (this.path === 'canvas' && this.canvasBound && this.canvasWorker) {
			return 'canvas';
		}
		if (this.path === 'auto' && this.canvasBound && this.canvasWorker) {
			return 'canvas';
		}
		return 'dom';
	}

	/**
	 * Bind a <canvas> element for off-thread overlay rendering.
	 * Must be called before canvas path can be used.
	 */
	async bindCanvas(
		canvasEl: HTMLCanvasElement,
		dbGet: (key: string) => Promise<string | null>,
	): Promise<void> {
		if (!this.canvasWorker) {
			console.warn('[OverlayManager] No canvas worker available');
			return;
		}
		const offscreen = canvasEl.transferControlToOffscreen();
		await (this.canvasWorker as any).bindUICanvas(offscreen, dbGet);
		this.canvasBound = true;
	}

	// ── Toast ──

	toast(payload: ToastPayload): void {
		if (this.effectivePath === 'canvas') {
			void (this.canvasWorker as any)?.addCanvasToast(payload);
		}
		// Always update DOM state (nanostores) so event listeners and
		// any DOM-rendered components stay in sync
		addToast(payload);
	}

	dismissToast(id: string): void {
		if (this.effectivePath === 'canvas') {
			void (this.canvasWorker as any)?.removeCanvasToast(id);
		}
		removeToast(id);
	}

	// ── Tooltip ──

	showTooltip(payload: TooltipPayload): void {
		if (this.effectivePath === 'canvas') {
			void (this.canvasWorker as any)?.showCanvasTooltip(payload);
		}
		openTooltip(payload.id);
	}

	hideTooltip(id?: string): void {
		if (this.effectivePath === 'canvas') {
			void (this.canvasWorker as any)?.showCanvasTooltip(null);
		}
		closeTooltip(id);
	}

	// ── Modal ──

	showModal(payload: ModalPayload): void {
		if (this.effectivePath === 'canvas') {
			void (this.canvasWorker as any)?.showCanvasModal(payload);
		}
		openModal(payload.id);
	}

	hideModal(id?: string): void {
		if (this.effectivePath === 'canvas') {
			void (this.canvasWorker as any)?.showCanvasModal(null);
		}
		closeModal(id);
	}

	/** Switch rendering path at runtime */
	setPath(path: RenderPath): void {
		this.path = path;
	}

	/** Unbind canvas and clean up */
	async destroy(): Promise<void> {
		if (this.canvasBound && this.canvasWorker) {
			await (this.canvasWorker as any).unbindUICanvas();
			this.canvasBound = false;
		}
	}
}
