import type Phaser from 'phaser';

export interface LaserGameConfig {
	width?: number;
	height?: number;
	scenes: (
		| typeof Phaser.Scene
		| (new (...args: unknown[]) => Phaser.Scene)
	)[];
	physics?: Phaser.Types.Core.PhysicsConfig;
	plugins?: Phaser.Types.Core.PluginObject;
	parent?: HTMLElement | string;
	scale?: Phaser.Types.Core.ScaleConfig;
	backgroundColor?: string;
	transparent?: boolean;
}

export type GameStatus =
	| 'idle'
	| 'booting'
	| 'running'
	| 'paused'
	| 'destroyed';

export type GridDirection =
	| 'left'
	| 'right'
	| 'up'
	| 'down'
	| 'up-left'
	| 'up-right'
	| 'down-left'
	| 'down-right';

export interface CharacterEventData {
	message: string;
	character_name?: string;
	character_image?: string;
	background_image?: string;
}

export interface NotificationEventData {
	title: string;
	message: string;
	notificationType?: string;
}

export interface LaserEventMap {
	'game:ready': { game: Phaser.Game };
	'game:destroy': void;
	'scene:change': { from?: string; to: string };
	'player:interact': { position: Point2D; ranges: Range[] };
	'player:move': { position: Point2D; direction: GridDirection };
	'player:nearby': { position: Point2D; ranges: Range[] };
	'char:event': CharacterEventData;
	notification: NotificationEventData;
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

export type Bounds = Bounds2D;

export interface Range {
	name: string;
	bounds: Bounds2D;
	action: (...args: unknown[]) => void | Promise<void>;
}
