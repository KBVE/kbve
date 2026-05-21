import type Phaser from 'phaser';
import { addComponent, addEntity, query, type World } from 'bitecs';
import type { SideMap } from '@kbve/laser';
import {
	applyStatus,
	DAMAGE_TYPE,
	Health,
	Position,
	STATUS_KIND,
	StunDroneStats,
	StunDroneTag,
} from '../components';
import type { CastleBuilding } from '../types';

export interface StunDroneDeps {
	scene: Phaser.Scene;
	world: World;
	enemyAlive: (eid: number) => boolean;
	stunDroneVisuals: SideMap<Phaser.GameObjects.Arc>;
	removeEntityQueue: number[];
	applyDamage: (
		targetEid: number,
		amount: number,
		type: number,
		flags: number,
	) => void;
	findWeakestEnemyInRange: (x: number, y: number, range: number) => number;
}

const REACQUIRE_RANGE = 400;
const HIT_DIST_SQ = 100;

export function spawnStunDrone(
	deps: StunDroneDeps,
	castle: CastleBuilding,
	targetEid: number,
): void {
	const eid = addEntity(deps.world);
	addComponent(deps.world, eid, Position);
	addComponent(deps.world, eid, StunDroneTag);
	addComponent(deps.world, eid, StunDroneStats);
	Position.x[eid] = castle.x;
	Position.y[eid] = castle.y;
	StunDroneStats.speed[eid] = castle.spec.droneSpeed;
	StunDroneStats.targetEid[eid] = targetEid;
	StunDroneStats.ownerEid[eid] = castle.id;
	StunDroneStats.stunMs[eid] = castle.spec.droneStunMs;
	StunDroneStats.damage[eid] = castle.spec.droneDamage;
	const sprite = deps.scene.add
		.circle(castle.x, castle.y, 4, castle.spec.droneColor)
		.setStrokeStyle(1, 0xffffff, 0.9);
	deps.stunDroneVisuals.set(eid, sprite);
}

export function killStunDrone(deps: StunDroneDeps, eid: number): void {
	const visual = deps.stunDroneVisuals.delete(eid);
	if (visual) visual.destroy();
	deps.removeEntityQueue.push(eid);
}

export function updateStunDrones(
	deps: StunDroneDeps,
	dt: number,
	nowMs: number,
): void {
	for (const eid of query(deps.world, [StunDroneTag])) {
		const visual = deps.stunDroneVisuals.get(eid);
		if (!visual) continue;
		const targetEid = StunDroneStats.targetEid[eid];
		const alive =
			targetEid > 0 &&
			deps.enemyAlive(targetEid) &&
			Health.hp[targetEid] > 0;
		if (!alive) {
			const newTarget = deps.findWeakestEnemyInRange(
				Position.x[eid],
				Position.y[eid],
				REACQUIRE_RANGE,
			);
			if (newTarget < 0) {
				killStunDrone(deps, eid);
				continue;
			}
			StunDroneStats.targetEid[eid] = newTarget;
		}
		const target = StunDroneStats.targetEid[eid];
		const tx = Position.x[target];
		const ty = Position.y[target];
		const dx = tx - Position.x[eid];
		const dy = ty - Position.y[eid];
		const distSq = dx * dx + dy * dy;
		if (distSq < HIT_DIST_SQ) {
			applyStatus(
				target,
				STATUS_KIND.stun,
				nowMs + StunDroneStats.stunMs[eid],
				1,
				StunDroneStats.stunMs[eid],
			);
			deps.applyDamage(
				target,
				StunDroneStats.damage[eid],
				DAMAGE_TYPE.energy,
				0,
			);
			killStunDrone(deps, eid);
			continue;
		}
		const dist = Math.sqrt(distSq);
		const step = StunDroneStats.speed[eid] * dt;
		const ratio = step >= dist ? 1 : step / dist;
		Position.x[eid] += dx * ratio;
		Position.y[eid] += dy * ratio;
		visual.setPosition(Position.x[eid], Position.y[eid]);
	}
}
