import Phaser from 'phaser';
import { HEIGHT_AMPLITUDE } from '@kbve/laser';
import {
	isoHeightActive,
	terrainHeightUu,
	screenToWorldF,
	HEIGHT_PX_PER_UU,
} from '../iso';

/**
 * Height texture for the ground shader: a camera-following window of the
 * shared heightfield, one sample per tile, 16-bit packed into RG. The fragment
 * shader bilinearly interpolates between tile samples — the same smoothing the
 * Unreal terrain mesh gets from vertex interpolation.
 */
export const HEIGHT_TEX_SIZE = 160;
export const HEIGHT_TEX_KEYS = ['arpg-height-0', 'arpg-height-1'] as const;
const REBUILD_MARGIN_TILES = 24;

export interface HeightTextureHandle {
	/** Current texture key ('' until first build). */
	key: string;
	/** Tile-space rect: origin x, origin y, 1/size, 1/size. */
	rect: [number, number, number, number];
	ampPx: number;
	update(cam: Phaser.Cameras.Scene2D.Camera): boolean;
	reset(): void;
}

export function makeHeightTexture(scene: Phaser.Scene): HeightTextureHandle {
	let flip = 0;
	let originX = Number.NaN;
	let originY = Number.NaN;
	const data = new Uint8Array(HEIGHT_TEX_SIZE * HEIGHT_TEX_SIZE * 4);

	const handle: HeightTextureHandle = {
		key: '',
		rect: [0, 0, 1 / HEIGHT_TEX_SIZE, 1 / HEIGHT_TEX_SIZE],
		ampPx: HEIGHT_AMPLITUDE * HEIGHT_PX_PER_UU,
		update(cam) {
			if (!isoHeightActive()) return false;
			const center = screenToWorldF(cam.midPoint.x, cam.midPoint.y);
			const half = HEIGHT_TEX_SIZE / 2;
			if (
				!Number.isNaN(originX) &&
				Math.abs(center.x - (originX + half)) <
					half - REBUILD_MARGIN_TILES &&
				Math.abs(center.y - (originY + half)) <
					half - REBUILD_MARGIN_TILES
			) {
				return false;
			}
			originX = Math.floor(center.x) - half;
			originY = Math.floor(center.y) - half;
			build(data, originX, originY);
			flip ^= 1;
			const key = HEIGHT_TEX_KEYS[flip];
			if (scene.textures.exists(key)) scene.textures.remove(key);
			scene.textures.addUint8Array(
				key,
				data,
				HEIGHT_TEX_SIZE,
				HEIGHT_TEX_SIZE,
			);
			handle.key = key;
			handle.rect = [
				originX,
				originY,
				1 / HEIGHT_TEX_SIZE,
				1 / HEIGHT_TEX_SIZE,
			];
			return true;
		},
		reset() {
			originX = Number.NaN;
			originY = Number.NaN;
		},
	};
	return handle;
}

function build(data: Uint8Array, originX: number, originY: number): void {
	let i = 0;
	for (let y = 0; y < HEIGHT_TEX_SIZE; y++) {
		for (let x = 0; x < HEIGHT_TEX_SIZE; x++) {
			const h = terrainHeightUu(originX + x, originY + y);
			const hn = Math.min(
				65535,
				Math.max(
					0,
					Math.round(((h / HEIGHT_AMPLITUDE + 1) / 2) * 65535),
				),
			);
			data[i] = hn >> 8;
			data[i + 1] = hn & 0xff;
			data[i + 2] = 0;
			data[i + 3] = 255;
			i += 4;
		}
	}
}
