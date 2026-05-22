import type Phaser from 'phaser';
import {
	Armor,
	ENEMY_TYPE_INDEX,
	EnemyStats,
	Health,
	Movement,
	Position,
} from '../components';
import { BASE_HEIGHT, TILE } from '../config';
import { enemyHoverAtom } from '../td-hud-store';

export interface HoverInfoDeps {
	scene: Phaser.Scene;
	hudHeight: number;
	paletteHeight: number;
	frameEnemyEids: ArrayLike<number>;
	enemyAlive: (eid: number) => boolean;
}

export function updateEnemyHover(deps: HoverInfoDeps): void {
	const pointer = deps.scene.input.activePointer;
	const px = pointer.worldX;
	const py = pointer.worldY;
	if (
		py < deps.hudHeight ||
		py > BASE_HEIGHT - deps.paletteHeight ||
		pointer.isDown
	) {
		if (enemyHoverAtom.get() !== null) enemyHoverAtom.set(null);
		return;
	}
	let bestEid = -1;
	let bestDist2 = TILE * TILE * 0.5;
	const eids = deps.frameEnemyEids;
	for (let i = 0; i < eids.length; i++) {
		const eid = eids[i];
		if (!deps.enemyAlive(eid)) continue;
		const dx = Position.x[eid] - px;
		const dy = Position.y[eid] - py;
		const d2 = dx * dx + dy * dy;
		if (d2 < bestDist2) {
			bestDist2 = d2;
			bestEid = eid;
		}
	}
	if (bestEid < 0) {
		if (enemyHoverAtom.get() !== null) enemyHoverAtom.set(null);
		return;
	}
	const typeIndex = EnemyStats.typeIndex[bestEid];
	const typeName = ENEMY_TYPE_INDEX[typeIndex] ?? 'unknown';
	const speed = Movement.speed[bestEid];
	const baseSpeed = Movement.baseSpeed[bestEid];
	const hp = Health.hp[bestEid];
	const maxHp = Health.maxHp[bestEid];
	const armor = Armor.armor[bestEid];
	const maxArmor = Armor.maxArmor[bestEid];
	const immobile = baseSpeed > 0 && speed <= 0;
	const dead = hp <= 0;
	const cam = deps.scene.cameras.main;
	const screenX = (px - cam.worldView.x) * cam.zoom;
	const screenY = (py - cam.worldView.y) * cam.zoom;
	enemyHoverAtom.set({
		eid: bestEid,
		hp,
		maxHp,
		armor,
		maxArmor,
		speed,
		baseSpeed,
		immobile,
		dead,
		typeName,
		screenX,
		screenY,
	});
}
