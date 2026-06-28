// A self-contained canvas-2D effects layer for the pet-battle overlay: element-colored
// particle bursts and travelling projectile bolts, drawn with additive ('lighter')
// blending for a glow that reads like the overworld magic VFX (spellVfx.ts). The battle
// is a DOM overlay sitting ABOVE the Phaser canvas, so its effects can't reuse the Phaser
// renderer — this mirrors that visual language on its own surface instead.

export interface ElementStyle {
	core: string;
	ramp: string[];
}

const DEFAULT_STYLE: ElementStyle = {
	core: '#cbd5e1',
	ramp: ['#e2e8f0', '#94a3b8', '#64748b', '#334155'],
};

// Keyed by the lowercase element name (laser ELEMENT_NAMES). Light→dark ramps + a bright
// core, matching the magic system's per-school palettes and filling the battle elements.
const ELEMENT_FX: Record<string, ElementStyle> = {
	fire: { core: '#ffd27a', ramp: ['#fff3b0', '#ffae3b', '#ff5a1f', '#7a1f0a'] },
	ice: { core: '#bfe6ff', ramp: ['#eaffff', '#8fd8ff', '#3b82f6', '#1e3a8a'] },
	lightning: {
		core: '#fdf6b2',
		ramp: ['#fffec8', '#fde047', '#facc15', '#a16207'],
	},
	poison: { core: '#ecfccb', ramp: ['#d9f99d', '#84cc16', '#4d7c0f', '#1a2e05'] },
	shadow: { core: '#9a6ad0', ramp: ['#d8c8ff', '#7c3aed', '#4c1d95', '#2a0a4a'] },
	holy: { core: '#fff0c0', ramp: ['#fffbe0', '#ffe9a8', '#fcd34d', '#b45309'] },
	arcane: { core: '#e9d5ff', ramp: ['#f3e0ff', '#c084fc', '#7c3aed', '#4c1d95'] },
	earth: { core: '#e7c79b', ramp: ['#fde9c8', '#d3a263', '#92591f', '#43290a'] },
	wind: { core: '#d1fae5', ramp: ['#ecfeff', '#a7f3d0', '#5eead4', '#0f766e'] },
	nature: { core: '#caffb0', ramp: ['#eaffd0', '#86efac', '#22c55e', '#166534'] },
	light: { core: '#fffef0', ramp: ['#ffffff', '#fef9c3', '#fde68a', '#eab308'] },
	none: DEFAULT_STYLE,
};

export function elementStyle(name: string): ElementStyle {
	return ELEMENT_FX[name] ?? DEFAULT_STYLE;
}

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	life: number;
	max: number;
	size: number;
	color: string;
}

interface Bolt {
	x: number;
	y: number;
	tx: number;
	ty: number;
	dx: number;
	dy: number;
	t: number;
	dur: number;
	style: ElementStyle;
	arrived: boolean;
	onArrive?: () => void;
}

/** Drives a battle effects canvas: spawn `burst`s and `bolt`s, it animates them on a rAF
 * loop until `dispose`d. Coordinates are CSS px relative to the canvas top-left. */
export class BattleFx {
	private readonly ctx: CanvasRenderingContext2D;
	private parts: Particle[] = [];
	private bolts: Bolt[] = [];
	private raf = 0;
	private last = 0;
	private dpr = 1;
	private running = true;

	constructor(private readonly canvas: HTMLCanvasElement) {
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new Error('battle fx: no 2d context');
		this.ctx = ctx;
		this.loop = this.loop.bind(this);
		this.resize();
		this.raf = requestAnimationFrame(this.loop);
	}

	resize(): void {
		this.dpr = Math.min(2, window.devicePixelRatio || 1);
		this.canvas.width = Math.max(1, Math.round(this.canvas.clientWidth * this.dpr));
		this.canvas.height = Math.max(
			1,
			Math.round(this.canvas.clientHeight * this.dpr),
		);
	}

	dispose(): void {
		this.running = false;
		cancelAnimationFrame(this.raf);
	}

	private rampColor(s: ElementStyle, f: number): string {
		const i = Math.min(s.ramp.length - 1, Math.floor(f * s.ramp.length));
		return s.ramp[i];
	}

	/** A radial spray of glowing motes at (x,y). */
	burst(x: number, y: number, style: ElementStyle, count = 26): void {
		for (let i = 0; i < count; i++) {
			const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
			const sp = 40 + Math.random() * 130;
			this.parts.push({
				x,
				y,
				vx: Math.cos(a) * sp,
				vy: Math.sin(a) * sp - 20,
				life: 0,
				max: 0.3 + Math.random() * 0.35,
				size: 2 + Math.random() * 3,
				color: this.rampColor(style, Math.random()),
			});
		}
	}

	/** A glowing core that travels from (fromX,fromY) to (toX,toY), trailing motes, then
	 * fires `onArrive` on impact. */
	bolt(
		fromX: number,
		fromY: number,
		toX: number,
		toY: number,
		style: ElementStyle,
		onArrive?: () => void,
	): void {
		const dx = toX - fromX;
		const dy = toY - fromY;
		const dist = Math.hypot(dx, dy);
		this.bolts.push({
			x: fromX,
			y: fromY,
			tx: toX,
			ty: toY,
			dx,
			dy,
			t: 0,
			dur: Math.max(0.18, dist / 900),
			style,
			arrived: false,
			onArrive,
		});
	}

	private glow(x: number, y: number, r: number, color: string): void {
		const g = this.ctx.createRadialGradient(x, y, 0, x, y, r);
		g.addColorStop(0, color);
		g.addColorStop(1, 'rgba(0,0,0,0)');
		this.ctx.fillStyle = g;
		this.ctx.beginPath();
		this.ctx.arc(x, y, r, 0, Math.PI * 2);
		this.ctx.fill();
	}

	private loop(ts: number): void {
		if (!this.running) return;
		const dt = this.last ? Math.min(0.05, (ts - this.last) / 1000) : 0.016;
		this.last = ts;
		const ctx = this.ctx;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		ctx.clearRect(
			0,
			0,
			this.canvas.width / this.dpr,
			this.canvas.height / this.dpr,
		);
		ctx.globalCompositeOperation = 'lighter';

		for (const b of this.bolts) {
			b.t += dt / b.dur;
			const f = Math.min(1, b.t);
			b.x = b.tx - b.dx * (1 - f);
			b.y = b.ty - b.dy * (1 - f);
			this.parts.push({
				x: b.x,
				y: b.y,
				vx: (Math.random() - 0.5) * 36,
				vy: (Math.random() - 0.5) * 36,
				life: 0,
				max: 0.25,
				size: 2 + Math.random() * 2,
				color: this.rampColor(b.style, Math.random()),
			});
			this.glow(b.x, b.y, 8, b.style.core);
			if (b.t >= 1 && !b.arrived) {
				b.arrived = true;
				b.onArrive?.();
			}
		}
		this.bolts = this.bolts.filter((b) => b.t < 1);

		for (const p of this.parts) {
			p.life += dt;
			const k = 1 - p.life / p.max;
			p.x += p.vx * dt;
			p.y += p.vy * dt;
			p.vy += 120 * dt;
			if (k > 0) {
				ctx.globalAlpha = Math.max(0, k);
				this.glow(p.x, p.y, p.size, p.color);
			}
		}
		ctx.globalAlpha = 1;
		this.parts = this.parts.filter((p) => p.life < p.max);

		this.raf = requestAnimationFrame(this.loop);
	}
}
