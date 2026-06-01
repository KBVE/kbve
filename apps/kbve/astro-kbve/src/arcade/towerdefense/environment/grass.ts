import type Phaser from 'phaser';
import { BASE_HEIGHT, BASE_WIDTH, COLORS } from '../config';

const GRASS_FLOW_RATE = 0.00002;

export interface GrassController {
	update(time: number): void;
}

export function drawGrass(scene: Phaser.Scene): GrassController | null {
	scene.add
		.rectangle(
			BASE_WIDTH / 2,
			BASE_HEIGHT / 2,
			BASE_WIDTH,
			BASE_HEIGHT,
			COLORS.grass,
		)
		.setOrigin(0.5);

	if (typeof scene.add.noisesimplex2d !== 'function') {
		drawFallbackTufts(scene);
		return null;
	}

	const noise = scene.add.noisesimplex2d(
		{
			noiseCells: [24, 24],
			noiseIterations: 3,
			noiseWarpAmount: 0.35,
			noiseWarpIterations: 2,
			noiseFlow: 0,
			noiseColorStart: 0x1f4a32,
			noiseColorEnd: 0x3b8755,
			noiseValueFactor: 0.45,
			noiseValueAdd: 0.4,
			noiseValuePower: 1.1,
			noiseSeed: [7, 13],
		},
		BASE_WIDTH / 2,
		BASE_HEIGHT / 2,
		BASE_WIDTH,
		BASE_HEIGHT,
	);
	noise.setAlpha(0.55);

	return {
		update(time: number) {
			noise.noiseFlow = time * GRASS_FLOW_RATE;
		},
	};
}

function drawFallbackTufts(scene: Phaser.Scene) {
	const tufts = scene.add.graphics();
	let seed = 0x1f3a52;
	const rng = () => {
		seed = (seed * 1664525 + 1013904223) & 0xffffffff;
		return ((seed >>> 0) % 10000) / 10000;
	};
	const count = Math.floor((BASE_WIDTH * BASE_HEIGHT) / 900);
	const colors = [0x2f6b45, 0x1f4a32, 0x3b8755];
	for (let i = 0; i < count; i++) {
		const gx = rng() * BASE_WIDTH;
		const gy = rng() * BASE_HEIGHT;
		tufts.fillStyle(colors[i % colors.length], 0.55);
		tufts.fillCircle(gx, gy, 1 + rng() * 1.5);
	}
}
