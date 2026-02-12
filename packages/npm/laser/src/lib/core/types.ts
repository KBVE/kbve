import type Phaser from 'phaser';

export interface LaserGameConfig {
	width?: number;
	height?: number;
	scenes: (typeof Phaser.Scene | (new (...args: unknown[]) => Phaser.Scene))[];
	physics?: Phaser.Types.Core.PhysicsConfig;
	plugins?: Phaser.Types.Core.PluginObject;
	parent?: HTMLElement | string;
	scale?: Phaser.Types.Core.ScaleConfig;
	backgroundColor?: string;
	transparent?: boolean;
}

export type GameStatus = 'idle' | 'booting' | 'running' | 'paused' | 'destroyed';

export interface LaserEventMap {
	'game:ready': { game: Phaser.Game };
	'game:destroy': void;
	'scene:change': { from?: string; to: string };
	[key: string]: unknown;
}

export interface Point2D {
	x: number;
	y: number;
}

export interface Bounds2D {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
}
