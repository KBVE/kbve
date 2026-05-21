import type Phaser from 'phaser';
import { addComponent, addEntity, type World } from 'bitecs';
import {
	Position,
	SoldierStats,
	SoldierTag,
	SOLDIER_KIND,
	type SoldierVisual,
} from '../components';
import type { SideMap } from '@kbve/laser';
import { GAME_CONFIG, TILE } from '../config';
import type { ArmouryBuilding, CastleBuilding } from '../types';
import { armourySoldierDamage, armourySoldierHp } from '../stats';
import { createUnitVisual, type UnitVisualDeps } from './visual';
import { attachSoldierIdleAnim } from './idle-anim';

export interface SpawnUnitDeps {
	scene: Phaser.Scene;
	world: World;
	unitVisuals: UnitVisualDeps;
	soldierVisuals: SideMap<SoldierVisual>;
	addDamageable: (
		eid: number,
		hp: number,
		armor: number,
		defense: number,
	) => void;
}

function attachVisual(
	deps: SpawnUnitDeps,
	eid: number,
	visual: SoldierVisual,
): void {
	attachSoldierIdleAnim(deps.scene, eid, visual);
	deps.soldierVisuals.set(eid, visual);
}

function initSoldierEntity(deps: SpawnUnitDeps, x: number, y: number): number {
	const eid = addEntity(deps.world);
	addComponent(deps.world, eid, Position);
	addComponent(deps.world, eid, SoldierTag);
	addComponent(deps.world, eid, SoldierStats);
	Position.x[eid] = x;
	Position.y[eid] = y;
	SoldierStats.lastAttackAtMs[eid] = 0;
	SoldierStats.targetEnemyEid[eid] = 0;
	return eid;
}

export function spawnArmourySoldier(
	deps: SpawnUnitDeps,
	armoury: ArmouryBuilding,
): void {
	const eid = initSoldierEntity(deps, armoury.x, armoury.y);
	deps.addDamageable(eid, armourySoldierHp(armoury), 0, 0);
	SoldierStats.speed[eid] = armoury.spec.soldierSpeed;
	SoldierStats.attackDamage[eid] = armourySoldierDamage(armoury);
	SoldierStats.attackRateMs[eid] = armoury.spec.soldierAttackRateMs;
	SoldierStats.attackRange[eid] = armoury.spec.soldierAttackRange;
	SoldierStats.armouryEid[eid] = armoury.id;
	SoldierStats.expiresAtWave[eid] = -1;
	SoldierStats.unitKind[eid] = SOLDIER_KIND.melee;
	const visual = createUnitVisual(deps.unitVisuals, {
		x: armoury.x,
		y: armoury.y,
		variant: 'soldier_melee',
		displaySize: TILE * 0.55,
	});
	attachVisual(deps, eid, visual);
}

export function spawnArmouryArcher(
	deps: SpawnUnitDeps,
	armoury: ArmouryBuilding,
): void {
	const eid = initSoldierEntity(deps, armoury.x, armoury.y);
	const hp = Math.floor(
		armourySoldierHp(armoury) * GAME_CONFIG.archerHpMultiplier,
	);
	deps.addDamageable(eid, hp, 0, 0);
	SoldierStats.speed[eid] = GAME_CONFIG.archerSpeed;
	SoldierStats.attackDamage[eid] = GAME_CONFIG.archerDamage;
	SoldierStats.attackRateMs[eid] = GAME_CONFIG.archerAttackRateMs;
	SoldierStats.attackRange[eid] =
		armoury.spec.soldierAttackRange *
		GAME_CONFIG.archerAttackRangeMultiplier;
	SoldierStats.armouryEid[eid] = armoury.id;
	SoldierStats.expiresAtWave[eid] = -1;
	SoldierStats.unitKind[eid] = SOLDIER_KIND.archer;
	const visual = createUnitVisual(deps.unitVisuals, {
		x: armoury.x,
		y: armoury.y,
		variant: 'soldier_archer',
		displaySize: TILE * 0.55,
	});
	attachVisual(deps, eid, visual);
}

export function spawnCastleUnit(
	deps: SpawnUnitDeps,
	castle: CastleBuilding,
): void {
	const eid = initSoldierEntity(deps, castle.x, castle.y);
	deps.addDamageable(eid, castle.spec.unitHp, 0, 0);
	SoldierStats.speed[eid] = castle.spec.unitSpeed;
	SoldierStats.attackDamage[eid] = castle.spec.unitDamage;
	SoldierStats.attackRateMs[eid] = castle.spec.unitAttackRateMs;
	SoldierStats.attackRange[eid] = castle.spec.unitAttackRange;
	SoldierStats.armouryEid[eid] = castle.id;
	SoldierStats.expiresAtWave[eid] = -1;
	SoldierStats.unitKind[eid] = SOLDIER_KIND.melee;
	const visual = createUnitVisual(deps.unitVisuals, {
		x: castle.x,
		y: castle.y,
		variant: 'castle_melee',
		displaySize: TILE * 0.6,
	});
	attachVisual(deps, eid, visual);
}

export function spawnAllySoldier(
	deps: SpawnUnitDeps,
	x: number,
	y: number,
	expiresAtWave: number,
	asArcher: boolean,
): void {
	const eid = initSoldierEntity(deps, x, y);
	const hp = asArcher
		? Math.floor(GAME_CONFIG.allyHp * GAME_CONFIG.archerHpMultiplier)
		: GAME_CONFIG.allyHp;
	deps.addDamageable(eid, hp, 0, 0);
	SoldierStats.speed[eid] = asArcher
		? GAME_CONFIG.archerSpeed
		: GAME_CONFIG.allySpeed;
	SoldierStats.attackDamage[eid] = asArcher
		? GAME_CONFIG.archerDamage
		: GAME_CONFIG.allyDamage;
	SoldierStats.attackRateMs[eid] = asArcher
		? GAME_CONFIG.archerAttackRateMs
		: GAME_CONFIG.allyAttackRateMs;
	SoldierStats.attackRange[eid] = asArcher
		? GAME_CONFIG.allyAttackRange * GAME_CONFIG.archerAttackRangeMultiplier
		: GAME_CONFIG.allyAttackRange;
	SoldierStats.armouryEid[eid] = -1;
	SoldierStats.expiresAtWave[eid] = expiresAtWave;
	SoldierStats.unitKind[eid] = asArcher
		? SOLDIER_KIND.archer
		: SOLDIER_KIND.melee;
	const visual = createUnitVisual(deps.unitVisuals, {
		x,
		y,
		variant: asArcher ? 'ally_archer' : 'ally_melee',
		displaySize: TILE * 0.55,
	});
	attachVisual(deps, eid, visual);
}
