import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
	Position,
	ProjectileStats,
	type ProjectileVisual,
} from '../components';
import { stepProjectile, type ProjectileStepCtx } from './projectile-step';

function makeCtx(
	overrides: Partial<ProjectileStepCtx> = {},
): ProjectileStepCtx {
	const sprite = {
		setPosition: vi.fn(),
	} as unknown as Phaser.GameObjects.Arc;
	return {
		enemyAlive: () => true,
		getVisual: () => ({ sprite }) as ProjectileVisual,
		onHit: vi.fn(),
		onDead: vi.fn(),
		...overrides,
	};
}

describe('stepProjectile', () => {
	beforeEach(() => {
		for (let i = 0; i < 50; i++) {
			Position.x[i] = 0;
			Position.y[i] = 0;
			ProjectileStats.startX[i] = 0;
			ProjectileStats.startY[i] = 0;
			ProjectileStats.targetX[i] = 0;
			ProjectileStats.targetY[i] = 0;
			ProjectileStats.speed[i] = 0;
			ProjectileStats.totalDist[i] = 0;
			ProjectileStats.traveled[i] = 0;
			ProjectileStats.homing[i] = 0;
			ProjectileStats.arcHeight[i] = 0;
			ProjectileStats.enemyEid[i] = -1;
		}
	});

	it('homing projectile reaches target and triggers onHit', () => {
		const eid = 1;
		Position.x[eid] = 0;
		Position.y[eid] = 0;
		ProjectileStats.speed[eid] = 100;
		ProjectileStats.homing[eid] = 1;
		ProjectileStats.targetX[eid] = 5;
		ProjectileStats.targetY[eid] = 0;
		const onHit = vi.fn();
		const onDead = vi.fn();
		stepProjectile(makeCtx({ onHit, onDead }), eid, 1, 1000);
		expect(onHit).toHaveBeenCalledWith(eid, 1000, 0, 0);
		expect(onDead).toHaveBeenCalledWith(eid);
	});

	it('ballistic projectile reaches end when traveled >= totalDist', () => {
		const eid = 2;
		Position.x[eid] = 0;
		Position.y[eid] = 0;
		ProjectileStats.speed[eid] = 1000;
		ProjectileStats.homing[eid] = 0;
		ProjectileStats.startX[eid] = 0;
		ProjectileStats.startY[eid] = 0;
		ProjectileStats.targetX[eid] = 100;
		ProjectileStats.targetY[eid] = 0;
		ProjectileStats.totalDist[eid] = 100;
		ProjectileStats.traveled[eid] = 0;
		const onHit = vi.fn();
		stepProjectile(makeCtx({ onHit }), eid, 1, 2000);
		expect(onHit).toHaveBeenCalled();
	});

	it('marks dead when visual lookup fails', () => {
		const onDead = vi.fn();
		stepProjectile(
			makeCtx({ getVisual: () => undefined, onDead }),
			3,
			1,
			0,
		);
		expect(onDead).toHaveBeenCalledWith(3);
	});
});
