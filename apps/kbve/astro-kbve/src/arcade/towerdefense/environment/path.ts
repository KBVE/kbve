import type Phaser from 'phaser';
import { COLORS, TILE } from '../config';
import type { GeneratedPath } from '../path-generator';

const PATH_SHADOW_COLOR = 0x0d1f15;
const PATH_INNER_COLOR = 0x394b62;
const PATH_MARKER_COLOR = 0x6b7e94;

export function drawPath(scene: Phaser.Scene, path: GeneratedPath): void {
	const w = path.waypoints;
	const shadow = scene.add.graphics();
	shadow.lineStyle(TILE + 2, PATH_SHADOW_COLOR, 0.35);
	shadow.beginPath();
	shadow.moveTo(w[0].x, w[0].y + 2);
	for (let i = 1; i < w.length; i++) shadow.lineTo(w[i].x, w[i].y + 2);
	shadow.strokePath();
	const fill = scene.add.graphics();
	fill.lineStyle(TILE - 2, COLORS.pathFill, 1);
	fill.beginPath();
	fill.moveTo(w[0].x, w[0].y);
	for (let i = 1; i < w.length; i++) fill.lineTo(w[i].x, w[i].y);
	fill.strokePath();
	const inner = scene.add.graphics();
	inner.lineStyle(TILE * 0.55, PATH_INNER_COLOR, 1);
	inner.beginPath();
	inner.moveTo(w[0].x, w[0].y);
	for (let i = 1; i < w.length; i++) inner.lineTo(w[i].x, w[i].y);
	inner.strokePath();
	const markers = scene.add.graphics();
	markers.fillStyle(PATH_MARKER_COLOR, 0.7);
	for (let i = 0; i < w.length - 1; i++) {
		const a = w[i];
		const b = w[i + 1];
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const len = Math.hypot(dx, dy);
		if (len < TILE) continue;
		const steps = Math.floor(len / (TILE * 0.6));
		for (let s = 1; s < steps; s++) {
			const t = s / steps;
			markers.fillCircle(a.x + dx * t, a.y + dy * t, 1.6);
		}
	}
}
