import type Phaser from 'phaser';

export const BurnPatchTag: Record<string, never> = {};

export const BurnPatchStats = {
	radius: [] as number[],
	dps: [] as number[],
	expiresAtMs: [] as number[],
};

export interface BurnPatchVisual {
	sprite: Phaser.GameObjects.Arc;
}
