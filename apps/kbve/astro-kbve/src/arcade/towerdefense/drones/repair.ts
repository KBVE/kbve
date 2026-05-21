import type Phaser from 'phaser';
import { addComponent, addEntity, query, type World } from 'bitecs';
import type { SideMap } from '@kbve/laser';
import {
	Armor,
	BuildingState,
	DroneStats,
	DroneState,
	DroneTag,
	Health,
	Position,
	RepairState,
	type DroneVisual,
} from '../components';
import { COLORS, GAME_CONFIG } from '../config';
import { repairAmount, repairCooldownMs, repairRange } from '../stats';
import type { Building, RepairBuilding } from '../types';

export interface RepairDeps {
	world: World;
	frameRepairEids: ArrayLike<number>;
	frameBuildingEids: ArrayLike<number>;
	buildingByEid: SideMap<Building>;
	droneVisuals: SideMap<DroneVisual>;
	acquireArc: (
		x: number,
		y: number,
		radius: number,
		color: number,
		alpha?: number,
	) => Phaser.GameObjects.Arc;
	acquireLine: (
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		color: number,
		alpha?: number,
		width?: number,
	) => Phaser.GameObjects.Line;
	killDrone: (eid: number) => void;
}

export function findRepairTarget(
	deps: RepairDeps,
	station: RepairBuilding,
): Building | null {
	let best: Building | null = null;
	let bestRatio = 1;
	const range = repairRange(station);
	const rangeSq = range * range;
	const eids = deps.frameBuildingEids;
	for (let i = 0; i < eids.length; i++) {
		const beid = eids[i];
		const b = deps.buildingByEid.get(beid);
		if (!b || BuildingState.destroyed[b.id]) continue;
		if (b === station) continue;
		const hp = Health.hp[b.id];
		const maxHp = Health.maxHp[b.id];
		if (hp >= maxHp) continue;
		const dx = b.x - station.x;
		const dy = b.y - station.y;
		if (dx * dx + dy * dy > rangeSq) continue;
		const ratio = hp / maxHp;
		if (ratio < bestRatio) {
			bestRatio = ratio;
			best = b;
		}
	}
	return best;
}

export function spawnRepairDrone(
	deps: RepairDeps,
	station: RepairBuilding,
	target: Building,
): void {
	const sprite = deps.acquireArc(station.x, station.y, 5, COLORS.repairDrone);
	const beam = deps.acquireLine(
		station.x,
		station.y,
		target.x,
		target.y,
		COLORS.repairBeam,
		0.7,
		2,
	);
	const eid = addEntity(deps.world);
	addComponent(deps.world, eid, Position);
	addComponent(deps.world, eid, DroneTag);
	addComponent(deps.world, eid, DroneStats);
	Position.x[eid] = station.x;
	Position.y[eid] = station.y;
	DroneStats.speed[eid] = GAME_CONFIG.repairDroneSpeed;
	DroneStats.state[eid] = DroneState.Outbound;
	DroneStats.stationEid[eid] = station.id;
	DroneStats.targetEid[eid] = target.id;
	DroneStats.repairAmount[eid] = repairAmount(station);
	deps.droneVisuals.set(eid, { sprite, beam });
	RepairState.activeDroneEid[station.id] = eid;
}

export function updateRepair(deps: RepairDeps, dt: number): void {
	const dtMs = dt * 1000;
	const eids = deps.frameRepairEids;
	for (let i = 0; i < eids.length; i++) {
		const eid = eids[i];
		if (BuildingState.destroyed[eid]) continue;
		if (!BuildingState.online[eid]) continue;
		const b = deps.buildingByEid.get(eid);
		if (!b || b.kind !== 'repair') continue;
		const activeDrone = RepairState.activeDroneEid[eid];
		if (activeDrone >= 0 && deps.droneVisuals.has(activeDrone)) continue;
		RepairState.cooldownLeftMs[eid] -= dtMs;
		if (RepairState.cooldownLeftMs[eid] > 0) continue;
		const target = findRepairTarget(deps, b);
		if (!target) {
			RepairState.cooldownLeftMs[eid] = 0;
			continue;
		}
		RepairState.cooldownLeftMs[eid] = repairCooldownMs(b);
		spawnRepairDrone(deps, b, target);
	}

	const deathRow: number[] = [];
	for (const deid of query(deps.world, [DroneTag, Position, DroneStats])) {
		const v = deps.droneVisuals.get(deid);
		if (!v) continue;
		const tEid = DroneStats.targetEid[deid];
		if (BuildingState.destroyed[tEid]) {
			deathRow.push(deid);
			continue;
		}
		const destEid =
			DroneStats.state[deid] === DroneState.Outbound
				? tEid
				: DroneStats.stationEid[deid];
		const destX = Position.x[destEid];
		const destY = Position.y[destEid];
		const dx = destX - Position.x[deid];
		const dy = destY - Position.y[deid];
		const dist = Math.sqrt(dx * dx + dy * dy);
		const step = DroneStats.speed[deid] * dt;
		if (step >= dist) {
			Position.x[deid] = destX;
			Position.y[deid] = destY;
			if (DroneStats.state[deid] === DroneState.Outbound) {
				let heal = DroneStats.repairAmount[deid];
				const armorRoom = Armor.maxArmor[tEid] - Armor.armor[tEid];
				if (armorRoom > 0) {
					const addArmor = heal < armorRoom ? heal : armorRoom;
					Armor.armor[tEid] += addArmor;
					heal -= addArmor;
				}
				if (heal > 0) {
					Health.hp[tEid] = Math.min(
						Health.maxHp[tEid],
						Health.hp[tEid] + heal,
					);
				}
				DroneStats.state[deid] = DroneState.Returning;
			} else {
				deathRow.push(deid);
				continue;
			}
		} else {
			Position.x[deid] += (dx / dist) * step;
			Position.y[deid] += (dy / dist) * step;
		}
		v.sprite.setPosition(Position.x[deid], Position.y[deid]);
		if (DroneStats.state[deid] === DroneState.Outbound) {
			v.beam.setVisible(true);
			v.beam.setTo(
				Position.x[deid],
				Position.y[deid],
				Position.x[tEid],
				Position.y[tEid],
			);
		} else {
			v.beam.setVisible(false);
		}
	}
	for (const deid of deathRow) deps.killDrone(deid);
}
