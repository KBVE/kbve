import { round } from './stats';

export interface GlCallStats {
	name: string;
	calls: number;
	total: number;
	max: number;
}

// Timed by default: the calls that can block, plus the draw calls, so a stall
// can be shown to be outside the driver as easily as inside it. Shader link is
// lazy in most drivers — linkProgram returns immediately and the cost lands on
// the first getProgramParameter/useProgram — so all three are timed separately
// rather than trusting linkProgram alone to represent compilation.
export const DEFAULT_GL_HOOKS = [
	'compileShader',
	'linkProgram',
	'getProgramParameter',
	'getShaderParameter',
	'useProgram',
	'texImage2D',
	'texSubImage2D',
	'compressedTexImage2D',
	'texStorage2D',
	'generateMipmap',
	'bufferData',
	'bufferSubData',
	'readPixels',
	'finish',
	'drawArrays',
	'drawElements',
] as const;

type Ledger = (key: string, ms: number) => void;

interface Entry {
	calls: number;
	total: number;
	max: number;
}

// Patches the WebGL prototypes rather than one context, so it catches contexts
// created after start() — three recreates one on a GPU reset.
export class GlWatch {
	private readonly stats = new Map<string, Entry>();
	private readonly restore: Array<() => void> = [];

	constructor(private readonly ledger: Ledger) {}

	start(hooks: readonly string[] = DEFAULT_GL_HOOKS): void {
		if (this.restore.length) return;
		const protos = [
			(globalThis as Record<string, unknown>).WebGL2RenderingContext,
			(globalThis as Record<string, unknown>).WebGLRenderingContext,
		]
			.map((c) => (c as { prototype?: object } | undefined)?.prototype)
			.filter(Boolean) as Array<Record<string, unknown>>;

		for (const proto of protos) {
			for (const name of hooks) {
				const orig = proto[name];
				if (typeof orig !== 'function') continue;
				const stats = this.stats;
				const ledger = this.ledger;
				proto[name] = function (this: unknown, ...args: unknown[]) {
					const s = performance.now();
					const r = (orig as (...a: unknown[]) => unknown).apply(
						this,
						args,
					);
					const d = performance.now() - s;
					let e = stats.get(name);
					if (!e) {
						e = { calls: 0, total: 0, max: 0 };
						stats.set(name, e);
					}
					e.calls++;
					e.total += d;
					if (d > e.max) e.max = d;
					ledger(`gl.${name}`, d);
					return r;
				};
				this.restore.push(() => {
					proto[name] = orig;
				});
			}
		}
	}

	stop(): void {
		for (const undo of this.restore.splice(0)) undo();
	}

	get active(): boolean {
		return this.restore.length > 0;
	}

	report(): GlCallStats[] {
		return [...this.stats]
			.map(([name, e]) => ({
				name,
				calls: e.calls,
				total: round(e.total, 1),
				max: round(e.max, 2),
			}))
			.sort((a, b) => b.total - a.total);
	}

	reset(): void {
		this.stats.clear();
	}
}
