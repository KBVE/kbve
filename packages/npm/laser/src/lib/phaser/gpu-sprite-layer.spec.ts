import { describe, it, expect, vi } from 'vitest';
import {
	createGpuSpriteLayer,
	populateGpuSpriteLayer,
} from './gpu-sprite-layer';

vi.mock('phaser', () => ({
	default: { WEBGL: 2, CANVAS: 1 },
	WEBGL: 2,
	CANVAS: 1,
}));

function makeLayer() {
	return {
		setDepth: vi.fn().mockReturnThis(),
		setAlpha: vi.fn().mockReturnThis(),
		setBlendMode: vi.fn().mockReturnThis(),
		setVisible: vi.fn().mockReturnThis(),
		setAllSegmentsNeedUpdate: vi.fn(),
		addMember: vi.fn().mockReturnThis(),
		destroy: vi.fn(),
	};
}

function makeScene(rendererType: number, layer = makeLayer()) {
	const spriteGPULayer = vi.fn().mockReturnValue(layer);
	return {
		scene: {
			renderer: { type: rendererType },
			game: { canvas: document.createElement('canvas') },
			add: { spriteGPULayer },
		},
		spriteGPULayer,
		layer,
	};
}

describe('createGpuSpriteLayer', () => {
	it('returns null on the Canvas fallback and never builds a layer', () => {
		const { scene, spriteGPULayer } = makeScene(1);
		const handle = createGpuSpriteLayer(scene as never, 'stars', {
			size: 100,
		});
		expect(handle).toBeNull();
		expect(spriteGPULayer).not.toHaveBeenCalled();
	});

	it('builds a depth-applied layer under WebGL and returns a handle', () => {
		const { scene, spriteGPULayer, layer } = makeScene(2);
		const handle = createGpuSpriteLayer(scene as never, 'stars', {
			size: 100,
			depth: 5,
			alpha: 0.8,
		});
		expect(handle).not.toBeNull();
		expect(spriteGPULayer).toHaveBeenCalledWith('stars', 100);
		expect(layer.setDepth).toHaveBeenCalledWith(5);
		expect(layer.setAlpha).toHaveBeenCalledWith(0.8);
		expect(handle!.layer).toBe(layer);
	});

	it('dispose destroys the layer', () => {
		const { scene, layer } = makeScene(2);
		const handle = createGpuSpriteLayer(scene as never, 'stars', {
			size: 10,
		});
		handle!.dispose();
		expect(layer.destroy).toHaveBeenCalled();
	});
});

describe('populateGpuSpriteLayer', () => {
	it('reuses one scratch member across all addMember calls', () => {
		const { scene, layer } = makeScene(2);
		const handle = createGpuSpriteLayer(scene as never, 'stars', {
			size: 3,
		})!;
		const seen: unknown[] = [];
		layer.addMember.mockImplementation((m: unknown) => {
			seen.push(m);
			return layer;
		});

		const xs: number[] = [];
		populateGpuSpriteLayer(handle, 3, (member, i) => {
			(member as { x: number }).x = i;
			xs.push((member as { x: number }).x);
		});

		expect(layer.addMember).toHaveBeenCalledTimes(3);
		expect(xs).toEqual([0, 1, 2]);
		expect(seen[0]).toBe(seen[1]);
		expect(seen[1]).toBe(seen[2]);
	});
});
