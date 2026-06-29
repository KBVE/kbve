import Phaser from 'phaser';
import { installWebGLContextGuard } from '../webgl/context-guard';

export interface GpuSpriteLayerOptions {
	size: number;
	depth?: number;
	alpha?: number;
	blendMode?: number;
	visible?: boolean;
}

export interface GpuSpriteLayerHandle {
	readonly layer: Phaser.GameObjects.SpriteGPULayer;
	dispose(): void;
}

export function createGpuSpriteLayer(
	scene: Phaser.Scene,
	texture: string | Phaser.Textures.Texture,
	opts: GpuSpriteLayerOptions,
): GpuSpriteLayerHandle | null {
	if (scene.renderer.type !== Phaser.WEBGL) {
		return null;
	}

	const layer = scene.add.spriteGPULayer(texture, opts.size);

	if (opts.depth !== undefined) {
		layer.setDepth(opts.depth);
	}
	if (opts.alpha !== undefined) {
		layer.setAlpha(opts.alpha);
	}
	if (opts.blendMode !== undefined) {
		layer.setBlendMode(opts.blendMode);
	}
	if (opts.visible !== undefined) {
		layer.setVisible(opts.visible);
	}

	const detach = installWebGLContextGuard(scene.game.canvas, {
		onLost: () => undefined,
		onRestored: () => layer.setAllSegmentsNeedUpdate(),
	});

	return {
		layer,
		dispose() {
			detach();
			layer.destroy();
		},
	};
}

export function populateGpuSpriteLayer(
	handle: GpuSpriteLayerHandle,
	count: number,
	fill: (
		member: Partial<Phaser.Types.GameObjects.SpriteGPULayer.Member>,
		i: number,
	) => void,
): void {
	const scratch: Partial<Phaser.Types.GameObjects.SpriteGPULayer.Member> = {};
	for (let i = 0; i < count; i++) {
		fill(scratch, i);
		handle.layer.addMember(scratch);
	}
}
