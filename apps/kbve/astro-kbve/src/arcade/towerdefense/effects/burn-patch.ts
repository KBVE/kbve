import type Phaser from 'phaser';
import { addComponent, addEntity, query, type World } from 'bitecs';
import type { SideMap } from '@kbve/laser';
import {
	applyStatus,
	BurnPatchStats,
	BurnPatchTag,
	Position,
	STATUS_KIND,
	statusMagnitude,
	type BurnPatchVisual,
} from '../components';
import { COLORS } from '../config';

export interface BurnPatchDeps {
	world: World;
	burnPatchVisuals: SideMap<BurnPatchVisual>;
	burnPatchDeathRow: number[];
	removeEntityQueue: number[];
	acquireArc: (
		x: number,
		y: number,
		radius: number,
		color: number,
		alpha?: number,
	) => Phaser.GameObjects.Arc;
	releaseArc: (sprite: Phaser.GameObjects.Arc) => void;
	forEachEnemyInRange: (
		cx: number,
		cy: number,
		range: number,
		fn: (eid: number) => void,
	) => void;
	tweens: Phaser.Tweens.TweenManager;
}

const TICK_BURN_REFRESH_MS = 500;

export function spawnBurnPatch(
	deps: BurnPatchDeps,
	x: number,
	y: number,
	radius: number,
	dps: number,
	expiresAtMs: number,
): void {
	const sprite = deps.acquireArc(x, y, radius, COLORS.burnPatch, 0.25);
	sprite.setStrokeStyle(2, COLORS.burnPatch, 0.6);
	const eid = addEntity(deps.world);
	addComponent(deps.world, eid, Position);
	addComponent(deps.world, eid, BurnPatchTag);
	addComponent(deps.world, eid, BurnPatchStats);
	Position.x[eid] = x;
	Position.y[eid] = y;
	BurnPatchStats.radius[eid] = radius;
	BurnPatchStats.dps[eid] = dps;
	BurnPatchStats.expiresAtMs[eid] = expiresAtMs;
	deps.burnPatchVisuals.set(eid, { sprite });
}

export function spawnSplashFlash(
	deps: BurnPatchDeps,
	x: number,
	y: number,
	radius: number,
): void {
	const flash = deps.acquireArc(x, y, radius, 0xfbd38d, 0.45);
	deps.tweens.add({
		targets: flash,
		alpha: 0,
		scale: 1.2,
		duration: 220,
		onComplete: () => deps.releaseArc(flash),
	});
}

export function updateBurnPatches(deps: BurnPatchDeps, nowMs: number): void {
	deps.burnPatchDeathRow.length = 0;
	for (const eid of query(deps.world, [BurnPatchTag, Position])) {
		const expires = BurnPatchStats.expiresAtMs[eid];
		const v = deps.burnPatchVisuals.get(eid);
		if (nowMs >= expires) {
			deps.burnPatchDeathRow.push(eid);
			continue;
		}
		const x = Position.x[eid];
		const y = Position.y[eid];
		const radius = BurnPatchStats.radius[eid];
		const dps = BurnPatchStats.dps[eid];
		deps.forEachEnemyInRange(x, y, radius, (enemyEid) => {
			const currentDps = statusMagnitude(enemyEid, STATUS_KIND.burn);
			applyStatus(
				enemyEid,
				STATUS_KIND.burn,
				nowMs + TICK_BURN_REFRESH_MS,
				currentDps > dps ? currentDps : dps,
			);
		});
		if (v) {
			const remaining = (expires - nowMs) / 1000;
			v.sprite.setAlpha(0.1 + Math.min(0.25, remaining * 0.1));
		}
	}
	for (let i = 0; i < deps.burnPatchDeathRow.length; i++) {
		const eid = deps.burnPatchDeathRow[i];
		const v = deps.burnPatchVisuals.delete(eid);
		if (v) deps.releaseArc(v.sprite);
		deps.removeEntityQueue.push(eid);
	}
}
