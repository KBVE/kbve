import type Phaser from 'phaser';
import { MAX_ENTITIES } from './shared';

export const DroneTag: Record<string, never> = {};

export const enum DroneState {
	Outbound = 0,
	Returning = 1,
}

export const DroneStats = {
	speed: new Float32Array(MAX_ENTITIES),
	state: new Uint8Array(MAX_ENTITIES),
	stationEid: new Int32Array(MAX_ENTITIES),
	targetEid: new Int32Array(MAX_ENTITIES),
	repairAmount: new Float32Array(MAX_ENTITIES),
};

export interface DroneVisual {
	sprite: Phaser.GameObjects.Arc;
	beam: Phaser.GameObjects.Line;
}
