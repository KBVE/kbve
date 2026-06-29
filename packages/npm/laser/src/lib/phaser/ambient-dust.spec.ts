import { describe, it, expect, vi } from 'vitest';
import { dustMemberAt, createDustMoteLayer } from './ambient-dust';

vi.mock('phaser', () => ({
	default: { WEBGL: 2, CANVAS: 1 },
	WEBGL: 2,
	CANVAS: 1,
}));

describe('dustMemberAt', () => {
	it('spreads the mote across the field and drives GPU oscillation', () => {
		const rand = () => 0.5;
		const m = dustMemberAt(
			0,
			{ width: 800, height: 600, count: 10 },
			rand,
		) as {
			x: number;
			y: {
				base: number;
				amplitude: number;
				loop: boolean;
				yoyo: boolean;
			};
			alpha: { base: number; loop: boolean };
		};
		expect(m.x).toBe(400);
		expect(m.y.base).toBe(300);
		expect(m.y.amplitude).toBeGreaterThan(0);
		expect(m.y.loop).toBe(true);
		expect(m.y.yoyo).toBe(true);
		expect(m.alpha.loop).toBe(true);
	});

	it('varies position from the rng across calls', () => {
		let n = 0;
		const rand = () => {
			n += 1;
			return (n * 0.13) % 1;
		};
		const a = dustMemberAt(
			0,
			{ width: 100, height: 100, count: 2 },
			rand,
		) as {
			x: number;
		};
		const b = dustMemberAt(
			1,
			{ width: 100, height: 100, count: 2 },
			rand,
		) as {
			x: number;
		};
		expect(a.x).not.toBe(b.x);
	});
});

function makeScene(rendererType: number) {
	const layer = {
		setDepth: vi.fn().mockReturnThis(),
		setAlpha: vi.fn().mockReturnThis(),
		setBlendMode: vi.fn().mockReturnThis(),
		setVisible: vi.fn().mockReturnThis(),
		setAllSegmentsNeedUpdate: vi.fn(),
		addMember: vi.fn().mockReturnThis(),
		destroy: vi.fn(),
	};
	const gfx = {
		fillStyle: vi.fn().mockReturnThis(),
		fillCircle: vi.fn().mockReturnThis(),
		generateTexture: vi.fn().mockReturnThis(),
		destroy: vi.fn(),
	};
	return {
		scene: {
			renderer: { type: rendererType },
			game: { canvas: document.createElement('canvas') },
			textures: { exists: vi.fn().mockReturnValue(false) },
			make: { graphics: vi.fn().mockReturnValue(gfx) },
			add: { spriteGPULayer: vi.fn().mockReturnValue(layer) },
		},
		layer,
		gfx,
	};
}

describe('createDustMoteLayer', () => {
	it('returns null on Canvas and builds no texture', () => {
		const { scene, gfx } = makeScene(1);
		const handle = createDustMoteLayer(scene as never, {
			width: 800,
			height: 600,
			count: 50,
		});
		expect(handle).toBeNull();
		expect(gfx.generateTexture).not.toHaveBeenCalled();
	});

	it('generates the dot texture once and populates count motes on WebGL', () => {
		const { scene, layer, gfx } = makeScene(2);
		const handle = createDustMoteLayer(scene as never, {
			width: 800,
			height: 600,
			count: 50,
			depth: -5,
		});
		expect(handle).not.toBeNull();
		expect(gfx.generateTexture).toHaveBeenCalledTimes(1);
		expect(gfx.destroy).toHaveBeenCalledTimes(1);
		expect(layer.addMember).toHaveBeenCalledTimes(50);
		expect(layer.setDepth).toHaveBeenCalledWith(-5);
	});
});
