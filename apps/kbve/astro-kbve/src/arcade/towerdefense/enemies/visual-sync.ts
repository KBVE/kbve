import {
	ATTACK_TARGET_KIND,
	EnemyStats,
	Health,
	hasStatus,
	Position,
	STATUS_KIND,
	statusExpiresAt,
	statusExtra,
	type EnemyVisual,
} from '../components';
import { COLORS, TILE } from '../config';

function lerpHpColor(ratio: number): number {
	const t = Math.max(0, Math.min(1, ratio));
	let r: number;
	let g: number;
	let b: number;
	if (t > 0.5) {
		const k = (t - 0.5) * 2;
		r = Math.round(246 + (72 - 246) * k);
		g = Math.round(173 + (187 - 173) * k);
		b = Math.round(85 + (120 - 85) * k);
	} else {
		const k = t * 2;
		r = Math.round(252 + (246 - 252) * k);
		g = Math.round(129 + (173 - 129) * k);
		b = Math.round(129 + (85 - 129) * k);
	}
	return (r << 16) | (g << 8) | b;
}
void COLORS;

const SLOW_COLOR = COLORS.statusSlow;
const BURN_COLOR = COLORS.statusBurn;
const STUN_COLOR = 0xf6e05e;
const HP_BAR_Y_OFFSET = TILE * 0.5;

function applyWalkAndFacing(
	v: EnemyVisual,
	eid: number,
	x: number,
	y: number,
	nowMs: number,
): void {
	const dx = x - v.lastX;
	const dy = y - v.lastY;
	const movedSq = dx * dx + dy * dy;
	const moving = movedSq > 0.0025;
	let aggroDx = 0;
	const tk = EnemyStats.targetKind[eid];
	if (tk !== ATTACK_TARGET_KIND.none) {
		const tEid = EnemyStats.targetEid[eid];
		if (tEid >= 0) aggroDx = Position.x[tEid] - x;
	}
	const facingDx = Math.abs(aggroDx) > 0.5 ? aggroDx : dx;
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
		const idleBob = Math.sin(nowMs * 0.004 + eid * 0.7) * 0.6;
		v.sprite.setPosition(x, y + idleBob);
	}
	v.lastX = x;
	v.lastY = y;
}

function applyHpBar(v: EnemyVisual, eid: number, x: number, y: number): void {
	const hp = Health.hp[eid];
	const maxHp = Health.maxHp[eid];
	if (hp < maxHp) {
		v.hpBarBg.setVisible(true);
		v.hpBar.setVisible(true);
		v.hpBarBg.setPosition(x, y - HP_BAR_Y_OFFSET);
		v.hpBar.setPosition(x - v.barWidth / 2, y - HP_BAR_Y_OFFSET);
		const ratio = maxHp > 0 ? hp / maxHp : 0;
		v.hpBar.displayWidth = Math.max(0, ratio) * v.barWidth;
		v.hpBar.setFillStyle(lerpHpColor(ratio));
	} else {
		v.hpBarBg.setVisible(false);
		v.hpBar.setVisible(false);
	}
}

function applyStatusRing(
	v: EnemyVisual,
	eid: number,
	x: number,
	y: number,
	nowMs: number,
): void {
	const slowed = hasStatus(eid, STATUS_KIND.slow, nowMs);
	const burning = hasStatus(eid, STATUS_KIND.burn, nowMs);
	const stunned = hasStatus(eid, STATUS_KIND.stun, nowMs);
	const anyStatus = slowed || burning || stunned;
	if (!anyStatus && !v.statusVisible) return;
	v.statusRing.clear();
	if (anyStatus) {
		v.statusRing.setVisible(true);
		v.statusVisible = true;
		if (slowed) {
			const dur = statusExtra(eid, STATUS_KIND.slow);
			const slowRatio =
				dur > 0
					? Math.max(
							0,
							Math.min(
								1,
								(statusExpiresAt(eid, STATUS_KIND.slow) -
									nowMs) /
									dur,
							),
						)
					: 0;
			v.statusRing.lineStyle(3, SLOW_COLOR, 0.85);
			v.statusRing.beginPath();
			v.statusRing.arc(
				x,
				y,
				v.ringRadius,
				-Math.PI / 2,
				-Math.PI / 2 + Math.PI * 2 * slowRatio,
			);
			v.statusRing.strokePath();
		}
		if (burning) {
			v.statusRing.lineStyle(2, BURN_COLOR, 0.8);
			v.statusRing.strokeCircle(x, y, v.ringRadius + (slowed ? 4 : 0));
		}
		if (stunned) {
			v.statusRing.lineStyle(2, STUN_COLOR, 0.95);
			v.statusRing.strokeCircle(
				x,
				y,
				v.ringRadius + (slowed ? 8 : burning ? 4 : 0),
			);
		}
	} else {
		v.statusRing.setVisible(false);
		v.statusVisible = false;
	}
}

export function syncEnemyVisual(
	v: EnemyVisual,
	eid: number,
	nowMs: number,
): void {
	const x = Position.x[eid];
	const y = Position.y[eid];
	applyWalkAndFacing(v, eid, x, y, nowMs);
	applyHpBar(v, eid, x, y);
	applyStatusRing(v, eid, x, y, nowMs);
}
