import Phaser from 'phaser';
import {
	createGpuSpriteLayer,
	populateGpuSpriteLayer,
	type GpuSpriteLayerHandle,
} from './gpu-sprite-layer';

export interface DustMoteOptions {
	count: number;
	width: number;
	height: number;
	depth?: number;
	color?: number;
	radius?: number;
	alpha?: number;
	blendMode?: number;
	scrollFactor?: number;
	textureKey?: string;
}

type Rand = () => number;

export function dustMemberAt(
	_i: number,
	opts: Pick<DustMoteOptions, 'width' | 'height' | 'count' | 'scrollFactor'>,
	rand: Rand,
): Partial<Phaser.Types.GameObjects.SpriteGPULayer.Member> {
	const x = rand() * opts.width;
	const yBase = rand() * opts.height;
	const drift = 4 + rand() * 10;
	const driftMs = 4000 + rand() * 5000;
	const scale = 0.5 + rand() * 1.1;
	const alphaBase = 0.35 + rand() * 0.35;
	const alphaMs = 2500 + rand() * 3500;
	const member: Partial<Phaser.Types.GameObjects.SpriteGPULayer.Member> = {
		x,
		y: {
			base: yBase,
			amplitude: drift,
			duration: driftMs,
			ease: 'Sine.easeInOut',
			loop: true,
			yoyo: true,
		},
		scaleX: scale,
		scaleY: scale,
		alpha: {
			base: alphaBase,
			amplitude: 0.25,
			duration: alphaMs,
			ease: 'Sine.easeInOut',
			loop: true,
			yoyo: true,
		},
	};
	if (opts.scrollFactor !== undefined) {
		member.scrollFactorX = opts.scrollFactor;
		member.scrollFactorY = opts.scrollFactor;
	}
	return member;
}

function ensureDotTexture(
	scene: Phaser.Scene,
	key: string,
	radius: number,
	color: number,
): void {
	if (scene.textures.exists(key)) return;
	const d = radius * 2;
	const gfx = scene.make.graphics({ x: 0, y: 0 }, false);
	gfx.fillStyle(color, 1);
	gfx.fillCircle(radius, radius, radius);
	gfx.generateTexture(key, d, d);
	gfx.destroy();
}

export function createDustMoteLayer(
	scene: Phaser.Scene,
	opts: DustMoteOptions,
	rand: Rand = Math.random,
): GpuSpriteLayerHandle | null {
	if (scene.renderer.type !== Phaser.WEBGL) {
		return null;
	}

	const key = opts.textureKey ?? 'laser-dust-mote';
	const radius = opts.radius ?? 2;
	ensureDotTexture(scene, key, radius, opts.color ?? 0xffffff);

	const handle = createGpuSpriteLayer(scene, key, {
		size: opts.count,
		depth: opts.depth,
		alpha: opts.alpha,
		blendMode: opts.blendMode,
	});
	if (!handle) return null;

	populateGpuSpriteLayer(handle, opts.count, (member, i) =>
		Object.assign(member, dustMemberAt(i, opts, rand)),
	);

	return handle;
}
