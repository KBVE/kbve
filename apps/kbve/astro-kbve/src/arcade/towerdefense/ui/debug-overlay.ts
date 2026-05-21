import type Phaser from 'phaser';
import {
	ATTACK_TARGET_KIND,
	BuildingState,
	EnemyStats,
	Position,
} from '../components';
import { BASE_HEIGHT, BASE_WIDTH, COLS, ROWS, TILE } from '../config';

const GRID_CELL = 80;

export interface DebugOverlayDeps {
	scene: Phaser.Scene;
	frameEnemyEids: ArrayLike<number>;
	frameTowerEids: ArrayLike<number>;
	frameBuildingEids: ArrayLike<number>;
}

export class DebugOverlay {
	private g: Phaser.GameObjects.Graphics;
	private enabled = false;

	constructor(private scene: Phaser.Scene) {
		this.g = scene.add.graphics();
		this.g.setDepth(500);
		this.g.setVisible(false);
	}

	toggle(): void {
		this.enabled = !this.enabled;
		this.g.setVisible(this.enabled);
		if (!this.enabled) this.g.clear();
	}

	isOn(): boolean {
		return this.enabled;
	}

	render(deps: DebugOverlayDeps): void {
		if (!this.enabled) return;
		const g = this.g;
		g.clear();
		g.lineStyle(1, 0x4299e1, 0.18);
		for (let c = 0; c <= Math.ceil(BASE_WIDTH / GRID_CELL); c++) {
			g.lineBetween(c * GRID_CELL, 0, c * GRID_CELL, BASE_HEIGHT);
		}
		for (let r = 0; r <= Math.ceil(BASE_HEIGHT / GRID_CELL); r++) {
			g.lineBetween(0, r * GRID_CELL, BASE_WIDTH, r * GRID_CELL);
		}
		g.lineStyle(1, 0xfc8181, 0.6);
		const eids = deps.frameEnemyEids;
		for (let i = 0; i < eids.length; i++) {
			const eid = eids[i];
			const ex = Position.x[eid];
			const ey = Position.y[eid];
			g.fillStyle(0xfc8181, 0.6);
			g.fillCircle(ex, ey, 3);
			const tk = EnemyStats.targetKind[eid];
			if (tk !== ATTACK_TARGET_KIND.none) {
				const tid = EnemyStats.targetEid[eid];
				if (tid >= 0) {
					g.lineBetween(ex, ey, Position.x[tid], Position.y[tid]);
				}
			}
		}
		g.lineStyle(1, 0x90cdf4, 0.5);
		const tids = deps.frameTowerEids;
		for (let i = 0; i < tids.length; i++) {
			const eid = tids[i];
			if (BuildingState.destroyed[eid]) continue;
			g.strokeCircle(Position.x[eid], Position.y[eid], TILE * 0.6);
		}
		void COLS;
		void ROWS;
	}
}
