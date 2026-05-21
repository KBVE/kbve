import {
	Health,
	Position,
	SoldierStats,
	type SoldierVisual,
} from '../components';
import { TILE } from '../config';

const HP_BAR_WIDTH = TILE * 0.5;
const HP_BAR_Y_OFFSET = TILE * 0.32;

export interface SoldierSyncCtx {
	enemyAlive: (eid: number) => boolean;
}

export function syncSoldierVisual(
	ctx: SoldierSyncCtx,
	v: SoldierVisual,
	seid: number,
	nowMs: number,
): void {
	const x = Position.x[seid];
	const y = Position.y[seid];
	const dx = x - v.lastX;
	const dy = y - v.lastY;
	const movedSq = dx * dx + dy * dy;
	const moving = movedSq > 0.0025;
	let facingDx = dx;
	const targetEid = SoldierStats.targetEnemyEid[seid];
	if (targetEid > 0 && ctx.enemyAlive(targetEid)) {
		facingDx = Position.x[targetEid] - x;
	}
	if (Math.abs(facingDx) > 0.05) {
		const desired = facingDx < 0 ? -1 : 1;
		if (desired !== v.facing) {
			v.facing = desired;
			v.sprite.setFlipX(desired < 0);
		}
	}
	if (moving) {
		v.walkPhase += Math.sqrt(movedSq) * 0.18;
		const bob = Math.sin(v.walkPhase) * 1.6;
		v.sprite.setPosition(x, y + bob);
	} else {
		const idleBob = Math.sin(nowMs * 0.004 + seid * 0.7) * 0.6;
		v.sprite.setPosition(x, y + idleBob);
	}
	v.lastX = x;
	v.lastY = y;
	const hp = Health.hp[seid];
	const maxHp = Health.maxHp[seid];
	if (hp < maxHp) {
		v.hpBarBg.setVisible(true);
		v.hpBar.setVisible(true);
		v.hpBarBg.setPosition(x, y - HP_BAR_Y_OFFSET);
		v.hpBar.setPosition(x - HP_BAR_WIDTH / 2, y - HP_BAR_Y_OFFSET);
		v.hpBar.displayWidth = (hp / maxHp) * HP_BAR_WIDTH;
	} else {
		v.hpBarBg.setVisible(false);
		v.hpBar.setVisible(false);
	}
}
