import {
	ATTACK_TARGET_KIND,
	BuildingState,
	ENEMY_TYPE_INDEX,
	EnemyStats,
	Health,
	hasStatus,
	Position,
	SoldierStats,
	STATUS_KIND,
	statusExpiresAt,
} from '../components';
import { ENEMY_CATALOG } from '../config';
import type { SpatialGrid } from './spatial';

function isEnemyFlying(eid: number): boolean {
	const idx = EnemyStats.typeIndex[eid];
	const id = ENEMY_TYPE_INDEX[idx];
	return id ? Boolean(ENEMY_CATALOG[id].flying) : false;
}

export type EidList = ArrayLike<number>;

export interface TargetingCtx {
	frameBuildingEids: EidList;
	frameSoldierEids: EidList;
	frameEnemyEids: EidList;
	enemyAlive: (eid: number) => boolean;
	soldierAlive: (eid: number) => boolean;
	archerTargetClaims: Set<number>;
	soldierGrid?: SpatialGrid;
	buildingGrid?: SpatialGrid;
}

export function findAttackTargetFor(ctx: TargetingCtx, eid: number): boolean {
	const range = EnemyStats.attackRange[eid];
	if (range <= 0) return false;
	const ex = Position.x[eid];
	const ey = Position.y[eid];
	let bestEid = -1;
	let bestKind: number = ATTACK_TARGET_KIND.none;
	let bestDist2 = range * range;
	const flying = isEnemyFlying(eid);
	if (ctx.buildingGrid) {
		ctx.buildingGrid.forEachInRange(
			ex,
			ey,
			range,
			(beid) => !BuildingState.destroyed[beid],
			(beid) => {
				const dx = Position.x[beid] - ex;
				const dy = Position.y[beid] - ey;
				const d2 = dx * dx + dy * dy;
				if (d2 <= bestDist2) {
					bestDist2 = d2;
					bestEid = beid;
					bestKind = ATTACK_TARGET_KIND.building;
				}
			},
		);
	} else {
		const buildings = ctx.frameBuildingEids;
		for (let i = 0; i < buildings.length; i++) {
			const beid = buildings[i];
			if (BuildingState.destroyed[beid]) continue;
			const dx = Position.x[beid] - ex;
			const dy = Position.y[beid] - ey;
			const d2 = dx * dx + dy * dy;
			if (d2 <= bestDist2) {
				bestDist2 = d2;
				bestEid = beid;
				bestKind = ATTACK_TARGET_KIND.building;
			}
		}
	}
	if (flying) {
		EnemyStats.targetEid[eid] = bestEid;
		EnemyStats.targetKind[eid] = bestKind;
		return bestKind !== ATTACK_TARGET_KIND.none;
	}
	if (ctx.soldierGrid) {
		ctx.soldierGrid.forEachInRange(
			ex,
			ey,
			range,
			ctx.soldierAlive,
			(seid) => {
				const dx = Position.x[seid] - ex;
				const dy = Position.y[seid] - ey;
				const d2 = dx * dx + dy * dy;
				if (d2 <= bestDist2) {
					bestDist2 = d2;
					bestEid = seid;
					bestKind = ATTACK_TARGET_KIND.soldier;
				}
			},
		);
	} else {
		const soldiers = ctx.frameSoldierEids;
		for (let i = 0; i < soldiers.length; i++) {
			const seid = soldiers[i];
			if (!ctx.soldierAlive(seid)) continue;
			const dx = Position.x[seid] - ex;
			const dy = Position.y[seid] - ey;
			const d2 = dx * dx + dy * dy;
			if (d2 <= bestDist2) {
				bestDist2 = d2;
				bestEid = seid;
				bestKind = ATTACK_TARGET_KIND.soldier;
			}
		}
	}
	EnemyStats.targetEid[eid] = bestEid;
	EnemyStats.targetKind[eid] = bestKind;
	return bestKind !== ATTACK_TARGET_KIND.none;
}

export function findEnemyForSoldier(ctx: TargetingCtx, seid: number): number {
	const sx = Position.x[seid];
	const sy = Position.y[seid];
	let best = -1;
	let bestDist2 = Infinity;
	const enemies = ctx.frameEnemyEids;
	for (let i = 0; i < enemies.length; i++) {
		const eeid = enemies[i];
		if (!ctx.enemyAlive(eeid)) continue;
		if (isEnemyFlying(eeid)) continue;
		const dx = Position.x[eeid] - sx;
		const dy = Position.y[eeid] - sy;
		const d2 = dx * dx + dy * dy;
		if (d2 < bestDist2) {
			bestDist2 = d2;
			best = eeid;
		}
	}
	return best;
}

export function findEnemyForArcher(
	ctx: TargetingCtx,
	seid: number,
	nowMs: number,
): number {
	const sx = Position.x[seid];
	const sy = Position.y[seid];
	const range = SoldierStats.attackRange[seid];
	const r2 = range * range * 1.4;
	let bestFresh = -1;
	let bestFreshD2 = Infinity;
	let bestStale = -1;
	let bestStaleExpiry = Infinity;
	let bestFallback = -1;
	let bestFallbackD2 = Infinity;
	const enemies = ctx.frameEnemyEids;
	const claims = ctx.archerTargetClaims;
	for (let i = 0; i < enemies.length; i++) {
		const eeid = enemies[i];
		if (!ctx.enemyAlive(eeid)) continue;
		const dx = Position.x[eeid] - sx;
		const dy = Position.y[eeid] - sy;
		const d2 = dx * dx + dy * dy;
		if (d2 < bestFallbackD2) {
			bestFallbackD2 = d2;
			bestFallback = eeid;
		}
		if (d2 > r2) continue;
		const slowed = hasStatus(eeid, STATUS_KIND.slow, nowMs);
		const claimed = claims.has(eeid);
		if (!slowed && !claimed) {
			if (d2 < bestFreshD2) {
				bestFreshD2 = d2;
				bestFresh = eeid;
			}
		} else if (slowed && !claimed) {
			const exp = statusExpiresAt(eeid, STATUS_KIND.slow);
			if (exp < bestStaleExpiry) {
				bestStaleExpiry = exp;
				bestStale = eeid;
			}
		}
	}
	if (bestFresh >= 0) return bestFresh;
	if (bestStale >= 0) return bestStale;
	return bestFallback;
}

export function findWeakestEnemyInRange(
	ctx: TargetingCtx,
	x: number,
	y: number,
	range: number,
): number {
	let best = -1;
	let bestHp = Infinity;
	const r2 = range * range;
	const enemies = ctx.frameEnemyEids;
	for (let i = 0; i < enemies.length; i++) {
		const eeid = enemies[i];
		if (!ctx.enemyAlive(eeid)) continue;
		const ex = Position.x[eeid];
		const ey = Position.y[eeid];
		const dx = ex - x;
		const dy = ey - y;
		if (dx * dx + dy * dy > r2) continue;
		const hp = Health.hp[eeid];
		if (hp < bestHp) {
			bestHp = hp;
			best = eeid;
		}
	}
	return best;
}
