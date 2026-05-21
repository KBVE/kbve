import {
	Position,
	ProjectileStats,
	type ProjectileVisual,
} from '../components';

export interface ProjectileStepCtx {
	enemyAlive: (eid: number) => boolean;
	getVisual: (eid: number) => ProjectileVisual | undefined;
	onHit: (eid: number, nowMs: number, hitX: number, hitY: number) => void;
	onDead: (eid: number) => void;
}

export function stepProjectile(
	ctx: ProjectileStepCtx,
	eid: number,
	dt: number,
	nowMs: number,
): void {
	const v = ctx.getVisual(eid);
	if (!v) {
		ctx.onDead(eid);
		return;
	}
	const speed = ProjectileStats.speed[eid];
	if (ProjectileStats.homing[eid] === 1) {
		const targetEid = ProjectileStats.enemyEid[eid];
		if (targetEid >= 0 && ctx.enemyAlive(targetEid)) {
			ProjectileStats.targetX[eid] = Position.x[targetEid];
			ProjectileStats.targetY[eid] = Position.y[targetEid];
		}
		const px = Position.x[eid];
		const py = Position.y[eid];
		const dx = ProjectileStats.targetX[eid] - px;
		const dy = ProjectileStats.targetY[eid] - py;
		const dist = Math.sqrt(dx * dx + dy * dy);
		const step = speed * dt;
		if (step >= dist) {
			ctx.onHit(eid, nowMs, px, py);
			ctx.onDead(eid);
		} else {
			Position.x[eid] = px + (dx / dist) * step;
			Position.y[eid] = py + (dy / dist) * step;
			v.sprite.setPosition(Position.x[eid], Position.y[eid]);
		}
		return;
	}
	ProjectileStats.traveled[eid] += speed * dt;
	const total = ProjectileStats.totalDist[eid];
	const tt =
		total > 0 ? Math.min(1, ProjectileStats.traveled[eid] / total) : 1;
	const sx = ProjectileStats.startX[eid];
	const sy = ProjectileStats.startY[eid];
	const tx = ProjectileStats.targetX[eid];
	const ty = ProjectileStats.targetY[eid];
	const baseX = sx + (tx - sx) * tt;
	const baseY = sy + (ty - sy) * tt;
	const arcOffset = -Math.sin(Math.PI * tt) * ProjectileStats.arcHeight[eid];
	Position.x[eid] = baseX;
	Position.y[eid] = baseY + arcOffset;
	v.sprite.setPosition(Position.x[eid], Position.y[eid]);
	if (tt >= 1) {
		ctx.onHit(eid, nowMs, tx, ty);
		ctx.onDead(eid);
	}
}
