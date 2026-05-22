import { describe, expect, it } from 'vitest';
import { ENEMY_CATALOG } from '../config';
import { computeEnemyStats } from './stats';

describe('computeEnemyStats', () => {
	it('returns positive baseline for wave 1 runner', () => {
		const stats = computeEnemyStats(1, ENEMY_CATALOG.runner);
		expect(stats.hp).toBeGreaterThan(0);
		expect(stats.speed).toBeGreaterThan(0);
		expect(stats.attackDamage).toBeGreaterThanOrEqual(
			ENEMY_CATALOG.runner.attackDamage,
		);
		expect(stats.radius).toBeGreaterThan(0);
	});

	it('scales hp upward with wave', () => {
		const w1 = computeEnemyStats(1, ENEMY_CATALOG.brute).hp;
		const w10 = computeEnemyStats(10, ENEMY_CATALOG.brute).hp;
		expect(w10).toBeGreaterThan(w1);
	});

	it('non-attacking types still receive zero attack damage when canAttack=false', () => {
		const stats = computeEnemyStats(5, {
			...ENEMY_CATALOG.runner,
			canAttack: false,
		});
		expect(stats.attackDamage).toBe(0);
	});

	it('armor is a fraction of hp', () => {
		const stats = computeEnemyStats(5, ENEMY_CATALOG.brute);
		expect(stats.armor).toBeGreaterThan(0);
		expect(stats.armor).toBeLessThan(stats.hp);
	});
});
