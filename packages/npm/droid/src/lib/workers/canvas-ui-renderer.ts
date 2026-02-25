import type {
	ToastPayload,
	TooltipPayload,
	ModalPayload,
} from '../types/ui-event-types';

interface ThemeColors {
	accent: string;
	accentLow: string;
	accentHigh: string;
	bg: string;
	bgAccent: string;
	text: string;
	textAccent: string;
	border: string;
	white: string;
	black: string;
	mode: 'light' | 'dark';
}

const SEVERITY_COLORS: Record<
	string,
	{ bg: string; border: string; text: string }
> = {
	success: { bg: '#065f46', border: '#10b981', text: '#d1fae5' },
	warning: { bg: '#78350f', border: '#f59e0b', text: '#fef3c7' },
	error: { bg: '#7f1d1d', border: '#ef4444', text: '#fee2e2' },
	info: { bg: '#1e3a5f', border: '#3b82f6', text: '#dbeafe' },
};

interface ActiveToast extends ToastPayload {
	createdAt: number;
	opacity: number;
	y: number;
	targetY: number;
}

export class CanvasUIRenderer {
	private ctx: OffscreenCanvasRenderingContext2D | null = null;
	private canvas: OffscreenCanvas | null = null;
	private toasts: ActiveToast[] = [];
	private tooltip: TooltipPayload | null = null;
	private modal: ModalPayload | null = null;
	private theme: ThemeColors = {
		accent: '#8b5cf6',
		accentLow: '#1e1033',
		accentHigh: '#c4b5fd',
		bg: '#0a0a0a',
		bgAccent: '#3b1f6e',
		text: '#e0e0e0',
		textAccent: '#a78bfa',
		border: '#4c1d95',
		white: '#ffffff',
		black: '#000000',
		mode: 'dark',
	};
	private animFrame: number | null = null;
	private dbGet: ((key: string) => Promise<string | null>) | null = null;

	async bind(
		canvas: OffscreenCanvas,
		dbGet: (key: string) => Promise<string | null>,
	): Promise<void> {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d');
		this.dbGet = dbGet;
		await this.refreshTheme();
		this.startLoop();
	}

	async refreshTheme(): Promise<void> {
		if (!this.dbGet) return;
		this.theme = {
			accent: (await this.dbGet('theme:accent')) ?? '#8b5cf6',
			accentLow: (await this.dbGet('theme:accent-low')) ?? '#1e1033',
			accentHigh: (await this.dbGet('theme:accent-high')) ?? '#c4b5fd',
			bg: (await this.dbGet('theme:bg')) ?? '#0a0a0a',
			bgAccent: (await this.dbGet('theme:bg-accent')) ?? '#3b1f6e',
			text: (await this.dbGet('theme:text')) ?? '#e0e0e0',
			textAccent: (await this.dbGet('theme:text-accent')) ?? '#a78bfa',
			border: (await this.dbGet('theme:border')) ?? '#4c1d95',
			white: (await this.dbGet('theme:white')) ?? '#ffffff',
			black: (await this.dbGet('theme:black')) ?? '#000000',
			mode:
				((await this.dbGet('theme:mode')) as 'light' | 'dark') ??
				'dark',
		};
	}

	addToast(payload: ToastPayload): void {
		const yOffset = 20 + this.toasts.length * 80;
		this.toasts.push({
			...payload,
			createdAt: Date.now(),
			opacity: 0,
			y: yOffset - 20,
			targetY: yOffset,
		});
	}

	removeToast(id: string): void {
		const idx = this.toasts.findIndex((t) => t.id === id);
		if (idx !== -1) this.toasts.splice(idx, 1);
		this.recalcPositions();
	}

	showTooltip(payload: TooltipPayload | null): void {
		this.tooltip = payload;
	}

	showModal(payload: ModalPayload | null): void {
		this.modal = payload;
	}

	private recalcPositions(): void {
		this.toasts.forEach((t, i) => {
			t.targetY = 20 + i * 80;
		});
	}

	private startLoop(): void {
		const draw = () => {
			this.render();
			this.animFrame = requestAnimationFrame(draw);
		};
		draw();
	}

	private render(): void {
		if (!this.ctx || !this.canvas) return;
		const { width, height } = this.canvas;
		this.ctx.clearRect(0, 0, width, height);

		// Auto-dismiss expired toasts
		const now = Date.now();
		this.toasts = this.toasts.filter((t) => {
			if (
				t.duration &&
				t.duration > 0 &&
				now - t.createdAt > t.duration
			) {
				return false;
			}
			return true;
		});
		this.recalcPositions();

		// Animate toasts
		for (const toast of this.toasts) {
			if (toast.opacity < 1)
				toast.opacity = Math.min(1, toast.opacity + 0.05);
			toast.y += (toast.targetY - toast.y) * 0.15;
			this.drawToast(toast, width);
		}

		// Draw modal backdrop + content
		if (this.modal) {
			this.drawModal(width, height);
		}
	}

	private drawToast(toast: ActiveToast, canvasWidth: number): void {
		if (!this.ctx) return;
		const ctx = this.ctx;
		const w = 320;
		const h = 64;
		const x = canvasWidth - w - 20;
		const y = toast.y;
		const colors =
			SEVERITY_COLORS[toast.severity] ?? SEVERITY_COLORS['info'];

		ctx.globalAlpha = toast.opacity;

		// Background
		ctx.fillStyle = colors.bg;
		this.roundRect(ctx, x, y, w, h, 8);
		ctx.fill();

		// Border
		ctx.strokeStyle = colors.border;
		ctx.lineWidth = 1.5;
		this.roundRect(ctx, x, y, w, h, 8);
		ctx.stroke();

		// Text
		ctx.fillStyle = colors.text;
		ctx.font = '14px system-ui, -apple-system, sans-serif';
		ctx.fillText(toast.message, x + 12, y + 24, w - 24);

		// Severity label
		ctx.font = 'bold 10px system-ui, sans-serif';
		ctx.fillStyle = colors.border;
		ctx.fillText(toast.severity.toUpperCase(), x + 12, y + 48);

		ctx.globalAlpha = 1;
	}

	private drawModal(canvasWidth: number, canvasHeight: number): void {
		if (!this.ctx || !this.modal) return;
		const ctx = this.ctx;

		// Backdrop
		ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
		ctx.fillRect(0, 0, canvasWidth, canvasHeight);

		// Modal box
		const w = Math.min(500, canvasWidth - 40);
		const h = 300;
		const x = (canvasWidth - w) / 2;
		const y = (canvasHeight - h) / 2;

		ctx.fillStyle = this.theme.bg;
		this.roundRect(ctx, x, y, w, h, 12);
		ctx.fill();

		ctx.strokeStyle = this.theme.border;
		ctx.lineWidth = 1;
		this.roundRect(ctx, x, y, w, h, 12);
		ctx.stroke();

		// Title
		if (this.modal.title) {
			ctx.fillStyle = this.theme.text;
			ctx.font = 'bold 18px system-ui, sans-serif';
			ctx.fillText(this.modal.title, x + 20, y + 36, w - 40);
		}

		// ID label
		ctx.fillStyle = this.theme.textAccent;
		ctx.font = '12px system-ui, sans-serif';
		ctx.fillText(this.modal.id, x + 20, y + 60, w - 40);
	}

	private roundRect(
		ctx: OffscreenCanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		r: number,
	): void {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + r);
		ctx.lineTo(x + w, y + h - r);
		ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
		ctx.lineTo(x + r, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
		ctx.closePath();
	}

	unbind(): void {
		if (this.animFrame !== null) {
			cancelAnimationFrame(this.animFrame);
			this.animFrame = null;
		}
		this.ctx = null;
		this.canvas = null;
		this.toasts = [];
		this.tooltip = null;
		this.modal = null;
	}
}
