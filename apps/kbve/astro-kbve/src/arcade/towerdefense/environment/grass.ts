import type Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, COLORS } from '../config';

const TUFT_COLORS = [0x2f6b45, 0x1f4a32, 0x3b8755];
const TUFT_SEED = 0x1f3a52;
const TUFT_DENSITY = 900;

export function drawGrass(scene: Phaser.Scene): void {
	scene.add
		.rectangle(
			BASE_WIDTH / 2,
			BASE_HEIGHT / 2,
			BASE_WIDTH,
			BASE_HEIGHT,
			COLORS.grass,
		)
		.setOrigin(0.5);
	const tufts = scene.add.graphics();
	let seed = TUFT_SEED;
	const rng = () => {
		seed = (seed * 1664525 + 1013904223) & 0xffffffff;
		return ((seed >>> 0) % 10000) / 10000;
	};
	const count = Math.floor((BASE_WIDTH * BASE_HEIGHT) / TUFT_DENSITY);
	for (let i = 0; i < count; i++) {
		const gx = rng() * BASE_WIDTH;
		const gy = rng() * BASE_HEIGHT;
		const color = TUFT_COLORS[i % TUFT_COLORS.length];
		const r = 1 + rng() * 1.5;
		tufts.fillStyle(color, 0.55);
		tufts.fillCircle(gx, gy, r);
	}
}
