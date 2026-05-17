import Phaser from 'phaser';
import {
	BASE_HEIGHT,
	BASE_WIDTH,
	BATTERY_CATALOG,
	COLORS,
	COLS,
	GAME_CONFIG,
	GENERATOR_CATALOG,
	HUD_ROWS_TOP,
	PALETTE_ORDER,
	REPAIR_CATALOG,
	ROWS,
	TILE,
	TOWER_CATALOG,
	WIRE_CATALOG,
	specFor,
	type BatterySpec,
	type BuildId,
	type GeneratorSpec,
	type RepairSpec,
	type TowerSpec,
	type WireSpec,
} from './config';
import {
	generatePath,
	type GeneratedPath,
	type Waypoint,
} from './path-generator';
import { applyPowerTick, buildComponents } from './power';
import { planStarterKit } from './starter-kit';
import type {
	BaseBuilding,
	BatteryBuilding,
	BurnPatch,
	Building,
	Enemy,
	GeneratorBuilding,
	Projectile,
	RepairBuilding,
	RepairDrone,
	TowerBuilding,
	WireBuilding,
} from './types';

interface PaletteButton {
	id: BuildId;
	rect: Phaser.GameObjects.Rectangle;
	icon: Phaser.GameObjects.Rectangle;
	label: Phaser.GameObjects.Text;
	cost: Phaser.GameObjects.Text;
	hotkey: Phaser.GameObjects.Text;
}

const HUD_HEIGHT = TILE * HUD_ROWS_TOP;
const PALETTE_HEIGHT = TILE * 2;

export class TowerDefenseScene extends Phaser.Scene {
	private path!: GeneratedPath;
	private enemies: Enemy[] = [];
	private buildings: Building[] = [];
	private projectiles: Projectile[] = [];
	private burnPatches: BurnPatch[] = [];
	private drones: RepairDrone[] = [];
	private nextEntityId = 1;

	private gold = GAME_CONFIG.startingGold;
	private lives = GAME_CONFIG.startingLives;
	private wave = 0;
	private enemiesToSpawn = 0;
	private spawnAccumulatorMs = 0;
	private interWaveDelayMs = 0;
	private isGameOver = false;

	private hudGoldVal!: Phaser.GameObjects.Text;
	private hudLivesVal!: Phaser.GameObjects.Text;
	private hudWaveVal!: Phaser.GameObjects.Text;
	private hudEnemiesVal!: Phaser.GameObjects.Text;
	private hudPowerVal!: Phaser.GameObjects.Text;
	private hudBatteryVal!: Phaser.GameObjects.Text;
	private hudTimerVal!: Phaser.GameObjects.Text;
	private hudTimerLabel!: Phaser.GameObjects.Text;
	private gameOverText?: Phaser.GameObjects.Text;

	private placementPreview!: Phaser.GameObjects.Rectangle;
	private placementRange!: Phaser.GameObjects.Arc;
	private selection: BuildId = 'basic';
	private paletteButtons: PaletteButton[] = [];

	private cachedPower = {
		supply: 0,
		demand: 0,
		batteryCharge: 0,
		batteryCapacity: 0,
	};
	private powerRefreshAccumulatorMs = 0;

	constructor() {
		super({ key: 'TowerDefenseScene' });
	}

	create(): void {
		this.path = generatePath();
		this.cameras.main.setBackgroundColor(COLORS.background);
		this.drawGrass();
		this.drawGridLines();
		this.drawPath();
		this.buildHud();
		this.buildPalette();
		this.buildPlacementPreview();
		this.placeStarterKit();
		this.recomputePower(0);
		this.refreshHud();

		this.input.on('pointermove', this.onPointerMove, this);
		this.input.on('pointerdown', this.onPointerDown, this);

		const kb = this.input.keyboard;
		if (kb) {
			kb.on('keydown-R', () => {
				if (this.isGameOver) this.scene.restart();
			});
			kb.on('keydown-N', () => this.scene.restart());
			const digitCodes = [
				Phaser.Input.Keyboard.KeyCodes.ONE,
				Phaser.Input.Keyboard.KeyCodes.TWO,
				Phaser.Input.Keyboard.KeyCodes.THREE,
				Phaser.Input.Keyboard.KeyCodes.FOUR,
				Phaser.Input.Keyboard.KeyCodes.FIVE,
				Phaser.Input.Keyboard.KeyCodes.SIX,
				Phaser.Input.Keyboard.KeyCodes.SEVEN,
				Phaser.Input.Keyboard.KeyCodes.EIGHT,
				Phaser.Input.Keyboard.KeyCodes.NINE,
				Phaser.Input.Keyboard.KeyCodes.ZERO,
			];
			for (
				let i = 0;
				i < PALETTE_ORDER.length && i < digitCodes.length;
				i++
			) {
				const id = PALETTE_ORDER[i];
				const key = kb.addKey(digitCodes[i]);
				key.on('down', () => this.selectBuild(id));
			}
		}

		this.interWaveDelayMs = GAME_CONFIG.waveDelayMs;
		this.refreshPaletteHighlight();
	}

	private drawGrass(): void {
		this.add
			.rectangle(
				BASE_WIDTH / 2,
				BASE_HEIGHT / 2,
				BASE_WIDTH,
				BASE_HEIGHT,
				COLORS.grass,
			)
			.setOrigin(0.5);
	}

	private drawGridLines(): void {
		const g = this.add.graphics();
		g.lineStyle(1, COLORS.gridLine, 0.5);
		for (let c = 1; c < COLS; c++) {
			g.lineBetween(c * TILE, 0, c * TILE, BASE_HEIGHT);
		}
		for (let r = 1; r < ROWS; r++) {
			g.lineBetween(0, r * TILE, BASE_WIDTH, r * TILE);
		}
	}

	private drawPath(): void {
		const w = this.path.waypoints;
		const fill = this.add.graphics();
		fill.lineStyle(TILE - 2, COLORS.pathFill, 1);
		fill.beginPath();
		fill.moveTo(w[0].x, w[0].y);
		for (let i = 1; i < w.length; i++) fill.lineTo(w[i].x, w[i].y);
		fill.strokePath();
		const border = this.add.graphics();
		border.lineStyle(2, COLORS.pathBorder, 0.8);
		border.beginPath();
		border.moveTo(w[0].x, w[0].y);
		for (let i = 1; i < w.length; i++) border.lineTo(w[i].x, w[i].y);
		border.strokePath();
	}

	private buildHud(): void {
		this.add
			.rectangle(
				BASE_WIDTH / 2,
				HUD_HEIGHT / 2,
				BASE_WIDTH,
				HUD_HEIGHT,
				COLORS.hudPanel,
				0.92,
			)
			.setStrokeStyle(2, COLORS.hudPanelBorder);

		const panelTexts: Array<{
			labelX: number;
			label: string;
			color: string;
			valueColor: string;
			out: (
				label: Phaser.GameObjects.Text,
				value: Phaser.GameObjects.Text,
			) => void;
		}> = [
			{
				labelX: 16,
				label: 'GOLD',
				color: COLORS.hudDim,
				valueColor: COLORS.goldText,
				out: (_l, v) => (this.hudGoldVal = v),
			},
			{
				labelX: 160,
				label: 'LIVES',
				color: COLORS.hudDim,
				valueColor: COLORS.livesText,
				out: (_l, v) => (this.hudLivesVal = v),
			},
			{
				labelX: 300,
				label: 'WAVE',
				color: COLORS.hudDim,
				valueColor: COLORS.waveText,
				out: (_l, v) => (this.hudWaveVal = v),
			},
			{
				labelX: 440,
				label: 'ENEMIES',
				color: COLORS.hudDim,
				valueColor: COLORS.hudText,
				out: (_l, v) => (this.hudEnemiesVal = v),
			},
			{
				labelX: 600,
				label: 'POWER',
				color: COLORS.hudDim,
				valueColor: COLORS.powerOk,
				out: (_l, v) => (this.hudPowerVal = v),
			},
			{
				labelX: 800,
				label: 'BATTERY',
				color: COLORS.hudDim,
				valueColor: COLORS.batteryFull,
				out: (_l, v) => (this.hudBatteryVal = v),
			},
		];

		for (const p of panelTexts) {
			this.add.text(p.labelX, 8, p.label, {
				fontFamily: 'monospace',
				fontSize: '11px',
				color: p.color,
			});
			const v = this.add.text(p.labelX, 24, '—', {
				fontFamily: 'monospace',
				fontSize: '20px',
				color: p.valueColor,
				fontStyle: 'bold',
			});
			p.out(this.add.text(0, 0, ''), v);
		}

		this.hudTimerLabel = this.add.text(BASE_WIDTH - 16, 8, 'NEXT WAVE', {
			fontFamily: 'monospace',
			fontSize: '11px',
			color: COLORS.hudDim,
		});
		this.hudTimerLabel.setOrigin(1, 0);
		this.hudTimerVal = this.add.text(BASE_WIDTH - 16, 24, '—', {
			fontFamily: 'monospace',
			fontSize: '20px',
			color: COLORS.hudText,
			fontStyle: 'bold',
		});
		this.hudTimerVal.setOrigin(1, 0);
	}

	private buildPlacementPreview(): void {
		this.placementRange = this.add
			.circle(0, 0, 0, 0xffffff, 0.12)
			.setStrokeStyle(1, 0xffffff, 0.5)
			.setVisible(false);
		this.placementPreview = this.add
			.rectangle(0, 0, TILE * 0.8, TILE * 0.8, COLORS.previewValid, 0.6)
			.setVisible(false);
	}

	private buildPalette(): void {
		const btnW = 120;
		const btnH = PALETTE_HEIGHT - 16;
		const total =
			btnW * PALETTE_ORDER.length + 6 * (PALETTE_ORDER.length - 1);
		const startX = (BASE_WIDTH - total) / 2;
		const y = BASE_HEIGHT - PALETTE_HEIGHT / 2;

		this.add
			.rectangle(
				BASE_WIDTH / 2,
				y,
				BASE_WIDTH,
				PALETTE_HEIGHT,
				COLORS.hudPanel,
				0.95,
			)
			.setStrokeStyle(2, COLORS.hudPanelBorder);

		for (let i = 0; i < PALETTE_ORDER.length; i++) {
			const id = PALETTE_ORDER[i];
			const spec = specFor(id);
			const x = startX + i * (btnW + 6) + btnW / 2;
			const rect = this.add
				.rectangle(x, y, btnW, btnH, COLORS.paletteBg, 0.9)
				.setStrokeStyle(2, COLORS.paletteBorder)
				.setInteractive({ useHandCursor: true });
			const icon = this.add.rectangle(
				x - btnW / 2 + 14,
				y,
				18,
				18,
				spec.color,
			);
			const label = this.add
				.text(x - btnW / 2 + 28, y - 14, spec.name, {
					fontFamily: 'monospace',
					fontSize: '13px',
					color: COLORS.hudText,
				})
				.setOrigin(0, 0);
			const extra =
				spec.kind === 'tower'
					? `${spec.cost}g -${spec.power}⚡`
					: spec.kind === 'generator'
						? `${spec.cost}g +${spec.power}⚡`
						: spec.kind === 'battery'
							? `${spec.cost}g 🔋${spec.capacity}`
							: spec.kind === 'repair'
								? `${spec.cost}g -${spec.power}⚡`
								: `${spec.cost}g`;
			const cost = this.add
				.text(x - btnW / 2 + 28, y + 2, extra, {
					fontFamily: 'monospace',
					fontSize: '10px',
					color: COLORS.hudDim,
				})
				.setOrigin(0, 0);
			const hotkey = this.add
				.text(x + btnW / 2 - 8, y - btnH / 2 + 4, `${(i + 1) % 10}`, {
					fontFamily: 'monospace',
					fontSize: '11px',
					color: COLORS.hudDim,
				})
				.setOrigin(1, 0);
			rect.on(
				'pointerdown',
				(
					_p: Phaser.Input.Pointer,
					_x: number,
					_y: number,
					event: Phaser.Types.Input.EventData,
				) => {
					event.stopPropagation();
					this.selectBuild(id);
				},
			);
			this.paletteButtons.push({ id, rect, icon, label, cost, hotkey });
		}
	}

	private refreshPaletteHighlight(): void {
		for (const b of this.paletteButtons) {
			const selected = b.id === this.selection;
			b.rect.setStrokeStyle(
				2,
				selected ? COLORS.paletteSelected : COLORS.paletteBorder,
			);
			b.rect.setFillStyle(COLORS.paletteBg, selected ? 0.95 : 0.85);
		}
	}

	private selectBuild(id: BuildId): void {
		this.selection = id;
		this.refreshPaletteHighlight();
	}

	private placeStarterKit(): void {
		const items = planStarterKit(this.path.cells);
		for (const item of items) {
			const cx = item.col * TILE + TILE / 2;
			const cy = item.row * TILE + TILE / 2;
			this.spawnBuilding(item.id, item.col, item.row, cx, cy);
		}
	}

	private refreshHud(): void {
		this.hudGoldVal.setText(`${this.gold}`);
		this.hudLivesVal.setText(`${this.lives}`);
		this.hudWaveVal.setText(`${this.wave}`);
		const remaining = this.enemiesToSpawn + this.enemies.length;
		this.hudEnemiesVal.setText(`${remaining}`);
		const { supply, demand, batteryCharge, batteryCapacity } =
			this.cachedPower;
		this.hudPowerVal.setText(`${supply}/${demand}`);
		this.hudPowerVal.setColor(
			supply >= demand ? COLORS.powerOk : COLORS.powerLow,
		);
		this.hudBatteryVal.setText(
			batteryCapacity > 0
				? `${Math.floor(batteryCharge)}/${batteryCapacity}`
				: '—',
		);
		if (this.enemiesToSpawn > 0 || this.enemies.length > 0) {
			this.hudTimerVal.setText('—');
			this.hudTimerLabel.setText('IN PROGRESS');
		} else {
			this.hudTimerLabel.setText('NEXT WAVE');
			this.hudTimerVal.setText(
				`${Math.ceil(this.interWaveDelayMs / 1000)}s`,
			);
		}
	}

	private snapToTile(
		x: number,
		y: number,
	): { col: number; row: number; cx: number; cy: number } {
		const col = Math.floor(x / TILE);
		const row = Math.floor(y / TILE);
		return {
			col,
			row,
			cx: col * TILE + TILE / 2,
			cy: row * TILE + TILE / 2,
		};
	}

	private canPlaceAt(col: number, row: number, id: BuildId): boolean {
		if (row <= HUD_ROWS_TOP) return false;
		if (row >= ROWS - 2) return false;
		if (col < 0 || col >= COLS) return false;
		if (this.path.cells.has(`${col},${row}`)) return false;
		const spec = specFor(id);
		if (this.gold < spec.cost) return false;
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			if (b.col === col && b.row === row) return false;
		}
		return true;
	}

	private onPointerMove(pointer: Phaser.Input.Pointer): void {
		if (this.isGameOver) return;
		if (
			pointer.worldY < HUD_HEIGHT ||
			pointer.worldY > BASE_HEIGHT - PALETTE_HEIGHT
		) {
			this.placementPreview.setVisible(false);
			this.placementRange.setVisible(false);
			return;
		}
		const { col, row, cx, cy } = this.snapToTile(
			pointer.worldX,
			pointer.worldY,
		);
		const ok = this.canPlaceAt(col, row, this.selection);
		const spec = specFor(this.selection);
		this.placementPreview
			.setPosition(cx, cy)
			.setFillStyle(ok ? spec.color : COLORS.previewInvalid, 0.6)
			.setVisible(true);
		if (spec.kind === 'tower') {
			this.placementRange
				.setPosition(cx, cy)
				.setRadius(spec.range)
				.setFillStyle(spec.color, 0.1)
				.setStrokeStyle(1, spec.color, 0.5)
				.setVisible(ok);
		} else {
			this.placementRange.setVisible(false);
		}
	}

	private onPointerDown(pointer: Phaser.Input.Pointer): void {
		if (this.isGameOver) return;
		if (
			pointer.worldY < HUD_HEIGHT ||
			pointer.worldY > BASE_HEIGHT - PALETTE_HEIGHT
		)
			return;
		const { col, row, cx, cy } = this.snapToTile(
			pointer.worldX,
			pointer.worldY,
		);
		if (!this.canPlaceAt(col, row, this.selection)) return;
		const spec = specFor(this.selection);
		this.gold -= spec.cost;
		this.spawnBuilding(this.selection, col, row, cx, cy);
		this.recomputePower(0);
		this.refreshHud();
	}

	private spawnBuilding(
		id: BuildId,
		col: number,
		row: number,
		x: number,
		y: number,
	): Building {
		const spec = specFor(id);
		const sprite = this.add.rectangle(
			x,
			y,
			TILE * 0.8,
			TILE * 0.8,
			spec.color,
		);
		sprite.setStrokeStyle(2, 0xffffff, 0.45);
		const hpBarBg = this.add
			.rectangle(
				x,
				y - TILE * 0.55,
				TILE * 0.7,
				4,
				COLORS.buildingHpBarBg,
			)
			.setOrigin(0.5)
			.setVisible(false);
		const hpBar = this.add
			.rectangle(
				x - (TILE * 0.7) / 2,
				y - TILE * 0.55,
				TILE * 0.7,
				4,
				COLORS.buildingHpBar,
			)
			.setOrigin(0, 0.5)
			.setVisible(false);

		const base: BaseBuilding = {
			id: this.nextEntityId++,
			col,
			row,
			x,
			y,
			hp: spec.maxHp,
			maxHp: spec.maxHp,
			sprite,
			hpBar,
			hpBarBg,
			destroyed: false,
		};

		let building: Building;
		if (spec.kind === 'tower') {
			const powerIndicator = this.add.circle(
				x + TILE * 0.3,
				y - TILE * 0.3,
				4,
				0x9ae6b4,
			);
			const b: TowerBuilding = {
				...base,
				kind: 'tower',
				spec: spec as TowerSpec,
				lastFireAtMs: 0,
				online: true,
				powerIndicator,
			};
			building = b;
		} else if (spec.kind === 'generator') {
			const b: GeneratorBuilding = {
				...base,
				kind: 'generator',
				spec: spec as GeneratorSpec,
				online: true,
			};
			building = b;
		} else if (spec.kind === 'battery') {
			const bspec = spec as BatterySpec;
			const chargeBarBg = this.add
				.rectangle(
					x,
					y + TILE * 0.5,
					TILE * 0.7,
					3,
					COLORS.buildingHpBarBg,
				)
				.setOrigin(0.5);
			const chargeBar = this.add
				.rectangle(
					x - (TILE * 0.7) / 2,
					y + TILE * 0.5,
					TILE * 0.7,
					3,
					0xf6e05e,
				)
				.setOrigin(0, 0.5);
			const b: BatteryBuilding = {
				...base,
				kind: 'battery',
				spec: bspec,
				charge: 0,
				capacity: bspec.capacity,
				chargeBar,
				chargeBarBg,
			};
			building = b;
		} else if (spec.kind === 'repair') {
			const powerIndicator = this.add.circle(
				x + TILE * 0.3,
				y - TILE * 0.3,
				4,
				0x9ae6b4,
			);
			const b: RepairBuilding = {
				...base,
				kind: 'repair',
				spec: spec as RepairSpec,
				online: true,
				powerIndicator,
				cooldownLeftMs: 0,
				activeDrone: null,
			};
			building = b;
		} else {
			sprite.setScale(0.6);
			const b: WireBuilding = {
				...base,
				kind: 'wire',
				spec: spec as WireSpec,
				powered: false,
			};
			building = b;
		}

		this.buildings.push(building);
		return building;
	}

	private recomputePower(dt: number): void {
		const result = buildComponents(this.buildings);
		applyPowerTick(this.buildings, result, dt);
		this.cachedPower.supply = result.totalSupply;
		this.cachedPower.demand = result.totalDemand;
		this.cachedPower.batteryCharge = result.totalBatteryCharge;
		this.cachedPower.batteryCapacity = result.totalBatteryCapacity;
		this.syncBuildingVisuals();
	}

	private syncBuildingVisuals(): void {
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			if (b.hp < b.maxHp) {
				b.hpBar.setVisible(true);
				b.hpBarBg.setVisible(true);
				b.hpBar.width = (b.hp / b.maxHp) * TILE * 0.7;
			} else {
				b.hpBar.setVisible(false);
				b.hpBarBg.setVisible(false);
			}
			if (b.kind === 'tower') {
				b.sprite.setAlpha(b.online ? 1 : 0.45);
				b.powerIndicator.setFillStyle(b.online ? 0x9ae6b4 : 0xfc8181);
			} else if (b.kind === 'repair') {
				b.sprite.setAlpha(b.online ? 1 : 0.45);
				b.powerIndicator.setFillStyle(b.online ? 0x9ae6b4 : 0xfc8181);
			} else if (b.kind === 'wire') {
				b.sprite.setFillStyle(b.powered ? COLORS.wire : COLORS.wireOff);
			} else if (b.kind === 'battery') {
				b.chargeBar.width = (b.charge / b.capacity) * TILE * 0.7;
			}
		}
	}

	private startNextWave(): void {
		this.wave += 1;
		const count = Math.floor(
			GAME_CONFIG.enemiesPerWave +
				(this.wave - 1) * GAME_CONFIG.enemiesPerWaveScale,
		);
		this.enemiesToSpawn = count;
		this.spawnAccumulatorMs = 0;
	}

	private spawnEnemy(): void {
		const start = this.path.waypoints[0];
		const hp = Math.floor(
			GAME_CONFIG.enemyBaseHp *
				Math.pow(GAME_CONFIG.enemyHpScale, this.wave - 1),
		);
		const speed = GAME_CONFIG.enemyBaseSpeed + (this.wave - 1) * 4;
		const attackDamage =
			GAME_CONFIG.enemyBaseAttackDamage +
			(this.wave - 1) * GAME_CONFIG.enemyAttackDamageScale;
		const sprite = this.add.circle(
			start.x,
			start.y,
			TILE * 0.3,
			COLORS.enemy,
		);
		const statusRing = this.add
			.circle(start.x, start.y, TILE * 0.36, 0xffffff, 0)
			.setStrokeStyle(2, 0xffffff, 0)
			.setVisible(false);
		const hpBarBg = this.add
			.rectangle(
				start.x,
				start.y - TILE * 0.5,
				TILE * 0.7,
				4,
				COLORS.enemyHpBarBg,
			)
			.setOrigin(0.5);
		const hpBar = this.add
			.rectangle(
				start.x - (TILE * 0.7) / 2,
				start.y - TILE * 0.5,
				TILE * 0.7,
				4,
				COLORS.enemyHpBar,
			)
			.setOrigin(0, 0.5);
		this.enemies.push({
			sprite,
			statusRing,
			hpBar,
			hpBarBg,
			hp,
			maxHp: hp,
			baseSpeed: speed,
			pathIndex: 1,
			alive: true,
			slowUntilMs: 0,
			slowFactor: 1,
			burnUntilMs: 0,
			burnDps: 0,
			attackDamage,
			attackTarget: null,
			lastAttackAtMs: 0,
		});
	}

	private findAttackTarget(e: Enemy): Building | null {
		const range = GAME_CONFIG.enemyAttackRange;
		let best: Building | null = null;
		let bestDist2 = range * range;
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			const dx = b.x - e.sprite.x;
			const dy = b.y - e.sprite.y;
			const d2 = dx * dx + dy * dy;
			if (d2 <= bestDist2) {
				bestDist2 = d2;
				best = b;
			}
		}
		return best;
	}

	private damageBuilding(b: Building, dmg: number): void {
		b.hp -= dmg;
		if (b.hp <= 0) {
			this.destroyBuilding(b);
		}
	}

	private destroyBuilding(b: Building): void {
		if (b.destroyed) return;
		b.destroyed = true;
		b.sprite.destroy();
		b.hpBar.destroy();
		b.hpBarBg.destroy();
		if (b.kind === 'tower' || b.kind === 'repair') {
			b.powerIndicator.destroy();
		}
		if (b.kind === 'battery') {
			b.chargeBar.destroy();
			b.chargeBarBg.destroy();
		}
		for (const e of this.enemies) {
			if (e.attackTarget === b) e.attackTarget = null;
		}
		for (const d of this.drones) {
			if (d.target === b || d.station === (b as RepairBuilding)) {
				d.alive = false;
				d.sprite.destroy();
				d.beam.destroy();
			}
		}
		this.drones = this.drones.filter((d) => d.alive);
	}

	private updateEnemies(dt: number, nowMs: number): void {
		for (const e of this.enemies) {
			if (!e.alive) continue;
			if (e.burnUntilMs > nowMs && e.burnDps > 0) {
				e.hp -= e.burnDps * dt;
				if (e.hp <= 0) {
					this.killEnemy(e, true);
					continue;
				}
			}

			if (e.attackTarget && e.attackTarget.destroyed)
				e.attackTarget = null;
			if (!e.attackTarget) {
				e.attackTarget = this.findAttackTarget(e);
			} else {
				const dx = e.attackTarget.x - e.sprite.x;
				const dy = e.attackTarget.y - e.sprite.y;
				if (
					dx * dx + dy * dy >
					GAME_CONFIG.enemyAttackRange *
						GAME_CONFIG.enemyAttackRange *
						2.25
				) {
					e.attackTarget = null;
				}
			}

			if (e.attackTarget) {
				if (nowMs - e.lastAttackAtMs >= GAME_CONFIG.enemyAttackRateMs) {
					e.lastAttackAtMs = nowMs;
					this.damageBuilding(e.attackTarget, e.attackDamage);
				}
				const slowed = e.slowUntilMs > nowMs;
				const speed =
					(slowed ? e.baseSpeed * e.slowFactor : e.baseSpeed) *
					GAME_CONFIG.enemyAttackSpeedFactor;
				if (speed > 0) this.moveAlongPath(e, speed, dt);
				this.updateEnemyVisuals(e, nowMs);
				continue;
			}

			const slowed = e.slowUntilMs > nowMs;
			const speed = slowed ? e.baseSpeed * e.slowFactor : e.baseSpeed;
			this.moveAlongPath(e, speed, dt);
			this.updateEnemyVisuals(e, nowMs);
		}
		this.enemies = this.enemies.filter((e) => e.alive);
	}

	private moveAlongPath(e: Enemy, speed: number, dt: number): void {
		const target: Waypoint | undefined = this.path.waypoints[e.pathIndex];
		if (!target) {
			this.killEnemy(e, false);
			this.lives -= 1;
			if (this.lives <= 0) this.endGame(false);
			return;
		}
		const dx = target.x - e.sprite.x;
		const dy = target.y - e.sprite.y;
		const dist = Math.hypot(dx, dy);
		const step = speed * dt;
		if (step >= dist) {
			e.sprite.x = target.x;
			e.sprite.y = target.y;
			e.pathIndex += 1;
		} else {
			e.sprite.x += (dx / dist) * step;
			e.sprite.y += (dy / dist) * step;
		}
	}

	private updateEnemyVisuals(e: Enemy, nowMs: number): void {
		e.hpBarBg.setPosition(e.sprite.x, e.sprite.y - TILE * 0.5);
		e.hpBar.setPosition(
			e.sprite.x - (TILE * 0.7) / 2,
			e.sprite.y - TILE * 0.5,
		);
		e.hpBar.width = (e.hp / e.maxHp) * TILE * 0.7;
		e.statusRing.setPosition(e.sprite.x, e.sprite.y);
		const slowed = e.slowUntilMs > nowMs;
		const burning = e.burnUntilMs > nowMs;
		if (slowed || burning) {
			e.statusRing.setVisible(true);
			const color = burning ? COLORS.statusBurn : COLORS.statusSlow;
			e.statusRing.setStrokeStyle(2, color, 0.8);
		} else {
			e.statusRing.setVisible(false);
		}
	}

	private updateTowers(nowMs: number): void {
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			if (b.kind !== 'tower') continue;
			if (!b.online) continue;
			if (nowMs - b.lastFireAtMs < b.spec.fireRateMs) continue;
			const target = this.findTarget(b);
			if (!target) continue;
			b.lastFireAtMs = nowMs;
			this.fireProjectile(b, target);
		}
	}

	private findTarget(t: TowerBuilding): Enemy | null {
		let best: Enemy | null = null;
		let bestProgress = -1;
		for (const e of this.enemies) {
			if (!e.alive) continue;
			const dx = e.sprite.x - t.x;
			const dy = e.sprite.y - t.y;
			if (dx * dx + dy * dy > t.spec.range * t.spec.range) continue;
			if (e.pathIndex > bestProgress) {
				bestProgress = e.pathIndex;
				best = e;
			}
		}
		return best;
	}

	private fireProjectile(t: TowerBuilding, enemy: Enemy): void {
		const sprite = this.add.circle(t.x, t.y, 4, t.spec.projectileColor);
		this.projectiles.push({
			sprite,
			tower: t,
			targetX: enemy.sprite.x,
			targetY: enemy.sprite.y,
			enemy,
			speed: t.spec.projectileSpeed,
			alive: true,
		});
	}

	private updateProjectiles(dt: number, nowMs: number): void {
		for (const p of this.projectiles) {
			if (!p.alive) continue;
			if (p.enemy && p.enemy.alive) {
				p.targetX = p.enemy.sprite.x;
				p.targetY = p.enemy.sprite.y;
			}
			const dx = p.targetX - p.sprite.x;
			const dy = p.targetY - p.sprite.y;
			const dist = Math.hypot(dx, dy);
			const step = p.speed * dt;
			if (step >= dist) {
				this.applyHit(p, nowMs);
				p.alive = false;
				p.sprite.destroy();
			} else {
				p.sprite.x += (dx / dist) * step;
				p.sprite.y += (dy / dist) * step;
			}
		}
		this.projectiles = this.projectiles.filter((p) => p.alive);
	}

	private applyHit(p: Projectile, nowMs: number): void {
		const spec = p.tower.spec;
		const x = p.sprite.x;
		const y = p.sprite.y;
		if (spec.burnDps > 0 && spec.burnMs > 0 && spec.burnRadius > 0) {
			this.spawnBurnPatch(
				x,
				y,
				spec.burnRadius,
				spec.burnDps,
				nowMs + spec.burnMs,
			);
			return;
		}
		if (spec.splashRadius > 0) {
			for (const e of this.enemies) {
				if (!e.alive) continue;
				const dx = e.sprite.x - x;
				const dy = e.sprite.y - y;
				if (
					dx * dx + dy * dy <=
					spec.splashRadius * spec.splashRadius
				) {
					this.damageEnemy(e, spec.damage);
				}
			}
			this.spawnSplashFlash(x, y, spec.splashRadius);
			return;
		}
		if (p.enemy && p.enemy.alive) {
			this.damageEnemy(p.enemy, spec.damage);
			if (p.enemy.alive && spec.slowMs > 0) {
				p.enemy.slowUntilMs = Math.max(
					p.enemy.slowUntilMs,
					nowMs + spec.slowMs,
				);
				p.enemy.slowFactor = spec.slowFactor;
			}
		}
	}

	private damageEnemy(e: Enemy, dmg: number): void {
		e.hp -= dmg;
		if (e.hp <= 0) this.killEnemy(e, true);
	}

	private spawnBurnPatch(
		x: number,
		y: number,
		radius: number,
		dps: number,
		expiresAtMs: number,
	): void {
		const sprite = this.add.circle(x, y, radius, COLORS.burnPatch, 0.25);
		sprite.setStrokeStyle(2, COLORS.burnPatch, 0.6);
		this.burnPatches.push({ sprite, x, y, radius, dps, expiresAtMs });
	}

	private spawnSplashFlash(x: number, y: number, radius: number): void {
		const flash = this.add.circle(x, y, radius, 0xfbd38d, 0.45);
		this.tweens.add({
			targets: flash,
			alpha: 0,
			scale: 1.2,
			duration: 220,
			onComplete: () => flash.destroy(),
		});
	}

	private updateBurnPatches(dt: number, nowMs: number): void {
		for (const patch of this.burnPatches) {
			if (nowMs >= patch.expiresAtMs) continue;
			for (const e of this.enemies) {
				if (!e.alive) continue;
				const dx = e.sprite.x - patch.x;
				const dy = e.sprite.y - patch.y;
				if (dx * dx + dy * dy <= patch.radius * patch.radius) {
					e.burnUntilMs = Math.max(e.burnUntilMs, nowMs + 500);
					e.burnDps = Math.max(e.burnDps, patch.dps);
				}
			}
			const remaining = (patch.expiresAtMs - nowMs) / 1000;
			patch.sprite.setAlpha(0.1 + Math.min(0.25, remaining * 0.1));
		}
		this.burnPatches = this.burnPatches.filter((p) => {
			if (nowMs >= p.expiresAtMs) {
				p.sprite.destroy();
				return false;
			}
			return true;
		});
	}

	private updateRepair(dt: number): void {
		const dtMs = dt * 1000;
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			if (b.kind !== 'repair') continue;
			if (!b.online) continue;
			if (b.activeDrone && b.activeDrone.alive) continue;
			b.cooldownLeftMs -= dtMs;
			if (b.cooldownLeftMs > 0) continue;
			const target = this.findRepairTarget(b);
			if (!target) {
				b.cooldownLeftMs = 0;
				continue;
			}
			b.cooldownLeftMs = b.spec.cooldownMs;
			this.spawnDrone(b, target);
		}

		for (const d of this.drones) {
			if (!d.alive) continue;
			if (d.target.destroyed) {
				d.alive = false;
				d.sprite.destroy();
				d.beam.destroy();
				continue;
			}
			const dest = d.state === 'outbound' ? d.target : d.station;
			const dx = dest.x - d.x;
			const dy = dest.y - d.y;
			const dist = Math.hypot(dx, dy);
			const step = d.speed * dt;
			if (step >= dist) {
				d.x = dest.x;
				d.y = dest.y;
				if (d.state === 'outbound') {
					d.target.hp = Math.min(
						d.target.maxHp,
						d.target.hp + d.station.spec.repairAmount,
					);
					d.state = 'returning';
				} else {
					d.alive = false;
					d.sprite.destroy();
					d.beam.destroy();
					d.station.activeDrone = null;
					continue;
				}
			} else {
				d.x += (dx / dist) * step;
				d.y += (dy / dist) * step;
			}
			d.sprite.setPosition(d.x, d.y);
			d.beam.clear();
			if (d.state === 'outbound') {
				d.beam.lineStyle(2, COLORS.repairBeam, 0.7);
				d.beam.lineBetween(d.x, d.y, d.target.x, d.target.y);
			}
		}
		this.drones = this.drones.filter((d) => d.alive);
	}

	private findRepairTarget(station: RepairBuilding): Building | null {
		let best: Building | null = null;
		let bestRatio = 1;
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			if (b === station) continue;
			if (b.hp >= b.maxHp) continue;
			const ratio = b.hp / b.maxHp;
			if (ratio < bestRatio) {
				bestRatio = ratio;
				best = b;
			}
		}
		return best;
	}

	private spawnDrone(station: RepairBuilding, target: Building): void {
		const sprite = this.add.circle(
			station.x,
			station.y,
			5,
			COLORS.repairDrone,
		);
		const beam = this.add.graphics();
		beam.lineStyle(2, COLORS.repairBeam, 0.7);
		beam.lineBetween(station.x, station.y, target.x, target.y);
		const drone: RepairDrone = {
			sprite,
			beam,
			station,
			target,
			x: station.x,
			y: station.y,
			speed: GAME_CONFIG.repairDroneSpeed,
			state: 'outbound',
			alive: true,
		};
		station.activeDrone = drone;
		this.drones.push(drone);
	}

	private killEnemy(e: Enemy, reward: boolean): void {
		if (!e.alive) return;
		e.alive = false;
		e.sprite.destroy();
		e.statusRing.destroy();
		e.hpBar.destroy();
		e.hpBarBg.destroy();
		if (reward) {
			this.gold += GAME_CONFIG.goldPerKill;
		}
	}

	private endGame(win: boolean): void {
		this.isGameOver = true;
		this.placementPreview.setVisible(false);
		this.placementRange.setVisible(false);
		this.gameOverText = this.add
			.text(
				BASE_WIDTH / 2,
				BASE_HEIGHT / 2,
				`${win ? 'Victory' : 'Defeat'} — wave ${this.wave}\nPress R to restart`,
				{
					fontFamily: 'monospace',
					fontSize: '32px',
					color: win ? '#48bb78' : '#fc8181',
					align: 'center',
				},
			)
			.setOrigin(0.5);
	}

	update(_time: number, deltaMs: number): void {
		if (this.isGameOver) return;
		const dt = deltaMs / 1000;
		const nowMs = this.time.now;

		if (this.enemiesToSpawn > 0) {
			this.spawnAccumulatorMs += deltaMs;
			while (
				this.spawnAccumulatorMs >= GAME_CONFIG.enemySpawnIntervalMs &&
				this.enemiesToSpawn > 0
			) {
				this.spawnAccumulatorMs -= GAME_CONFIG.enemySpawnIntervalMs;
				this.spawnEnemy();
				this.enemiesToSpawn -= 1;
			}
		} else if (this.enemies.length === 0) {
			this.interWaveDelayMs -= deltaMs;
			if (this.interWaveDelayMs <= 0) {
				this.interWaveDelayMs = GAME_CONFIG.waveDelayMs;
				this.startNextWave();
			}
		}

		this.updateBurnPatches(dt, nowMs);
		this.updateEnemies(dt, nowMs);
		this.updateTowers(nowMs);
		this.updateProjectiles(dt, nowMs);
		this.updateRepair(dt);

		this.powerRefreshAccumulatorMs += deltaMs;
		if (this.powerRefreshAccumulatorMs >= 100) {
			this.recomputePower(this.powerRefreshAccumulatorMs / 1000);
			this.powerRefreshAccumulatorMs = 0;
		}

		this.refreshHud();
	}
}
