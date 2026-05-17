import Phaser from 'phaser';
import {
	addComponent,
	addEntity,
	createWorld,
	query,
	removeEntity,
	SideMap,
	type World,
} from '@kbve/laser';
import {
	BASE_HEIGHT,
	BASE_WIDTH,
	COLORS,
	COLS,
	ENEMY_CATALOG,
	GAME_CONFIG,
	HUD_ROWS_TOP,
	PALETTE_ORDER,
	ROWS,
	TILE,
	UPGRADE_DEFS,
	UPGRADE_ORDER,
	rollEnemyType,
	specFor,
	upgradeCost,
	type ArmourySpec,
	type BatterySpec,
	type BuildId,
	type EnemyTypeId,
	type GeneratorSpec,
	type RepairSpec,
	type TowerSpec,
	type UpgradeKind,
} from './config';
import {
	ArmouryTag,
	BatteryTag,
	BuildingTag,
	DroneStats,
	DroneState,
	DroneTag,
	EnemyStats,
	EnemyTag,
	enemyTypeIndexFromId,
	GeneratorTag,
	Position,
	RepairTag,
	SoldierStats,
	SoldierTag,
	TowerTag,
	type AttackTarget,
	type DroneVisual,
	type EnemyVisual,
	type SoldierVisual,
} from './ecs';
import {
	CARD_POOL,
	pickThreeCards,
	type CardId,
	type CardOption,
} from './cards';
import {
	generatePath,
	type GeneratedPath,
	type Waypoint,
} from './path-generator';
import { computeAndApplyPower } from './power';
import { planStarterKit } from './starter-kit';
import {
	towerBurnDps,
	towerDamage,
	towerFireRateMs,
	towerMaxHp,
	towerRange,
} from './tower-stats';
import type {
	ArmouryBuilding,
	BaseBuilding,
	BatteryBuilding,
	BurnPatch,
	Building,
	GeneratorBuilding,
	Projectile,
	RepairBuilding,
	TowerBuilding,
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

function refundForBuilding(b: Building): number {
	let value = b.spec.cost;
	if (b.kind === 'tower') {
		for (const kind of UPGRADE_ORDER) {
			const def = UPGRADE_DEFS[kind];
			const lvl = b.upgrades[kind];
			value += def.baseCost * ((lvl * (lvl + 1)) / 2);
		}
	}
	return Math.floor(value * 0.5);
}

export class TowerDefenseScene extends Phaser.Scene {
	private path!: GeneratedPath;
	private world!: World;
	private enemyVisuals = new SideMap<EnemyVisual>();
	private pendingBosses = 0;
	private frameEnemyEids: Iterable<number> = [];
	private frameSoldierEids: Iterable<number> = [];
	private frameBuildingEids: Iterable<number> = [];
	private buildings: Building[] = [];
	private buildingByEid = new SideMap<Building>();
	private droneVisuals = new SideMap<DroneVisual>();
	private soldierVisuals = new SideMap<SoldierVisual>();
	private projectiles: Projectile[] = [];
	private burnPatches: BurnPatch[] = [];

	private freeBasicTowers = 0;
	private bountyBonusMultiplier = 1;
	private awaitingCardPick = false;
	private cardPanel: Phaser.GameObjects.Container | null = null;
	private cardBackdrop: Phaser.GameObjects.Rectangle | null = null;
	private cardPickedThisInterval = false;
	private skipButton: Phaser.GameObjects.Container | null = null;
	private hudFreeTowerLabel!: Phaser.GameObjects.Text;
	private hudFreeTowerVal!: Phaser.GameObjects.Text;
	private hudBountyLabel!: Phaser.GameObjects.Text;
	private hudBountyVal!: Phaser.GameObjects.Text;

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

	private upgradePanel: Phaser.GameObjects.Container | null = null;
	private upgradeTarget: Building | null = null;
	private upgradeRangeIndicator: Phaser.GameObjects.Arc | null = null;
	private upgradeBounds: Phaser.Geom.Rectangle | null = null;
	private targetingTower: TowerBuilding | null = null;
	private targetingHint: Phaser.GameObjects.Text | null = null;

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

	init(): void {
		this.world = createWorld();
		this.enemyVisuals = new SideMap<EnemyVisual>();
		this.pendingBosses = 0;
		this.frameEnemyEids = [];
		this.frameSoldierEids = [];
		this.frameBuildingEids = [];
		this.buildings = [];
		this.buildingByEid = new SideMap<Building>();
		this.droneVisuals = new SideMap<DroneVisual>();
		this.soldierVisuals = new SideMap<SoldierVisual>();
		this.projectiles = [];
		this.burnPatches = [];
		this.freeBasicTowers = 0;
		this.bountyBonusMultiplier = 1;
		this.awaitingCardPick = false;
		this.cardPanel = null;
		this.cardBackdrop = null;
		this.cardPickedThisInterval = false;
		this.skipButton = null;
		this.gold = GAME_CONFIG.startingGold;
		this.lives = GAME_CONFIG.startingLives;
		this.wave = 0;
		this.enemiesToSpawn = 0;
		this.spawnAccumulatorMs = 0;
		this.interWaveDelayMs = 0;
		this.isGameOver = false;
		this.paletteButtons = [];
		this.upgradePanel = null;
		this.upgradeTarget = null;
		this.upgradeRangeIndicator = null;
		this.upgradeBounds = null;
		this.targetingTower = null;
		this.targetingHint = null;
		this.cachedPower = {
			supply: 0,
			demand: 0,
			batteryCharge: 0,
			batteryCapacity: 0,
		};
		this.powerRefreshAccumulatorMs = 0;
		this.selection = 'basic';
		this.gameOverText = undefined;
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
			kb.on('keydown-ESC', () => {
				if (this.targetingTower) this.cancelTargeting();
				else if (this.upgradePanel) this.closeUpgradePanel();
			});
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

		this.hudFreeTowerLabel = this.add
			.text(940, 8, 'FREE TWR', {
				fontFamily: 'monospace',
				fontSize: '11px',
				color: COLORS.hudDim,
			})
			.setVisible(false);
		this.hudFreeTowerVal = this.add
			.text(940, 24, '0', {
				fontFamily: 'monospace',
				fontSize: '20px',
				color: COLORS.goldText,
				fontStyle: 'bold',
			})
			.setVisible(false);

		this.hudBountyLabel = this.add
			.text(1060, 8, 'BOUNTY', {
				fontFamily: 'monospace',
				fontSize: '11px',
				color: COLORS.hudDim,
			})
			.setVisible(false);
		this.hudBountyVal = this.add
			.text(1060, 24, '×1.0', {
				fontFamily: 'monospace',
				fontSize: '20px',
				color: COLORS.batteryFull,
				fontStyle: 'bold',
			})
			.setVisible(false);

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
		this.buildSkipButton();
	}

	private buildSkipButton(): void {
		const w = 76;
		const h = 26;
		const x = BASE_WIDTH - 16 - w / 2;
		const y = HUD_HEIGHT + h / 2 + 4;
		const container = this.add
			.container(x, y)
			.setDepth(20)
			.setVisible(false);
		const bg = this.add
			.rectangle(0, 0, w, h, 0x111827, 0.95)
			.setStrokeStyle(2, COLORS.paletteSelected, 0.9)
			.setInteractive({ useHandCursor: true });
		const label = this.add
			.text(0, 0, 'SKIP →', {
				fontFamily: 'monospace',
				fontSize: '12px',
				color: COLORS.goldText,
				fontStyle: 'bold',
			})
			.setOrigin(0.5);
		container.add(bg);
		container.add(label);
		bg.on(
			'pointerdown',
			(
				_p: Phaser.Input.Pointer,
				_x: number,
				_y: number,
				ev: Phaser.Types.Input.EventData,
			) => {
				ev.stopPropagation();
				if (this.canSkipWave()) {
					this.interWaveDelayMs = 0;
				}
			},
		);
		this.skipButton = container;
	}

	private canSkipWave(): boolean {
		return (
			!this.awaitingCardPick &&
			!this.isGameOver &&
			this.enemiesToSpawn === 0 &&
			this.enemyVisuals.size === 0 &&
			this.interWaveDelayMs > 0
		);
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
		const btnW = 108;
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
							: `${spec.cost}g -${spec.power}⚡`;
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
		const remaining = this.enemiesToSpawn + this.enemyVisuals.size;
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
		if (this.enemiesToSpawn > 0 || this.enemyVisuals.size > 0) {
			this.hudTimerVal.setText('—');
			this.hudTimerLabel.setText('IN PROGRESS');
		} else {
			this.hudTimerLabel.setText('NEXT WAVE');
			this.hudTimerVal.setText(
				`${Math.ceil(this.interWaveDelayMs / 1000)}s`,
			);
		}
		const showFree = this.freeBasicTowers > 0;
		this.hudFreeTowerLabel.setVisible(showFree);
		this.hudFreeTowerVal.setVisible(showFree);
		if (showFree) this.hudFreeTowerVal.setText(`${this.freeBasicTowers}`);
		const showBounty = this.bountyBonusMultiplier > 1;
		this.hudBountyLabel.setVisible(showBounty);
		this.hudBountyVal.setVisible(showBounty);
		if (showBounty)
			this.hudBountyVal.setText(
				`×${this.bountyBonusMultiplier.toFixed(1)}`,
			);
		if (this.skipButton) this.skipButton.setVisible(this.canSkipWave());
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
		const isFree = id === 'basic' && this.freeBasicTowers > 0;
		if (!isFree && this.gold < spec.cost) return false;
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			if (b.col === col && b.row === row) return false;
		}
		return true;
	}

	private onPointerMove(pointer: Phaser.Input.Pointer): void {
		if (this.isGameOver) return;
		if (this.targetingTower) {
			this.placementPreview.setVisible(false);
			this.placementRange.setVisible(false);
			if (this.targetingHint) {
				this.targetingHint.setPosition(
					pointer.worldX + 12,
					pointer.worldY + 12,
				);
			}
			return;
		}
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

		if (this.targetingTower) {
			if (pointer.worldY < HUD_HEIGHT) {
				this.cancelTargeting();
				return;
			}
			if (pointer.worldY > BASE_HEIGHT - PALETTE_HEIGHT) {
				this.cancelTargeting();
				return;
			}
			this.setFixedTarget(
				this.targetingTower,
				pointer.worldX,
				pointer.worldY,
			);
			this.cancelTargeting();
			return;
		}

		if (this.upgradePanel && this.upgradeBounds) {
			if (this.upgradeBounds.contains(pointer.worldX, pointer.worldY)) {
				return;
			}
			const probe = this.snapToTile(pointer.worldX, pointer.worldY);
			const probeHit = this.findBuildingAt(probe.col, probe.row);
			if (
				probeHit &&
				!probeHit.destroyed &&
				probeHit !== this.upgradeTarget
			) {
				this.openBuildingPanel(probeHit);
				return;
			}
			this.closeUpgradePanel();
			return;
		}

		if (
			pointer.worldY < HUD_HEIGHT ||
			pointer.worldY > BASE_HEIGHT - PALETTE_HEIGHT
		)
			return;
		const { col, row, cx, cy } = this.snapToTile(
			pointer.worldX,
			pointer.worldY,
		);

		const existing = this.findBuildingAt(col, row);
		if (existing && !existing.destroyed) {
			this.openBuildingPanel(existing);
			return;
		}

		if (!this.canPlaceAt(col, row, this.selection)) return;
		const spec = specFor(this.selection);
		if (this.selection === 'basic' && this.freeBasicTowers > 0) {
			this.freeBasicTowers -= 1;
		} else {
			this.gold -= spec.cost;
		}
		this.spawnBuilding(this.selection, col, row, cx, cy);
		this.recomputePower(0);
		this.refreshHud();
	}

	private findBuildingAt(col: number, row: number): Building | null {
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			if (b.col === col && b.row === row) return b;
		}
		return null;
	}

	private openBuildingPanel(b: Building): void {
		this.closeUpgradePanel();
		this.upgradeTarget = b;
		this.placementPreview.setVisible(false);
		this.placementRange.setVisible(false);

		if (b.kind === 'tower') {
			this.upgradeRangeIndicator = this.add
				.circle(b.x, b.y, towerRange(b), b.spec.color, 0.12)
				.setStrokeStyle(2, b.spec.color, 0.6);
		}

		const isTower = b.kind === 'tower';
		const supportsFixed = isTower && this.supportsFixedTarget(b);
		const upgradeRows = isTower ? UPGRADE_ORDER.length : 0;
		const rowH = 32;
		const headerH = 52;
		const demolishRowH = 36;
		const padBottom = 12;
		const panelW = 300;
		const panelH =
			headerH +
			upgradeRows * rowH +
			(supportsFixed ? rowH : 0) +
			demolishRowH +
			padBottom;

		let panelX = b.x + TILE;
		let panelY = b.y - panelH / 2;
		if (panelX + panelW > BASE_WIDTH - 12) panelX = b.x - TILE - panelW;
		if (panelX < 12) panelX = 12;
		if (panelY < HUD_HEIGHT + 8) panelY = HUD_HEIGHT + 8;
		if (panelY + panelH > BASE_HEIGHT - PALETTE_HEIGHT - 8)
			panelY = BASE_HEIGHT - PALETTE_HEIGHT - panelH - 8;

		const container = this.add.container(panelX, panelY).setDepth(100);
		const bg = this.add
			.rectangle(0, 0, panelW, panelH, COLORS.hudPanel, 0.96)
			.setStrokeStyle(2, COLORS.hudPanelBorder)
			.setOrigin(0, 0);
		container.add(bg);

		const title = this.add.text(12, 8, this.panelTitle(b), {
			fontFamily: 'monospace',
			fontSize: '14px',
			color: COLORS.hudText,
			fontStyle: 'bold',
		});
		container.add(title);

		const close = this.add
			.text(panelW - 18, 6, '✕', {
				fontFamily: 'monospace',
				fontSize: '16px',
				color: COLORS.hudDim,
			})
			.setInteractive({ useHandCursor: true });
		close.on(
			'pointerdown',
			(
				_p: Phaser.Input.Pointer,
				_x: number,
				_y: number,
				ev: Phaser.Types.Input.EventData,
			) => {
				ev.stopPropagation();
				this.closeUpgradePanel();
			},
		);
		container.add(close);

		const stats = this.add.text(12, 28, this.buildingStatsLine(b), {
			fontFamily: 'monospace',
			fontSize: '10px',
			color: COLORS.hudDim,
		});
		container.add(stats);

		if (isTower) {
			for (let i = 0; i < UPGRADE_ORDER.length; i++) {
				const kind = UPGRADE_ORDER[i];
				const def = UPGRADE_DEFS[kind];
				const lvl = b.upgrades[kind];
				const maxed = lvl >= def.maxLevel;
				const cost = upgradeCost(def, lvl);
				const affordable = this.gold >= cost;
				const y = headerH + i * rowH;

				const row = this.add
					.rectangle(8, y, panelW - 16, rowH - 4, 0x1f2937, 0.85)
					.setOrigin(0, 0)
					.setStrokeStyle(1, def.color, 0.7);
				container.add(row);

				const dot = this.add.rectangle(
					20,
					y + (rowH - 4) / 2,
					10,
					10,
					def.color,
				);
				container.add(dot);

				const label = this.add.text(
					36,
					y + 4,
					`${def.name}  ${def.description}`,
					{
						fontFamily: 'monospace',
						fontSize: '11px',
						color: COLORS.hudText,
					},
				);
				container.add(label);

				const levelText = this.add.text(
					36,
					y + 16,
					`Lv ${lvl}/${def.maxLevel}`,
					{
						fontFamily: 'monospace',
						fontSize: '10px',
						color: COLORS.hudDim,
					},
				);
				container.add(levelText);

				const btnLabel = maxed ? 'MAX' : `${cost}g`;
				const btnColor = maxed
					? COLORS.hudDim
					: affordable
						? COLORS.goldText
						: COLORS.powerLow;
				const btn = this.add
					.rectangle(
						panelW - 16,
						y + (rowH - 4) / 2,
						64,
						rowH - 8,
						0x111827,
						0.95,
					)
					.setOrigin(1, 0.5)
					.setStrokeStyle(
						1,
						def.color,
						maxed || !affordable ? 0.3 : 0.9,
					);
				const btnText = this.add
					.text(panelW - 48, y + (rowH - 4) / 2, btnLabel, {
						fontFamily: 'monospace',
						fontSize: '11px',
						color: btnColor,
						fontStyle: 'bold',
					})
					.setOrigin(0.5);
				container.add(btn);
				container.add(btnText);

				if (!maxed && affordable) {
					btn.setInteractive({ useHandCursor: true });
					btn.on(
						'pointerdown',
						(
							_p: Phaser.Input.Pointer,
							_x: number,
							_y: number,
							ev: Phaser.Types.Input.EventData,
						) => {
							ev.stopPropagation();
							this.applyUpgrade(b, kind);
						},
					);
				}
			}
		}

		let fixedRowEndY = headerH + upgradeRows * rowH;
		if (isTower && this.supportsFixedTarget(b)) {
			const fy = fixedRowEndY + 4;
			const hasTarget = b.fixedTarget !== null;
			const fixedRow = this.add
				.rectangle(8, fy, panelW - 16, rowH - 4, 0x1c2541, 0.85)
				.setOrigin(0, 0)
				.setStrokeStyle(1, b.spec.color, 0.7);
			container.add(fixedRow);
			const fLabel = this.add.text(20, fy + 4, 'Fixed Target', {
				fontFamily: 'monospace',
				fontSize: '11px',
				color: COLORS.hudText,
			});
			container.add(fLabel);
			const fHint = this.add.text(
				20,
				fy + 16,
				hasTarget
					? `Locked at (${b.fixedTarget!.x.toFixed(0)}, ${b.fixedTarget!.y.toFixed(0)})`
					: 'Auto-targeting enemies',
				{
					fontFamily: 'monospace',
					fontSize: '10px',
					color: COLORS.hudDim,
				},
			);
			container.add(fHint);
			const fBtnLabel = hasTarget ? 'CLEAR' : 'SET';
			const fBtn = this.add
				.rectangle(
					panelW - 16,
					fy + (rowH - 4) / 2,
					64,
					rowH - 8,
					0x111827,
					0.95,
				)
				.setOrigin(1, 0.5)
				.setStrokeStyle(1, b.spec.color, 0.9)
				.setInteractive({ useHandCursor: true });
			const fBtnText = this.add
				.text(panelW - 48, fy + (rowH - 4) / 2, fBtnLabel, {
					fontFamily: 'monospace',
					fontSize: '11px',
					color: COLORS.hudText,
					fontStyle: 'bold',
				})
				.setOrigin(0.5);
			container.add(fBtn);
			container.add(fBtnText);
			fBtn.on(
				'pointerdown',
				(
					_p: Phaser.Input.Pointer,
					_x: number,
					_y: number,
					ev: Phaser.Types.Input.EventData,
				) => {
					ev.stopPropagation();
					if (hasTarget) {
						this.clearFixedTarget(b);
						this.openBuildingPanel(b);
					} else {
						this.enterTargeting(b);
					}
				},
			);
			fixedRowEndY += rowH;
		}
		const demolishY = fixedRowEndY + 4;
		const refund = refundForBuilding(b);
		const demolishRow = this.add
			.rectangle(
				8,
				demolishY,
				panelW - 16,
				demolishRowH - 8,
				0x2d1212,
				0.85,
			)
			.setOrigin(0, 0)
			.setStrokeStyle(1, 0xfc8181, 0.7);
		container.add(demolishRow);
		const demolishLabel = this.add.text(20, demolishY + 6, 'Demolish', {
			fontFamily: 'monospace',
			fontSize: '12px',
			color: COLORS.hudText,
			fontStyle: 'bold',
		});
		container.add(demolishLabel);
		const demolishHint = this.add.text(
			20,
			demolishY + 20,
			`Refund ${refund}g (50% of investment)`,
			{
				fontFamily: 'monospace',
				fontSize: '9px',
				color: COLORS.hudDim,
			},
		);
		container.add(demolishHint);
		const demolishBtn = this.add
			.rectangle(
				panelW - 16,
				demolishY + (demolishRowH - 8) / 2,
				72,
				demolishRowH - 14,
				0x611818,
				0.95,
			)
			.setOrigin(1, 0.5)
			.setStrokeStyle(1, 0xfc8181, 0.9)
			.setInteractive({ useHandCursor: true });
		const demolishBtnText = this.add
			.text(panelW - 52, demolishY + (demolishRowH - 8) / 2, 'SELL', {
				fontFamily: 'monospace',
				fontSize: '11px',
				color: '#fed7d7',
				fontStyle: 'bold',
			})
			.setOrigin(0.5);
		container.add(demolishBtn);
		container.add(demolishBtnText);
		demolishBtn.on(
			'pointerdown',
			(
				_p: Phaser.Input.Pointer,
				_x: number,
				_y: number,
				ev: Phaser.Types.Input.EventData,
			) => {
				ev.stopPropagation();
				this.demolishBuilding(b);
			},
		);

		this.upgradePanel = container;
		this.upgradeBounds = new Phaser.Geom.Rectangle(
			panelX,
			panelY,
			panelW,
			panelH,
		);
	}

	private panelTitle(b: Building): string {
		if (b.kind === 'tower') return `${b.spec.name} Tower`;
		if (b.kind === 'generator') return `${b.spec.name} Generator`;
		if (b.kind === 'battery') return `${b.spec.name}`;
		if (b.kind === 'armoury') return `${b.spec.name}`;
		return `${b.spec.name} Station`;
	}

	private buildingStatsLine(b: Building): string {
		if (b.kind === 'tower') {
			const dmg = towerDamage(b).toFixed(0);
			const rate = (towerFireRateMs(b) / 1000).toFixed(2);
			const rng = towerRange(b).toFixed(0);
			const hp = `${Math.floor(b.hp)}/${towerMaxHp(b)}`;
			return `DMG ${dmg} · RATE ${rate}s · RNG ${rng} · HP ${hp}`;
		}
		if (b.kind === 'generator') {
			return `OUTPUT +${b.spec.power}⚡ · HP ${Math.floor(b.hp)}/${b.maxHp}`;
		}
		if (b.kind === 'battery') {
			return `CHARGE ${Math.floor(b.charge)}/${b.capacity} · HP ${Math.floor(b.hp)}/${b.maxHp}`;
		}
		if (b.kind === 'armoury') {
			const rate = (b.spec.spawnIntervalMs / 1000).toFixed(1);
			return `LOAD -${b.spec.power}⚡ · 1 SOLDIER / ${rate}s · HP ${Math.floor(b.hp)}/${b.maxHp}`;
		}
		return `LOAD -${b.spec.power}⚡ · HEALS ${b.spec.repairAmount} · HP ${Math.floor(b.hp)}/${b.maxHp}`;
	}

	private applyUpgrade(tower: TowerBuilding, kind: UpgradeKind): void {
		const def = UPGRADE_DEFS[kind];
		const lvl = tower.upgrades[kind];
		if (lvl >= def.maxLevel) return;
		const cost = upgradeCost(def, lvl);
		if (this.gold < cost) return;
		this.gold -= cost;
		const prevMaxHp = towerMaxHp(tower);
		tower.upgrades[kind] = lvl + 1;
		tower.maxHp = towerMaxHp(tower);
		if (kind === 'armor') {
			const delta = tower.maxHp - prevMaxHp;
			tower.hp = Math.min(tower.maxHp, tower.hp + delta);
		} else {
			tower.hp = Math.min(tower.hp, tower.maxHp);
		}
		this.redrawUpgradePips(tower);
		this.refreshHud();
		this.openBuildingPanel(tower);
	}

	private redrawUpgradePips(t: TowerBuilding): void {
		t.upgradePips.clear();
		const pipW = 3;
		const pipH = TILE * 0.5;
		const startX = t.x + TILE * 0.42;
		const baseY = t.y + pipH / 2;
		for (let i = 0; i < UPGRADE_ORDER.length; i++) {
			const kind = UPGRADE_ORDER[i];
			const lvl = t.upgrades[kind];
			const def = UPGRADE_DEFS[kind];
			const px = startX + i * (pipW + 1);
			t.upgradePips.fillStyle(0x111827, 0.7);
			t.upgradePips.fillRect(px, baseY - pipH, pipW, pipH);
			if (lvl > 0) {
				const filled = (lvl / def.maxLevel) * pipH;
				t.upgradePips.fillStyle(def.color, 0.95);
				t.upgradePips.fillRect(px, baseY - filled, pipW, filled);
			}
		}
	}

	private demolishBuilding(b: Building): void {
		const refund = refundForBuilding(b);
		this.gold += refund;
		this.closeUpgradePanel();
		this.destroyBuilding(b);
		this.recomputePower(0);
		this.refreshHud();
	}

	private supportsFixedTarget(t: TowerBuilding): boolean {
		return t.spec.arcHeight > 0;
	}

	private enterTargeting(tower: TowerBuilding): void {
		this.closeUpgradePanel();
		this.targetingTower = tower;
		this.targetingHint = this.add
			.text(0, 0, 'Click to set fire point · Esc to cancel', {
				fontFamily: 'monospace',
				fontSize: '11px',
				color: COLORS.hudText,
				backgroundColor: '#1f2937',
				padding: { x: 6, y: 3 },
			})
			.setDepth(110);
	}

	private cancelTargeting(): void {
		this.targetingTower = null;
		if (this.targetingHint) {
			this.targetingHint.destroy();
			this.targetingHint = null;
		}
	}

	private setFixedTarget(t: TowerBuilding, x: number, y: number): void {
		this.clearFixedTarget(t);
		const marker = this.add.graphics().setDepth(50);
		marker.lineStyle(2, t.spec.color, 0.85);
		marker.strokeCircle(x, y, 14);
		marker.lineBetween(x - 18, y, x - 6, y);
		marker.lineBetween(x + 6, y, x + 18, y);
		marker.lineBetween(x, y - 18, x, y - 6);
		marker.lineBetween(x, y + 6, x, y + 18);
		t.fixedTarget = { x, y, marker };
	}

	private clearFixedTarget(t: TowerBuilding): void {
		if (t.fixedTarget) {
			t.fixedTarget.marker.destroy();
			t.fixedTarget = null;
		}
	}

	private closeUpgradePanel(): void {
		if (this.upgradePanel) {
			this.upgradePanel.destroy(true);
			this.upgradePanel = null;
		}
		if (this.upgradeRangeIndicator) {
			this.upgradeRangeIndicator.destroy();
			this.upgradeRangeIndicator = null;
		}
		this.upgradeTarget = null;
		this.upgradeBounds = null;
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

		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, BuildingTag);
		Position.x[eid] = x;
		Position.y[eid] = y;
		const base: BaseBuilding = {
			id: eid,
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
			addComponent(this.world, eid, TowerTag);
			const powerIndicator = this.add.circle(
				x + TILE * 0.3,
				y - TILE * 0.3,
				4,
				0x9ae6b4,
			);
			const upgradePips = this.add.graphics();
			const b: TowerBuilding = {
				...base,
				kind: 'tower',
				spec: spec as TowerSpec,
				lastFireAtMs: 0,
				online: true,
				powerIndicator,
				upgrades: { radar: 0, attack: 0, speed: 0, armor: 0 },
				fixedTarget: null,
				upgradePips,
			};
			this.redrawUpgradePips(b);
			building = b;
		} else if (spec.kind === 'generator') {
			addComponent(this.world, eid, GeneratorTag);
			const b: GeneratorBuilding = {
				...base,
				kind: 'generator',
				spec: spec as GeneratorSpec,
				online: true,
			};
			building = b;
		} else if (spec.kind === 'battery') {
			addComponent(this.world, eid, BatteryTag);
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
			addComponent(this.world, eid, RepairTag);
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
				activeDroneEid: null,
			};
			building = b;
		} else if (spec.kind === 'armoury') {
			addComponent(this.world, eid, ArmouryTag);
			const powerIndicator = this.add.circle(
				x + TILE * 0.3,
				y - TILE * 0.3,
				4,
				0x9ae6b4,
			);
			const b: ArmouryBuilding = {
				...base,
				kind: 'armoury',
				spec: spec as ArmourySpec,
				online: true,
				powerIndicator,
				nextSpawnAtMs: 0,
			};
			building = b;
		} else {
			throw new Error(
				`unknown build kind: ${(spec as { kind: string }).kind}`,
			);
		}

		this.buildings.push(building);
		this.buildingByEid.set(eid, building);
		return building;
	}

	private recomputePower(dt: number): void {
		const result = computeAndApplyPower(this.buildings, dt);
		this.cachedPower.supply = result.supply;
		this.cachedPower.demand = result.demand;
		this.cachedPower.batteryCharge = result.batteryCharge;
		this.cachedPower.batteryCapacity = result.batteryCapacity;
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
			} else if (b.kind === 'armoury') {
				b.sprite.setAlpha(b.online ? 1 : 0.45);
				b.powerIndicator.setFillStyle(b.online ? 0x9ae6b4 : 0xfc8181);
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
		const bossWave = this.wave % 5 === 0;
		this.pendingBosses = bossWave ? 1 : 0;
		this.enemiesToSpawn = count + this.pendingBosses;
		this.spawnAccumulatorMs = 0;
		this.cardPickedThisInterval = false;
		const armouryNow = this.time.now;
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			if (b.kind === 'armoury') b.nextSpawnAtMs = armouryNow;
		}
		this.showWaveSplash();
	}

	private showWaveSplash(): void {
		const splash = this.add
			.text(BASE_WIDTH / 2, BASE_HEIGHT / 2 - 40, `WAVE ${this.wave}`, {
				fontFamily: 'monospace',
				fontSize: '64px',
				color: COLORS.hudText,
				fontStyle: 'bold',
				stroke: '#000000',
				strokeThickness: 6,
			})
			.setOrigin(0.5)
			.setDepth(140)
			.setAlpha(0);
		this.tweens.add({
			targets: splash,
			alpha: 1,
			duration: 220,
			yoyo: true,
			hold: 700,
			onComplete: () => splash.destroy(),
		});
	}

	private flashSprite(
		sprite: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Arc,
		color: number,
	): void {
		const original = sprite.fillColor;
		sprite.setFillStyle(color);
		this.time.delayedCall(80, () => {
			if (!sprite.scene) return;
			sprite.setFillStyle(original);
		});
	}

	private spawnEnemy(): void {
		const start = this.path.waypoints[0];
		let typeId: EnemyTypeId;
		if (this.pendingBosses > 0) {
			this.pendingBosses -= 1;
			typeId = 'boss';
		} else {
			typeId = rollEnemyType(this.wave);
		}
		const type = ENEMY_CATALOG[typeId];
		const baseHp = Math.floor(
			GAME_CONFIG.enemyBaseHp *
				Math.pow(GAME_CONFIG.enemyHpScale, this.wave - 1),
		);
		const hp = Math.floor(baseHp * type.hpMultiplier);
		const baseSpeed = GAME_CONFIG.enemyBaseSpeed + (this.wave - 1) * 4;
		const speed = baseSpeed * type.speedMultiplier;
		const attackDamage = type.canAttack
			? type.attackDamage +
				(this.wave - 1) * GAME_CONFIG.enemyAttackDamageScale
			: 0;
		const radius = TILE * type.sizeRadius;
		const sprite = this.add.circle(start.x, start.y, radius, type.color);
		const statusRing = this.add.graphics().setVisible(false);
		const ringRadius = radius + 4;
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
		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, EnemyTag);
		addComponent(this.world, eid, EnemyStats);
		Position.x[eid] = start.x;
		Position.y[eid] = start.y;
		EnemyStats.hp[eid] = hp;
		EnemyStats.maxHp[eid] = hp;
		EnemyStats.baseSpeed[eid] = speed;
		EnemyStats.pathIndex[eid] = 1;
		EnemyStats.slowUntilMs[eid] = 0;
		EnemyStats.slowDurationMs[eid] = 0;
		EnemyStats.slowFactor[eid] = 1;
		EnemyStats.burnUntilMs[eid] = 0;
		EnemyStats.burnDps[eid] = 0;
		EnemyStats.attackDamage[eid] = attackDamage;
		EnemyStats.attackRateMs[eid] = type.attackRateMs;
		EnemyStats.attackRange[eid] = type.attackRange;
		EnemyStats.lastAttackAtMs[eid] = 0;
		EnemyStats.canAttack[eid] = type.canAttack ? 1 : 0;
		EnemyStats.defense[eid] = type.defense;
		EnemyStats.bountyMultiplier[eid] = type.bountyMultiplier;
		EnemyStats.typeIndex[eid] = enemyTypeIndexFromId(type.id);
		this.enemyVisuals.set(eid, {
			sprite,
			statusRing,
			hpBar,
			hpBarBg,
			ringRadius,
			attackTarget: null,
		});
	}

	private findAttackTarget(eid: number): AttackTarget | null {
		const range = EnemyStats.attackRange[eid];
		if (range <= 0) return null;
		const ex = Position.x[eid];
		const ey = Position.y[eid];
		let best: AttackTarget | null = null;
		let bestDist2 = range * range;
		for (const beid of this.frameBuildingEids) {
			const b = this.buildingByEid.get(beid);
			if (!b || b.destroyed) continue;
			const dx = Position.x[beid] - ex;
			const dy = Position.y[beid] - ey;
			const d2 = dx * dx + dy * dy;
			if (d2 <= bestDist2) {
				bestDist2 = d2;
				best = { kind: 'building', b };
			}
		}
		for (const seid of this.frameSoldierEids) {
			if (!this.soldierVisuals.has(seid)) continue;
			const dx = Position.x[seid] - ex;
			const dy = Position.y[seid] - ey;
			const d2 = dx * dx + dy * dy;
			if (d2 <= bestDist2) {
				bestDist2 = d2;
				best = { kind: 'soldier', eid: seid };
			}
		}
		return best;
	}

	private attackTargetPos(t: AttackTarget): { x: number; y: number } {
		if (t.kind === 'building') return { x: t.b.x, y: t.b.y };
		return { x: Position.x[t.eid], y: Position.y[t.eid] };
	}

	private attackTargetAlive(t: AttackTarget): boolean {
		if (t.kind === 'building') return !t.b.destroyed;
		return this.soldierVisuals.has(t.eid);
	}

	private applyAttackTargetDamage(t: AttackTarget, dmg: number): void {
		if (t.kind === 'building') this.damageBuilding(t.b, dmg);
		else this.damageSoldier(t.eid, dmg);
	}

	private damageBuilding(b: Building, dmg: number): void {
		const reduced = Math.max(1, dmg - b.spec.defense);
		b.hp -= reduced;
		if (b.hp <= 0) {
			this.destroyBuilding(b);
		} else {
			this.flashSprite(b.sprite, 0xffffff);
		}
	}

	private destroyBuilding(b: Building): void {
		if (b.destroyed) return;
		b.destroyed = true;
		b.sprite.destroy();
		b.hpBar.destroy();
		b.hpBarBg.destroy();
		if (b.kind === 'tower' || b.kind === 'repair' || b.kind === 'armoury') {
			b.powerIndicator.destroy();
		}
		if (b.kind === 'tower' && b.fixedTarget) {
			b.fixedTarget.marker.destroy();
			b.fixedTarget = null;
		}
		if (b.kind === 'tower') {
			b.upgradePips.destroy();
		}
		if (b.kind === 'battery') {
			b.chargeBar.destroy();
			b.chargeBarBg.destroy();
		}
		if (this.targetingTower === b) this.cancelTargeting();
		for (const v of this.enemyVisuals.values()) {
			if (
				v.attackTarget &&
				v.attackTarget.kind === 'building' &&
				v.attackTarget.b === b
			) {
				v.attackTarget = null;
			}
		}
		const droneKills: number[] = [];
		for (const [deid, dv] of this.droneVisuals.entries()) {
			if (dv.target === b || dv.station === b) droneKills.push(deid);
		}
		for (const deid of droneKills) this.killDrone(deid);
		this.buildingByEid.delete(b.id);
		removeEntity(this.world, b.id);
		if (this.upgradeTarget === b) this.closeUpgradePanel();
	}

	private killDrone(eid: number): void {
		const v = this.droneVisuals.delete(eid);
		if (!v) return;
		v.sprite.destroy();
		v.beam.destroy();
		if (v.station.kind === 'repair' && v.station.activeDroneEid === eid) {
			v.station.activeDroneEid = null;
		}
		removeEntity(this.world, eid);
	}

	private updateArmouries(nowMs: number): void {
		const waveActive =
			this.enemiesToSpawn > 0 || this.enemyVisuals.size > 0;
		if (!waveActive) return;
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			if (b.kind !== 'armoury') continue;
			if (!b.online) continue;
			if (nowMs < b.nextSpawnAtMs) continue;
			this.spawnSoldier(b);
			b.nextSpawnAtMs = nowMs + b.spec.spawnIntervalMs;
		}
	}

	private spawnSoldier(armoury: ArmouryBuilding): void {
		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, SoldierTag);
		addComponent(this.world, eid, SoldierStats);
		Position.x[eid] = armoury.x;
		Position.y[eid] = armoury.y;
		SoldierStats.hp[eid] = armoury.spec.soldierHp;
		SoldierStats.maxHp[eid] = armoury.spec.soldierHp;
		SoldierStats.speed[eid] = armoury.spec.soldierSpeed;
		SoldierStats.attackDamage[eid] = armoury.spec.soldierDamage;
		SoldierStats.attackRateMs[eid] = armoury.spec.soldierAttackRateMs;
		SoldierStats.attackRange[eid] = armoury.spec.soldierAttackRange;
		SoldierStats.lastAttackAtMs[eid] = 0;
		SoldierStats.targetEnemyEid[eid] = 0;
		SoldierStats.armouryEid[eid] = armoury.id;
		const sprite = this.add.rectangle(
			armoury.x,
			armoury.y,
			TILE * 0.3,
			TILE * 0.3,
			armoury.spec.soldierColor,
		);
		sprite.setStrokeStyle(1, 0xffffff, 0.6);
		const barWidth = TILE * 0.5;
		const hpBarBg = this.add
			.rectangle(
				armoury.x,
				armoury.y - TILE * 0.32,
				barWidth,
				3,
				COLORS.enemyHpBarBg,
			)
			.setOrigin(0.5);
		const hpBar = this.add
			.rectangle(
				armoury.x - barWidth / 2,
				armoury.y - TILE * 0.32,
				barWidth,
				3,
				COLORS.enemyHpBar,
			)
			.setOrigin(0, 0.5);
		this.soldierVisuals.set(eid, { sprite, hpBar, hpBarBg });
	}

	private findEnemyForSoldier(seid: number): number {
		const sx = Position.x[seid];
		const sy = Position.y[seid];
		const armouryEid = SoldierStats.armouryEid[seid];
		const armoury = this.buildingByEid.get(armouryEid);
		const ax = armoury && !armoury.destroyed ? armoury.x : sx;
		const ay = armoury && !armoury.destroyed ? armoury.y : sy;
		const roam =
			armoury && armoury.kind === 'armoury'
				? armoury.spec.soldierRoamRange
				: 240;
		const roamSq = roam * roam;
		let best = -1;
		let bestDist2 = Infinity;
		for (const eeid of this.frameEnemyEids) {
			if (!this.enemyVisuals.has(eeid)) continue;
			const adx = Position.x[eeid] - ax;
			const ady = Position.y[eeid] - ay;
			if (adx * adx + ady * ady > roamSq) continue;
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

	private damageSoldier(eid: number, dmg: number): void {
		if (!this.soldierVisuals.has(eid)) return;
		SoldierStats.hp[eid] -= dmg;
		if (SoldierStats.hp[eid] > 0) {
			const v = this.soldierVisuals.get(eid);
			if (v) this.flashSprite(v.sprite, 0xffffff);
		}
		if (SoldierStats.hp[eid] <= 0) this.killSoldier(eid);
	}

	private killSoldier(eid: number): void {
		const v = this.soldierVisuals.delete(eid);
		if (!v) return;
		v.sprite.destroy();
		v.hpBar.destroy();
		v.hpBarBg.destroy();
		for (const ev of this.enemyVisuals.values()) {
			if (
				ev.attackTarget &&
				ev.attackTarget.kind === 'soldier' &&
				ev.attackTarget.eid === eid
			) {
				ev.attackTarget = null;
			}
		}
		removeEntity(this.world, eid);
	}

	private despawnAllSoldiers(): void {
		const eids: number[] = [];
		for (const eid of this.soldierVisuals.entries()) eids.push(eid[0]);
		for (const eid of eids) this.killSoldier(eid);
	}

	private updateSoldiers(dt: number, nowMs: number): void {
		for (const seid of this.frameSoldierEids) {
			if (!this.soldierVisuals.has(seid)) continue;
			let target = SoldierStats.targetEnemyEid[seid];
			if (target === 0 || !this.enemyVisuals.has(target)) {
				target = this.findEnemyForSoldier(seid);
				SoldierStats.targetEnemyEid[seid] = target >= 0 ? target : 0;
			}
			if (SoldierStats.targetEnemyEid[seid] === 0) {
				this.syncSoldierVisuals(seid);
				continue;
			}
			target = SoldierStats.targetEnemyEid[seid];
			const tx = Position.x[target];
			const ty = Position.y[target];
			const dx = tx - Position.x[seid];
			const dy = ty - Position.y[seid];
			const dist = Math.hypot(dx, dy);
			const range = SoldierStats.attackRange[seid];
			if (dist <= range) {
				if (
					nowMs - SoldierStats.lastAttackAtMs[seid] >=
					SoldierStats.attackRateMs[seid]
				) {
					SoldierStats.lastAttackAtMs[seid] = nowMs;
					this.damageEnemy(target, SoldierStats.attackDamage[seid]);
				}
			} else {
				const step = SoldierStats.speed[seid] * dt;
				if (step >= dist) {
					Position.x[seid] = tx;
					Position.y[seid] = ty;
				} else {
					Position.x[seid] += (dx / dist) * step;
					Position.y[seid] += (dy / dist) * step;
				}
			}
			this.syncSoldierVisuals(seid);
		}
	}

	private syncSoldierVisuals(seid: number): void {
		const v = this.soldierVisuals.get(seid);
		if (!v) return;
		const x = Position.x[seid];
		const y = Position.y[seid];
		v.sprite.setPosition(x, y);
		const barWidth = TILE * 0.5;
		v.hpBarBg.setPosition(x, y - TILE * 0.32);
		v.hpBar.setPosition(x - barWidth / 2, y - TILE * 0.32);
		v.hpBar.width =
			(SoldierStats.hp[seid] / SoldierStats.maxHp[seid]) * barWidth;
	}

	private updateEnemies(dt: number, nowMs: number): void {
		for (const eid of this.frameEnemyEids) {
			if (!this.enemyVisuals.has(eid)) continue;
			if (
				EnemyStats.burnUntilMs[eid] > nowMs &&
				EnemyStats.burnDps[eid] > 0
			) {
				EnemyStats.hp[eid] -= EnemyStats.burnDps[eid] * dt;
				if (EnemyStats.hp[eid] <= 0) {
					this.killEnemy(eid, true);
					continue;
				}
			}

			if (EnemyStats.canAttack[eid] === 1) {
				const v = this.enemyVisuals.get(eid)!;
				if (v.attackTarget && !this.attackTargetAlive(v.attackTarget))
					v.attackTarget = null;
				if (!v.attackTarget) {
					v.attackTarget = this.findAttackTarget(eid);
				} else {
					const pos = this.attackTargetPos(v.attackTarget);
					const dx = pos.x - Position.x[eid];
					const dy = pos.y - Position.y[eid];
					const range = EnemyStats.attackRange[eid];
					if (dx * dx + dy * dy > range * range * 2.25) {
						v.attackTarget = null;
					}
				}

				if (v.attackTarget) {
					if (
						nowMs - EnemyStats.lastAttackAtMs[eid] >=
						EnemyStats.attackRateMs[eid]
					) {
						EnemyStats.lastAttackAtMs[eid] = nowMs;
						this.applyAttackTargetDamage(
							v.attackTarget,
							EnemyStats.attackDamage[eid],
						);
					}
					const slowed = EnemyStats.slowUntilMs[eid] > nowMs;
					const baseSpeed = EnemyStats.baseSpeed[eid];
					const speed =
						(slowed
							? baseSpeed * EnemyStats.slowFactor[eid]
							: baseSpeed) * GAME_CONFIG.enemyAttackSpeedFactor;
					if (speed > 0) this.moveAlongPath(eid, speed, dt);
					this.updateEnemyVisuals(eid, nowMs);
					continue;
				}
			}

			const slowed = EnemyStats.slowUntilMs[eid] > nowMs;
			const baseSpeed = EnemyStats.baseSpeed[eid];
			const speed = slowed
				? baseSpeed * EnemyStats.slowFactor[eid]
				: baseSpeed;
			this.moveAlongPath(eid, speed, dt);
			this.updateEnemyVisuals(eid, nowMs);
		}
	}

	private moveAlongPath(eid: number, speed: number, dt: number): void {
		const target: Waypoint | undefined =
			this.path.waypoints[EnemyStats.pathIndex[eid]];
		if (!target) {
			this.killEnemy(eid, false);
			this.lives -= 1;
			if (this.lives <= 0) this.endGame(false);
			return;
		}
		const px = Position.x[eid];
		const py = Position.y[eid];
		const dx = target.x - px;
		const dy = target.y - py;
		const dist = Math.hypot(dx, dy);
		const step = speed * dt;
		if (step >= dist) {
			Position.x[eid] = target.x;
			Position.y[eid] = target.y;
			EnemyStats.pathIndex[eid] += 1;
		} else {
			Position.x[eid] = px + (dx / dist) * step;
			Position.y[eid] = py + (dy / dist) * step;
		}
	}

	private updateEnemyVisuals(eid: number, nowMs: number): void {
		const v = this.enemyVisuals.get(eid);
		if (!v) return;
		const x = Position.x[eid];
		const y = Position.y[eid];
		v.sprite.setPosition(x, y);
		v.hpBarBg.setPosition(x, y - TILE * 0.5);
		v.hpBar.setPosition(x - (TILE * 0.7) / 2, y - TILE * 0.5);
		v.hpBar.width =
			(EnemyStats.hp[eid] / EnemyStats.maxHp[eid]) * TILE * 0.7;
		const slowed = EnemyStats.slowUntilMs[eid] > nowMs;
		const burning = EnemyStats.burnUntilMs[eid] > nowMs;
		v.statusRing.clear();
		if (slowed || burning) {
			v.statusRing.setVisible(true);
			if (slowed) {
				const dur = EnemyStats.slowDurationMs[eid];
				const slowRatio =
					dur > 0
						? Math.max(
								0,
								Math.min(
									1,
									(EnemyStats.slowUntilMs[eid] - nowMs) / dur,
								),
							)
						: 0;
				v.statusRing.lineStyle(3, COLORS.statusSlow, 0.85);
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
				v.statusRing.lineStyle(2, COLORS.statusBurn, 0.8);
				v.statusRing.strokeCircle(
					x,
					y,
					v.ringRadius + (slowed ? 4 : 0),
				);
			}
		} else {
			v.statusRing.setVisible(false);
		}
	}

	private updateTowers(nowMs: number): void {
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			if (b.kind !== 'tower') continue;
			if (!b.online) continue;
			if (nowMs - b.lastFireAtMs < towerFireRateMs(b)) continue;
			if (b.fixedTarget) {
				b.lastFireAtMs = nowMs;
				this.fireAt(b, b.fixedTarget.x, b.fixedTarget.y, null);
				continue;
			}
			const targetEid = this.findTarget(b, nowMs);
			if (targetEid === null) continue;
			b.lastFireAtMs = nowMs;
			this.fireAt(
				b,
				Position.x[targetEid],
				Position.y[targetEid],
				targetEid,
			);
		}
	}

	private findTarget(t: TowerBuilding, nowMs: number): number | null {
		let best = -1;
		let bestProgress = -1;
		const range = towerRange(t);
		const rangeSq = range * range;
		const skipSlowed = t.spec.avoidSlowed;
		for (const eid of this.frameEnemyEids) {
			if (!this.enemyVisuals.has(eid)) continue;
			if (skipSlowed && EnemyStats.slowUntilMs[eid] > nowMs) continue;
			const dx = Position.x[eid] - t.x;
			const dy = Position.y[eid] - t.y;
			if (dx * dx + dy * dy > rangeSq) continue;
			const prog = EnemyStats.pathIndex[eid];
			if (prog > bestProgress) {
				bestProgress = prog;
				best = eid;
			}
		}
		return best >= 0 ? best : null;
	}

	private fireAt(
		t: TowerBuilding,
		targetX: number,
		targetY: number,
		enemyId: number | null,
	): void {
		const radius = t.spec.arcHeight > 0 ? 6 : 4;
		const sprite = this.add.circle(
			t.x,
			t.y,
			radius,
			t.spec.projectileColor,
		);
		const totalDist = Math.hypot(targetX - t.x, targetY - t.y);
		this.projectiles.push({
			sprite,
			tower: t,
			startX: t.x,
			startY: t.y,
			targetX,
			targetY,
			enemyId: t.spec.homing ? enemyId : null,
			speed: t.spec.projectileSpeed,
			alive: true,
			homing: t.spec.homing,
			arcHeight: t.spec.arcHeight,
			traveled: 0,
			totalDist,
		});
	}

	private isEnemyAlive(eid: number | null): eid is number {
		return eid !== null && this.enemyVisuals.has(eid);
	}

	private updateProjectiles(dt: number, nowMs: number): void {
		for (const p of this.projectiles) {
			if (!p.alive) continue;
			if (p.homing) {
				if (this.isEnemyAlive(p.enemyId)) {
					p.targetX = Position.x[p.enemyId];
					p.targetY = Position.y[p.enemyId];
				}
				const dx = p.targetX - p.sprite.x;
				const dy = p.targetY - p.sprite.y;
				const dist = Math.hypot(dx, dy);
				const step = p.speed * dt;
				if (step >= dist) {
					this.applyHit(p, nowMs, p.sprite.x, p.sprite.y);
					p.alive = false;
					p.sprite.destroy();
				} else {
					p.sprite.x += (dx / dist) * step;
					p.sprite.y += (dy / dist) * step;
				}
			} else {
				p.traveled += p.speed * dt;
				const t =
					p.totalDist > 0 ? Math.min(1, p.traveled / p.totalDist) : 1;
				const baseX = p.startX + (p.targetX - p.startX) * t;
				const baseY = p.startY + (p.targetY - p.startY) * t;
				const arcOffset = -Math.sin(Math.PI * t) * p.arcHeight;
				p.sprite.x = baseX;
				p.sprite.y = baseY + arcOffset;
				if (t >= 1) {
					this.applyHit(p, nowMs, p.targetX, p.targetY);
					p.alive = false;
					p.sprite.destroy();
				}
			}
		}
		this.projectiles = this.projectiles.filter((p) => p.alive);
	}

	private applyHit(p: Projectile, nowMs: number, x: number, y: number): void {
		const spec = p.tower.spec;
		const damage = towerDamage(p.tower);
		const burnDps = towerBurnDps(p.tower);
		if (burnDps > 0 && spec.burnMs > 0 && spec.burnRadius > 0) {
			this.spawnBurnPatch(
				x,
				y,
				spec.burnRadius,
				burnDps,
				nowMs + spec.burnMs,
			);
			return;
		}
		if (spec.splashRadius > 0) {
			const r2 = spec.splashRadius * spec.splashRadius;
			for (const eid of this.frameEnemyEids) {
				if (!this.enemyVisuals.has(eid)) continue;
				const dx = Position.x[eid] - x;
				const dy = Position.y[eid] - y;
				if (dx * dx + dy * dy <= r2) {
					this.damageEnemy(eid, damage);
				}
			}
			this.spawnSplashFlash(x, y, spec.splashRadius);
			return;
		}
		if (this.isEnemyAlive(p.enemyId)) {
			this.damageEnemy(p.enemyId, damage);
			if (this.isEnemyAlive(p.enemyId) && spec.slowMs > 0) {
				EnemyStats.slowUntilMs[p.enemyId] = Math.max(
					EnemyStats.slowUntilMs[p.enemyId],
					nowMs + spec.slowMs,
				);
				EnemyStats.slowDurationMs[p.enemyId] = spec.slowMs;
				EnemyStats.slowFactor[p.enemyId] = spec.slowFactor;
			}
		}
	}

	private damageEnemy(eid: number, dmg: number): void {
		const reduced = Math.max(1, dmg - EnemyStats.defense[eid]);
		EnemyStats.hp[eid] -= reduced;
		if (EnemyStats.hp[eid] <= 0) {
			this.killEnemy(eid, true);
			return;
		}
		const v = this.enemyVisuals.get(eid);
		if (v) this.flashSprite(v.sprite, 0xffffff);
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
			const r2 = patch.radius * patch.radius;
			for (const eid of this.frameEnemyEids) {
				if (!this.enemyVisuals.has(eid)) continue;
				const dx = Position.x[eid] - patch.x;
				const dy = Position.y[eid] - patch.y;
				if (dx * dx + dy * dy <= r2) {
					EnemyStats.burnUntilMs[eid] = Math.max(
						EnemyStats.burnUntilMs[eid],
						nowMs + 500,
					);
					EnemyStats.burnDps[eid] = Math.max(
						EnemyStats.burnDps[eid],
						patch.dps,
					);
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
			if (
				b.activeDroneEid !== null &&
				this.droneVisuals.has(b.activeDroneEid)
			)
				continue;
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

		const deathRow: number[] = [];
		for (const deid of query(this.world, [
			DroneTag,
			Position,
			DroneStats,
		])) {
			const v = this.droneVisuals.get(deid);
			if (!v) continue;
			if (v.target.destroyed) {
				deathRow.push(deid);
				continue;
			}
			const dest =
				DroneStats.state[deid] === DroneState.Outbound
					? v.target
					: v.station;
			const dx = dest.x - Position.x[deid];
			const dy = dest.y - Position.y[deid];
			const dist = Math.hypot(dx, dy);
			const step = DroneStats.speed[deid] * dt;
			if (step >= dist) {
				Position.x[deid] = dest.x;
				Position.y[deid] = dest.y;
				if (DroneStats.state[deid] === DroneState.Outbound) {
					v.target.hp = Math.min(
						v.target.maxHp,
						v.target.hp + v.repairAmount,
					);
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
			v.beam.clear();
			if (DroneStats.state[deid] === DroneState.Outbound) {
				v.beam.lineStyle(2, COLORS.repairBeam, 0.7);
				v.beam.lineBetween(
					Position.x[deid],
					Position.y[deid],
					v.target.x,
					v.target.y,
				);
			}
		}
		for (const deid of deathRow) this.killDrone(deid);
	}

	private findRepairTarget(station: RepairBuilding): Building | null {
		let best: Building | null = null;
		let bestRatio = 1;
		for (const beid of this.frameBuildingEids) {
			const b = this.buildingByEid.get(beid);
			if (!b || b.destroyed) continue;
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
		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, DroneTag);
		addComponent(this.world, eid, DroneStats);
		Position.x[eid] = station.x;
		Position.y[eid] = station.y;
		DroneStats.speed[eid] = GAME_CONFIG.repairDroneSpeed;
		DroneStats.state[eid] = DroneState.Outbound;
		this.droneVisuals.set(eid, {
			sprite,
			beam,
			station,
			target,
			repairAmount: station.spec.repairAmount,
		});
		station.activeDroneEid = eid;
	}

	private killEnemy(eid: number, reward: boolean): void {
		const v = this.enemyVisuals.delete(eid);
		if (!v) return;
		v.sprite.destroy();
		v.statusRing.destroy();
		v.hpBar.destroy();
		v.hpBarBg.destroy();
		if (reward) {
			this.gold += Math.round(
				GAME_CONFIG.goldPerKill *
					EnemyStats.bountyMultiplier[eid] *
					this.bountyBonusMultiplier,
			);
		}
		removeEntity(this.world, eid);
	}

	private endGame(win: boolean): void {
		this.isGameOver = true;
		this.placementPreview.setVisible(false);
		this.placementRange.setVisible(false);
		this.add
			.rectangle(
				BASE_WIDTH / 2,
				BASE_HEIGHT / 2,
				BASE_WIDTH,
				BASE_HEIGHT,
				0x000000,
				0.55,
			)
			.setDepth(149);
		this.gameOverText = this.add
			.text(
				BASE_WIDTH / 2,
				BASE_HEIGHT / 2 - 40,
				`${win ? 'Victory' : 'Defeat'} — wave ${this.wave}`,
				{
					fontFamily: 'monospace',
					fontSize: '36px',
					color: win ? '#48bb78' : '#fc8181',
					align: 'center',
					fontStyle: 'bold',
				},
			)
			.setOrigin(0.5)
			.setDepth(150);
		const btnBg = this.add
			.rectangle(
				BASE_WIDTH / 2,
				BASE_HEIGHT / 2 + 40,
				220,
				56,
				0x111827,
				0.95,
			)
			.setStrokeStyle(2, 0xfbd38d, 0.9)
			.setDepth(150)
			.setInteractive({ useHandCursor: true });
		this.add
			.text(BASE_WIDTH / 2, BASE_HEIGHT / 2 + 40, 'RESTART', {
				fontFamily: 'monospace',
				fontSize: '20px',
				color: '#fbd38d',
				fontStyle: 'bold',
			})
			.setOrigin(0.5)
			.setDepth(150);
		this.add
			.text(BASE_WIDTH / 2, BASE_HEIGHT / 2 + 86, 'or press R', {
				fontFamily: 'monospace',
				fontSize: '11px',
				color: '#a0aec0',
			})
			.setOrigin(0.5)
			.setDepth(150);
		btnBg.on('pointerdown', () => this.scene.restart());
	}

	update(_time: number, deltaMs: number): void {
		if (this.isGameOver) return;
		if (this.awaitingCardPick) {
			this.refreshHud();
			return;
		}
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
		} else if (this.enemyVisuals.size === 0) {
			if (
				this.wave >= 1 &&
				!this.cardPickedThisInterval &&
				!this.cardPanel
			) {
				this.despawnAllSoldiers();
				this.openCardPanel();
			} else {
				this.interWaveDelayMs -= deltaMs;
				if (this.interWaveDelayMs <= 0) {
					this.interWaveDelayMs = GAME_CONFIG.waveDelayMs;
					this.startNextWave();
				}
			}
		}

		this.frameEnemyEids = query(this.world, [
			EnemyTag,
			Position,
			EnemyStats,
		]);
		this.frameSoldierEids = query(this.world, [
			SoldierTag,
			Position,
			SoldierStats,
		]);
		this.frameBuildingEids = query(this.world, [BuildingTag, Position]);

		this.updateBurnPatches(dt, nowMs);
		this.updateEnemies(dt, nowMs);
		this.updateTowers(nowMs);
		this.updateProjectiles(dt, nowMs);
		this.updateRepair(dt);
		this.updateArmouries(nowMs);
		this.updateSoldiers(dt, nowMs);

		this.powerRefreshAccumulatorMs += deltaMs;
		if (this.powerRefreshAccumulatorMs >= 100) {
			this.recomputePower(this.powerRefreshAccumulatorMs / 1000);
			this.powerRefreshAccumulatorMs = 0;
		}

		this.refreshHud();
	}

	private openCardPanel(): void {
		this.awaitingCardPick = true;
		this.bountyBonusMultiplier = 1;
		const cards = pickThreeCards();
		const panelW = 720;
		const panelH = 260;
		const panelX = (BASE_WIDTH - panelW) / 2;
		const panelY = (BASE_HEIGHT - panelH) / 2;
		this.cardBackdrop = this.add
			.rectangle(
				BASE_WIDTH / 2,
				BASE_HEIGHT / 2,
				BASE_WIDTH,
				BASE_HEIGHT,
				0x000000,
				0.6,
			)
			.setDepth(195);
		const container = this.add.container(panelX, panelY).setDepth(200);
		const bg = this.add
			.rectangle(0, 0, panelW, panelH, COLORS.hudPanel, 0.97)
			.setStrokeStyle(2, COLORS.paletteSelected)
			.setOrigin(0, 0);
		container.add(bg);
		const title = this.add
			.text(panelW / 2, 14, `Wave ${this.wave} Cleared — Pick a Reward`, {
				fontFamily: 'monospace',
				fontSize: '18px',
				color: COLORS.hudText,
				fontStyle: 'bold',
			})
			.setOrigin(0.5, 0);
		container.add(title);

		const cardW = 200;
		const cardH = 180;
		const gap = 24;
		const startX = (panelW - (cardW * 3 + gap * 2)) / 2;
		for (let i = 0; i < cards.length; i++) {
			const card = cards[i];
			const cx = startX + i * (cardW + gap);
			const cy = 50;
			const cardBg = this.add
				.rectangle(cx, cy, cardW, cardH, 0x1f2937, 0.95)
				.setStrokeStyle(2, card.color, 0.85)
				.setOrigin(0, 0)
				.setInteractive({ useHandCursor: true });
			container.add(cardBg);
			const icon = this.add.rectangle(
				cx + cardW / 2,
				cy + 28,
				36,
				36,
				card.color,
			);
			container.add(icon);
			const name = this.add
				.text(cx + cardW / 2, cy + 64, card.name, {
					fontFamily: 'monospace',
					fontSize: '15px',
					color: COLORS.hudText,
					fontStyle: 'bold',
				})
				.setOrigin(0.5, 0);
			container.add(name);
			const desc = this.add
				.text(cx + cardW / 2, cy + 90, card.description, {
					fontFamily: 'monospace',
					fontSize: '11px',
					color: COLORS.hudDim,
					wordWrap: { width: cardW - 16 },
					align: 'center',
				})
				.setOrigin(0.5, 0);
			container.add(desc);
			cardBg.on(
				'pointerdown',
				(
					_p: Phaser.Input.Pointer,
					_x: number,
					_y: number,
					ev: Phaser.Types.Input.EventData,
				) => {
					ev.stopPropagation();
					this.applyCardPick(card);
				},
			);
		}
		this.cardPanel = container;
	}

	private applyCardPick(card: CardOption): void {
		switch (card.id) {
			case 'bonus_gold':
				this.gold += 150;
				break;
			case 'free_basic_tower':
				this.freeBasicTowers += 1;
				break;
			case 'soldier_squad':
				this.summonSoldierSquad(5);
				break;
			case 'field_repair':
				this.healAllBuildings();
				break;
			case 'battery_surge':
				this.boostBatteries(30);
				break;
			case 'wave_bounty':
				this.bountyBonusMultiplier = 1.5;
				break;
		}
		this.closeCardPanel();
		this.cardPickedThisInterval = true;
		this.interWaveDelayMs = 1500;
	}

	private closeCardPanel(): void {
		if (this.cardPanel) {
			this.cardPanel.destroy(true);
			this.cardPanel = null;
		}
		if (this.cardBackdrop) {
			this.cardBackdrop.destroy();
			this.cardBackdrop = null;
		}
		this.awaitingCardPick = false;
	}

	private summonSoldierSquad(count: number): void {
		const armouries: ArmouryBuilding[] = [];
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			if (b.kind !== 'armoury') continue;
			armouries.push(b);
		}
		if (armouries.length === 0) {
			this.gold += 60;
			return;
		}
		for (let i = 0; i < count; i++) {
			this.spawnSoldier(armouries[i % armouries.length]);
		}
	}

	private healAllBuildings(): void {
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			b.hp = b.maxHp;
		}
	}

	private boostBatteries(amount: number): void {
		let left = amount;
		for (const b of this.buildings) {
			if (b.destroyed) continue;
			if (b.kind !== 'battery') continue;
			const room = b.capacity - b.charge;
			const add = Math.min(room, left);
			b.charge += add;
			left -= add;
			if (left <= 0) break;
		}
	}
}
