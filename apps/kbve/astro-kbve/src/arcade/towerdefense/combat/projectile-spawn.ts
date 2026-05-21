import type Phaser from 'phaser';
import { addComponent, addEntity, type World } from 'bitecs';
import type { SideMap } from '@kbve/laser';
import {
	Position,
	ProjectileStats,
	ProjectileTag,
	TowerState,
	type ProjectileVisual,
} from '../components';
import { GAME_CONFIG } from '../config';
import { towerBurnDps, towerDamage } from '../stats';
import type { TowerBuilding } from '../types';

export interface ProjectileSpawnDeps {
	world: World;
	simNow: number;
	projectileVisuals: SideMap<ProjectileVisual>;
	acquireProjectileSprite: (
		x: number,
		y: number,
		radius: number,
		color: number,
	) => Phaser.GameObjects.Arc;
	consumeBatteryCharge: (amount: number) => boolean;
}

export function spawnTowerProjectile(
	deps: ProjectileSpawnDeps,
	t: TowerBuilding,
	targetX: number,
	targetY: number,
	enemyId: number | null,
): void {
	const spec = t.spec;
	const supportsCharged = spec.id === 'bomb' || spec.id === 'artillery';
	let isCharged = false;
	if (
		supportsCharged &&
		deps.simNow >= TowerState.chargedReadyAtMs[t.id] &&
		deps.consumeBatteryCharge(GAME_CONFIG.chargedShotBatteryCost)
	) {
		isCharged = true;
		TowerState.chargedReadyAtMs[t.id] =
			deps.simNow + GAME_CONFIG.chargedShotCooldownMs;
	}
	const radius = (spec.arcHeight > 0 ? 6 : 4) * (isCharged ? 1.6 : 1);
	const sprite = deps.acquireProjectileSprite(
		t.x,
		t.y,
		radius,
		isCharged ? GAME_CONFIG.chargedProjectileColor : spec.projectileColor,
	);
	const pdx = targetX - t.x;
	const pdy = targetY - t.y;
	const totalDist = Math.sqrt(pdx * pdx + pdy * pdy);
	const eid = addEntity(deps.world);
	addComponent(deps.world, eid, Position);
	addComponent(deps.world, eid, ProjectileTag);
	addComponent(deps.world, eid, ProjectileStats);
	Position.x[eid] = t.x;
	Position.y[eid] = t.y;
	ProjectileStats.startX[eid] = t.x;
	ProjectileStats.startY[eid] = t.y;
	ProjectileStats.targetX[eid] = targetX;
	ProjectileStats.targetY[eid] = targetY;
	ProjectileStats.traveled[eid] = 0;
	ProjectileStats.totalDist[eid] = totalDist;
	ProjectileStats.speed[eid] = spec.projectileSpeed;
	ProjectileStats.arcHeight[eid] = spec.arcHeight;
	ProjectileStats.homing[eid] = spec.homing ? 1 : 0;
	ProjectileStats.enemyEid[eid] =
		spec.homing && enemyId !== null ? enemyId : -1;
	const baseDmg = towerDamage(t);
	ProjectileStats.damage[eid] = isCharged
		? baseDmg * GAME_CONFIG.chargedShotDamageMul
		: baseDmg;
	ProjectileStats.burnDps[eid] = towerBurnDps(t);
	ProjectileStats.burnMs[eid] = spec.burnMs;
	ProjectileStats.burnRadius[eid] = spec.burnRadius;
	ProjectileStats.splashRadius[eid] = isCharged
		? spec.splashRadius * GAME_CONFIG.chargedShotSplashMul
		: spec.splashRadius;
	ProjectileStats.slowMs[eid] = spec.slowMs;
	ProjectileStats.slowFactor[eid] = spec.slowFactor;
	ProjectileStats.damageType[eid] = spec.damageType;
	deps.projectileVisuals.set(eid, { sprite });
}
