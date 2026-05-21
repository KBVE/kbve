import type Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, COLORS, COLS, ROWS, TILE } from '../config';

export function drawGridLines(scene: Phaser.Scene): void {
	const g = scene.add.graphics();
	g.lineStyle(1, COLORS.gridLine, 0.5);
	for (let c = 1; c < COLS; c++) {
		g.lineBetween(c * TILE, 0, c * TILE, BASE_HEIGHT);
	}
	for (let r = 1; r < ROWS; r++) {
		g.lineBetween(0, r * TILE, BASE_WIDTH, r * TILE);
	}
}
