import type Phaser from 'phaser';
import type { Building } from '../types';

export const DroneTag: Record<string, never> = {};

export const enum DroneState {
	Outbound = 0,
	Returning = 1,
}

export const DroneStats = {
	speed: [] as number[],
	state: [] as number[],
};

export interface DroneVisual {
	sprite: Phaser.GameObjects.Arc;
	beam: Phaser.GameObjects.Graphics;
	station: Building;
	target: Building;
	repairAmount: number;
}
