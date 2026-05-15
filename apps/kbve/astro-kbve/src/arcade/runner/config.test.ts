import { describe, expect, it } from 'vitest';
import {
	BASE_HEIGHT,
	BASE_WIDTH,
	COLORS,
	GAME_CONFIG,
	PLAYER_SIZE,
} from './config';

describe('runner config invariants', () => {
	it('base resolution is positive 16:9-ish', () => {
		expect(BASE_WIDTH).toBeGreaterThan(0);
		expect(BASE_HEIGHT).toBeGreaterThan(0);
		const ratio = BASE_WIDTH / BASE_HEIGHT;
		expect(ratio).toBeGreaterThan(1.5);
		expect(ratio).toBeLessThan(2.0);
	});

	it('player size is positive and shorter than base', () => {
		expect(PLAYER_SIZE.width).toBeGreaterThan(0);
		expect(PLAYER_SIZE.height).toBeGreaterThan(0);
		expect(PLAYER_SIZE.width).toBeLessThan(BASE_WIDTH);
		expect(PLAYER_SIZE.height).toBeLessThan(BASE_HEIGHT);
	});

	it('gravity pulls down (positive value, applied as +y)', () => {
		expect(GAME_CONFIG.gravity).toBeGreaterThan(0);
	});

	it('jump force pushes up (negative y)', () => {
		expect(GAME_CONFIG.jumpForce).toBeLessThan(0);
	});

	it('horizontal speeds are positive and player speed <= maxSpeed', () => {
		expect(GAME_CONFIG.playerSpeed).toBeGreaterThan(0);
		expect(GAME_CONFIG.maxSpeed).toBeGreaterThanOrEqual(
			GAME_CONFIG.playerSpeed,
		);
	});

	it('deceleration >= acceleration (snappy stop)', () => {
		expect(GAME_CONFIG.deceleration).toBeGreaterThanOrEqual(
			GAME_CONFIG.acceleration,
		);
	});

	it('grapple max distance fits inside screen width with headroom', () => {
		expect(GAME_CONFIG.grappleMaxDistance).toBeGreaterThan(0);
		expect(GAME_CONFIG.grappleMaxDistance).toBeLessThanOrEqual(BASE_WIDTH);
	});

	it('numeric COLORS are within 24-bit range', () => {
		for (const k of [
			'background',
			'ground',
			'player',
			'platform',
			'enemyWalker',
			'enemyFlyer',
			'enemySpiker',
			'grappleLine',
		] as const) {
			const v = COLORS[k];
			expect(typeof v).toBe('number');
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThanOrEqual(0xffffff);
		}
	});

	it('string COLORS are valid CSS hex', () => {
		for (const k of ['gameOverText', 'scoreText', 'hintText'] as const) {
			expect(COLORS[k]).toMatch(/^#[0-9a-fA-F]{3,8}$/);
		}
	});

	it('spawn interval is in a sane game-loop range', () => {
		expect(GAME_CONFIG.spawnInterval).toBeGreaterThan(500);
		expect(GAME_CONFIG.spawnInterval).toBeLessThan(10_000);
	});

	it('groundOffset fits inside base height', () => {
		expect(GAME_CONFIG.groundOffset).toBeGreaterThan(0);
		expect(GAME_CONFIG.groundOffset).toBeLessThan(BASE_HEIGHT);
	});
});
