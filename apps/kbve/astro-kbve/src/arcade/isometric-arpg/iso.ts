import { TILE_W, TILE_H } from './config';

export interface TileXY {
	x: number;
	y: number;
}

export interface PixelXY {
	x: number;
	y: number;
}

export function worldToScreen(tx: number, ty: number): PixelXY {
	return {
		x: (tx - ty) * (TILE_W / 2),
		y: (tx + ty) * (TILE_H / 2),
	};
}

export function screenToWorld(px: number, py: number): TileXY {
	const a = px / (TILE_W / 2);
	const b = py / (TILE_H / 2);
	return {
		x: Math.round((a + b) / 2),
		y: Math.round((b - a) / 2),
	};
}

export function tileDepth(tx: number, ty: number): number {
	return tx + ty;
}
