import type Phaser from 'phaser';
import { MAX_ENTITIES } from './shared';

export const BurnPatchTag: Record<string, never> = {};

export const BurnPatchStats = {
	radius: new Float32Array(MAX_ENTITIES),
	dps: new Float32Array(MAX_ENTITIES),
	expiresAtMs: new Float32Array(MAX_ENTITIES),
};

export interface BurnPatchVisual {
	sprite: Phaser.GameObjects.Arc | Phaser.GameObjects.Image;
}
