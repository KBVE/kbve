import Phaser from 'phaser';
import {
	addComponent,
	addEntity,
	createWorld,
	hasComponent,
	query,
	removeComponent,
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
	ARMOURY_UPGRADE_DEFS,
	ARMOURY_UPGRADE_ORDER,
	REPAIR_UPGRADE_DEFS,
	REPAIR_UPGRADE_ORDER,
	UPGRADE_DEFS,
	UPGRADE_ORDER,
	armouryUpgradeCost,
	repairUpgradeCost,
	rollEnemyType,
	specFor,
	upgradeCost,
	type ArmourySpec,
	type ArmouryUpgradeKind,
	type BatterySpec,
	type BuildId,
	type EnemyTypeId,
	type GeneratorSpec,
	type RepairSpec,
	type RepairUpgradeKind,
	type TowerSpec,
	type UpgradeKind,
} from './config';
import {
	ArmouryState,
	ArmouryTag,
	ArmouryUpgradeStats,
	ATTACK_TARGET_KIND,
	BatteryState,
	BatteryTag,
	BUILDING_KIND,
	BuildingState,
	BuildingTag,
	buildIndexFromId,
	BurnPatchStats,
	BurnPatchTag,
	applyStatus,
	AURA_KIND,
	AuraEmitter,
	AuraEmitterTag,
	Armor,
	ArmorTag,
	clearStatus,
	DAMAGE_FLAG,
	DAMAGE_TYPE,
	DeadTag,
	Defense,
	DefenseTag,
	Health,
	HealthTag,
	ImmobileTag,
	hasStatus,
	initArmor,
	initAura,
	initDefense,
	initHealth,
	initMovement,
	initResistance,
	Movement,
	MovementTag,
	resistForType,
	Resistance,
	ResistanceTag,
	STATUS_KIND,
	statusExpiresAt,
	statusExtra,
	statusMagnitude,
	DroneStats,
	DroneState,
	DroneTag,
	EnemyStats,
	EnemyTag,
	ENEMY_TYPE_INDEX,
	enemyTypeIndexFromId,
	GeneratorTag,
	Position,
	ProjectileStats,
	ProjectileTag,
	RepairState,
	RepairTag,
	RepairUpgradeStats,
	SOLDIER_KIND,
	SoldierStats,
	SoldierTag,
	TowerState,
	TowerTag,
	TowerUpgradeStats,
	type BurnPatchVisual,
	type DroneVisual,
	type EnemyVisual,
	type ProjectileVisual,
	type SoldierVisual,
} from './components';
import {
	CARD_POOL,
	pickCardsForWave,
	type CardId,
	type CardOption,
} from './cards';
import {
	batteryCapacityAtom,
	batteryChargeAtom,
	bestWaveAtom,
	bountyMulAtom,
	canSkipAtom,
	cardOptionsAtom,
	cardPickSignalAtom,
	cardSkipSignalAtom,
	cardWaveAtom,
	demandAtom,
	enemiesLeftAtom,
	enemyHoverAtom,
	freeTowersAtom,
	gameOverAtom,
	goldAtom,
	inventoryAtom,
	inventoryOpenAtom,
	livesAtom,
	pendingItemTargetAtom,
	loadBestWave,
	nextWavePreviewAtom,
	resetHudStore,
	restartSignalAtom,
	saveBestWave,
	selectedBuildAtom,
	skipSignalAtom,
	speedFactorAtom,
	supplyAtom,
	timerSecAtom,
	timerStateAtom,
	useItemSignalAtom,
	waveAtom,
} from './td-hud-store';
import { createItem, type ItemId } from './items';
import { generatePath, type GeneratedPath } from './path-generator';
import {
	buildingTextureKey,
	ensureBuildingTextures,
	ensureEnemyTextures,
	enemyTextureKey,
} from './art/sprite-mint';
import { computeAndApplyPower } from './systems';
import { planStarterKit } from './starter-kit';
import {
	armouryMaxSoldiers,
	armourySoldierDamage,
	armourySoldierHp,
	armourySpawnIntervalMs,
	repairAmount,
	repairCooldownMs,
	repairRange,
	towerBurnDps,
	towerDamage,
	towerFireRateMs,
	towerMaxHp,
	towerRange,
} from './stats';
import type {
	ArmouryBuilding,
	BaseBuilding,
	BatteryBuilding,
	Building,
	GeneratorBuilding,
	RepairBuilding,
	TowerBuilding,
} from './types';

const HUD_HEIGHT = TILE * HUD_ROWS_TOP;
const PALETTE_HEIGHT = TILE * 2;

function refundForBuilding(b: Building): number {
	let value = b.spec.cost;
	if (b.kind === 'tower') {
		for (const kind of UPGRADE_ORDER) {
			const def = UPGRADE_DEFS[kind];
			const lvl = TowerUpgradeStats[kind][b.id];
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
	private static readonly ENEMY_GRID_CELL = 80;
	private static readonly ENEMY_GRID_COLS = Math.ceil(BASE_WIDTH / 80);
	private static readonly ENEMY_GRID_ROWS = Math.ceil(BASE_HEIGHT / 80);
	private enemyGrid: number[][] = [];
	private leadEnemyEid = -1;
	private leadPathIndex = -1;
	private frameGeneratorEids: number[] = [];
	private frameBatteryEids: number[] = [];
	private frameTowerEids: number[] = [];
	private frameArmouryEids: number[] = [];
	private frameRepairEids: number[] = [];
	private frameConsumerEids: number[] = [];
	private buildingByEid = new SideMap<Building>();
	private droneVisuals = new SideMap<DroneVisual>();
	private soldierVisuals = new SideMap<SoldierVisual>();
	private projectileVisuals = new SideMap<ProjectileVisual>();
	private projectileSpritePool: Phaser.GameObjects.Arc[] = [];
	private projectileDeathRow: number[] = [];
	private burnPatchVisuals = new SideMap<BurnPatchVisual>();
	private burnPatchDeathRow: number[] = [];
	private removeEntityQueue: number[] = [];
	private arcPool: Phaser.GameObjects.Arc[] = [];
	private rectPool: Phaser.GameObjects.Rectangle[] = [];
	private graphicsPool: Phaser.GameObjects.Graphics[] = [];
	private linePool: Phaser.GameObjects.Line[] = [];
	private imagePool: Phaser.GameObjects.Image[] = [];

	private freeBasicTowers = 0;
	private bountyBonusMultiplier = 1;
	private awaitingCardPick = false;
	private lastCardPickN = 0;
	private lastCardSkipN = 0;
	private lastUseItemN = 0;
	private cardPickedThisInterval = false;

	private gold = GAME_CONFIG.startingGold;
	private lives = GAME_CONFIG.startingLives;
	private wave = 0;
	private enemiesToSpawn = 0;
	private spawnAccumulatorMs = 0;
	private interWaveDelayMs = 0;
	private isGameOver = false;

	private hudUnsubs: Array<() => void> = [];
	private lastSkipSignal = 0;
	private lastRestartSignal = 0;
	private simNow = 0;
	private speedFactor = 1;

	private placementPreview!: Phaser.GameObjects.Rectangle;
	private placementRange!: Phaser.GameObjects.Arc;
	private hoverRangeIndicator: Phaser.GameObjects.Arc | null = null;
	private hoverRangeOwner: Building | null = null;

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
		const gridCells =
			TowerDefenseScene.ENEMY_GRID_COLS *
			TowerDefenseScene.ENEMY_GRID_ROWS;
		this.enemyGrid = new Array(gridCells);
		for (let i = 0; i < gridCells; i++) this.enemyGrid[i] = [];
		this.leadEnemyEid = -1;
		this.leadPathIndex = -1;
		this.frameGeneratorEids = [];
		this.frameBatteryEids = [];
		this.frameTowerEids = [];
		this.frameArmouryEids = [];
		this.frameRepairEids = [];
		this.frameConsumerEids = [];
		this.buildingByEid = new SideMap<Building>();
		this.droneVisuals = new SideMap<DroneVisual>();
		this.soldierVisuals = new SideMap<SoldierVisual>();
		this.projectileVisuals = new SideMap<ProjectileVisual>();
		this.projectileSpritePool = [];
		this.projectileDeathRow = [];
		this.burnPatchVisuals = new SideMap<BurnPatchVisual>();
		this.burnPatchDeathRow = [];
		this.removeEntityQueue = [];
		this.arcPool = [];
		this.rectPool = [];
		this.graphicsPool = [];
		this.linePool = [];
		this.imagePool = [];
		this.freeBasicTowers = 0;
		this.bountyBonusMultiplier = 1;
		this.awaitingCardPick = false;
		this.cardPickedThisInterval = false;
		this.lastCardPickN = cardPickSignalAtom.get().n;
		this.lastCardSkipN = cardSkipSignalAtom.get();
		this.lastUseItemN = useItemSignalAtom.get().n;
		this.gold = GAME_CONFIG.startingGold;
		this.lives = GAME_CONFIG.startingLives;
		this.wave = 0;
		this.enemiesToSpawn = 0;
		this.spawnAccumulatorMs = 0;
		this.interWaveDelayMs = 0;
		this.isGameOver = false;
		this.upgradePanel = null;
		this.upgradeTarget = null;
		this.upgradeRangeIndicator = null;
		this.upgradeBounds = null;
		this.targetingTower = null;
		this.targetingHint = null;
		this.hoverRangeIndicator = null;
		this.hoverRangeOwner = null;
		this.cachedPower = {
			supply: 0,
			demand: 0,
			batteryCharge: 0,
			batteryCapacity: 0,
		};
		this.powerRefreshAccumulatorMs = 0;
		this.hudUnsubs = [];
		this.lastSkipSignal = skipSignalAtom.get();
		this.lastRestartSignal = restartSignalAtom.get();
		this.simNow = 0;
		this.speedFactor = 1;
		resetHudStore();
		bestWaveAtom.set(loadBestWave());
	}

	create(): void {
		ensureBuildingTextures(this);
		ensureEnemyTextures(this);
		this.path = generatePath();
		this.cameras.main.setBackgroundColor(COLORS.background);
		this.drawGrass();
		this.drawGridLines();
		this.drawPath();
		this.subscribeHudSignals();
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
				if (pendingItemTargetAtom.get()) this.cancelPendingItem();
				else if (this.targetingTower) this.cancelTargeting();
				else if (this.upgradePanel) this.closeUpgradePanel();
				else if (this.awaitingCardPick) this.skipCardPick();
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
				key.on('down', () => selectedBuildAtom.set(id));
			}
		}

		this.interWaveDelayMs = GAME_CONFIG.waveDelayMs;
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

	private canSkipWave(): boolean {
		return (
			!this.awaitingCardPick &&
			!this.isGameOver &&
			this.enemiesToSpawn === 0 &&
			this.enemyVisuals.size === 0 &&
			this.interWaveDelayMs > 0
		);
	}

	private subscribeHudSignals(): void {
		const skipUnsub = skipSignalAtom.subscribe((v) => {
			if (v === this.lastSkipSignal) return;
			this.lastSkipSignal = v;
			if (this.canSkipWave()) this.interWaveDelayMs = 0;
		});
		const restartUnsub = restartSignalAtom.subscribe((v) => {
			if (v === this.lastRestartSignal) return;
			this.lastRestartSignal = v;
			this.scene.restart();
		});
		const speedUnsub = speedFactorAtom.subscribe((v: number) => {
			this.speedFactor = v;
			const scale = v <= 0 ? 0 : v;
			this.time.timeScale = scale;
			this.tweens.timeScale = scale === 0 ? 1 : scale;
		});
		const cardPickUnsub = cardPickSignalAtom.subscribe((s) => {
			if (s.n === this.lastCardPickN) return;
			this.lastCardPickN = s.n;
			if (!s.id || !this.awaitingCardPick) return;
			const opts = cardOptionsAtom.get();
			if (!opts) return;
			const card = opts.find((o) => o.id === s.id);
			if (card) this.applyCardPick(card);
		});
		const cardSkipUnsub = cardSkipSignalAtom.subscribe((v: number) => {
			if (v === this.lastCardSkipN) return;
			this.lastCardSkipN = v;
			if (this.awaitingCardPick) this.skipCardPick();
		});
		const useItemUnsub = useItemSignalAtom.subscribe((s) => {
			if (s.n === this.lastUseItemN) return;
			this.lastUseItemN = s.n;
			if (!s.id || this.isGameOver) return;
			this.consumeInventoryItem(s.id);
		});
		this.hudUnsubs.push(
			skipUnsub,
			restartUnsub,
			speedUnsub,
			cardPickUnsub,
			cardSkipUnsub,
			useItemUnsub,
		);
		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			for (const u of this.hudUnsubs) u();
			this.hudUnsubs = [];
		});
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

	private placeStarterKit(): void {
		const items = planStarterKit(this.path.cells, this.path.startRow);
		for (const item of items) {
			const cx = item.col * TILE + TILE / 2;
			const cy = item.row * TILE + TILE / 2;
			this.spawnBuilding(item.id, item.col, item.row, cx, cy);
		}
	}

	private refreshHud(): void {
		goldAtom.set(this.gold);
		livesAtom.set(this.lives);
		waveAtom.set(this.wave);
		enemiesLeftAtom.set(this.enemiesToSpawn + this.enemyVisuals.size);
		const { supply, demand, batteryCharge, batteryCapacity } =
			this.cachedPower;
		supplyAtom.set(supply);
		demandAtom.set(demand);
		batteryChargeAtom.set(batteryCharge);
		batteryCapacityAtom.set(batteryCapacity);
		freeTowersAtom.set(this.freeBasicTowers);
		bountyMulAtom.set(this.bountyBonusMultiplier);
		if (this.enemiesToSpawn > 0 || this.enemyVisuals.size > 0) {
			timerStateAtom.set('IN_PROGRESS');
			timerSecAtom.set(0);
		} else {
			timerStateAtom.set('NEXT_WAVE');
			timerSecAtom.set(Math.ceil(this.interWaveDelayMs / 1000));
		}
		canSkipAtom.set(this.canSkipWave());
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
		for (const eid of query(this.world, [BuildingTag])) {
			if (BuildingState.destroyed[eid]) continue;
			if (
				BuildingState.col[eid] === col &&
				BuildingState.row[eid] === row
			)
				return false;
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
			this.clearHoverRange();
			return;
		}
		const { col, row, cx, cy } = this.snapToTile(
			pointer.worldX,
			pointer.worldY,
		);
		const existing = this.findBuildingAt(col, row);
		this.updateHoverRange(existing);
		const ok = this.canPlaceAt(col, row, selectedBuildAtom.get());
		const spec = specFor(selectedBuildAtom.get());
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

	private updateHoverRange(b: Building | null): void {
		if (this.upgradePanel) {
			this.clearHoverRange();
			return;
		}
		if (!b || BuildingState.destroyed[b.id]) {
			this.clearHoverRange();
			return;
		}
		let radius = 0;
		let color = 0xffffff;
		if (b.kind === 'tower') {
			radius = towerRange(b);
			color = b.spec.color;
		} else if (b.kind === 'repair') {
			radius = repairRange(b);
			color = b.spec.color;
		} else if (b.kind === 'armoury') {
			radius = b.spec.soldierRoamRange;
			color = b.spec.color;
		} else {
			this.clearHoverRange();
			return;
		}
		if (this.hoverRangeOwner === b && this.hoverRangeIndicator) {
			this.hoverRangeIndicator.setPosition(b.x, b.y).setRadius(radius);
			return;
		}
		this.clearHoverRange();
		this.hoverRangeIndicator = this.add
			.circle(b.x, b.y, radius, color, 0.08)
			.setStrokeStyle(1.5, color, 0.55)
			.setDepth(2);
		this.hoverRangeOwner = b;
	}

	private clearHoverRange(): void {
		if (this.hoverRangeIndicator) {
			this.hoverRangeIndicator.destroy();
			this.hoverRangeIndicator = null;
		}
		this.hoverRangeOwner = null;
	}

	private rebuildEnemyGrid(): void {
		const cell = TowerDefenseScene.ENEMY_GRID_CELL;
		const cols = TowerDefenseScene.ENEMY_GRID_COLS;
		const rows = TowerDefenseScene.ENEMY_GRID_ROWS;
		for (let i = 0; i < this.enemyGrid.length; i++) {
			this.enemyGrid[i].length = 0;
		}
		let leadEid = -1;
		let leadProgress = -1;
		for (const eid of this.frameEnemyEids) {
			if (!this.enemyVisuals.has(eid)) continue;
			const x = Position.x[eid];
			const y = Position.y[eid];
			let col = Math.floor(x / cell);
			let row = Math.floor(y / cell);
			if (col < 0) col = 0;
			else if (col >= cols) col = cols - 1;
			if (row < 0) row = 0;
			else if (row >= rows) row = rows - 1;
			this.enemyGrid[row * cols + col].push(eid);
			const prog = EnemyStats.pathIndex[eid];
			if (prog > leadProgress) {
				leadProgress = prog;
				leadEid = eid;
			}
		}
		this.leadEnemyEid = leadEid;
		this.leadPathIndex = leadProgress;
	}

	private forEachEnemyInRange(
		cx: number,
		cy: number,
		range: number,
		fn: (eid: number) => void,
	): void {
		const cell = TowerDefenseScene.ENEMY_GRID_CELL;
		const cols = TowerDefenseScene.ENEMY_GRID_COLS;
		const rows = TowerDefenseScene.ENEMY_GRID_ROWS;
		let minCol = Math.floor((cx - range) / cell);
		let maxCol = Math.floor((cx + range) / cell);
		let minRow = Math.floor((cy - range) / cell);
		let maxRow = Math.floor((cy + range) / cell);
		if (minCol < 0) minCol = 0;
		if (minRow < 0) minRow = 0;
		if (maxCol >= cols) maxCol = cols - 1;
		if (maxRow >= rows) maxRow = rows - 1;
		const rangeSq = range * range;
		for (let r = minRow; r <= maxRow; r++) {
			for (let c = minCol; c <= maxCol; c++) {
				const bucket = this.enemyGrid[r * cols + c];
				for (let i = 0; i < bucket.length; i++) {
					const eid = bucket[i];
					if (!this.enemyVisuals.has(eid)) continue;
					const dx = Position.x[eid] - cx;
					const dy = Position.y[eid] - cy;
					if (dx * dx + dy * dy > rangeSq) continue;
					fn(eid);
				}
			}
		}
	}

	private onPointerDown(pointer: Phaser.Input.Pointer): void {
		if (this.isGameOver) return;

		if (pendingItemTargetAtom.get()) {
			if (pointer.worldY < HUD_HEIGHT) {
				this.cancelPendingItem();
				return;
			}
			if (pointer.worldY > BASE_HEIGHT - PALETTE_HEIGHT) {
				this.cancelPendingItem();
				return;
			}
			const probe = this.snapToTile(pointer.worldX, pointer.worldY);
			const probeHit = this.findBuildingAt(probe.col, probe.row);
			if (probeHit && !BuildingState.destroyed[probeHit.id]) {
				this.applyPendingItemAt(probeHit);
			}
			return;
		}

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
				!BuildingState.destroyed[probeHit.id] &&
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
		if (existing && !BuildingState.destroyed[existing.id]) {
			this.openBuildingPanel(existing);
			return;
		}

		if (!this.canPlaceAt(col, row, selectedBuildAtom.get())) return;
		const spec = specFor(selectedBuildAtom.get());
		if (selectedBuildAtom.get() === 'basic' && this.freeBasicTowers > 0) {
			this.freeBasicTowers -= 1;
		} else {
			this.gold -= spec.cost;
		}
		this.spawnBuilding(selectedBuildAtom.get(), col, row, cx, cy);
		this.recomputePower(0);
		this.refreshHud();
	}

	private findBuildingAt(col: number, row: number): Building | null {
		for (const eid of query(this.world, [BuildingTag])) {
			if (BuildingState.destroyed[eid]) continue;
			if (
				BuildingState.col[eid] === col &&
				BuildingState.row[eid] === row
			) {
				return this.buildingByEid.get(eid) ?? null;
			}
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
		} else if (b.kind === 'repair') {
			this.upgradeRangeIndicator = this.add
				.circle(b.x, b.y, repairRange(b), b.spec.color, 0.1)
				.setStrokeStyle(2, b.spec.color, 0.6);
		}

		const isTower = b.kind === 'tower';
		const isArmoury = b.kind === 'armoury';
		const isRepair = b.kind === 'repair';
		const supportsFixed = isTower && this.supportsFixedTarget(b);
		const upgradeRows = isTower
			? UPGRADE_ORDER.length
			: isArmoury
				? ARMOURY_UPGRADE_ORDER.length
				: isRepair
					? REPAIR_UPGRADE_ORDER.length
					: 0;
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

		interface UpgradeRowData {
			kind: string;
			def: {
				name: string;
				description: string;
				color: number;
				maxLevel: number;
			};
			lvl: number;
			cost: number;
		}
		let rows: UpgradeRowData[] = [];
		if (isTower) {
			rows = UPGRADE_ORDER.map((k) => {
				const def = UPGRADE_DEFS[k];
				const lvl = TowerUpgradeStats[k][b.id];
				return { kind: k, def, lvl, cost: upgradeCost(def, lvl) };
			});
		} else if (isArmoury) {
			rows = ARMOURY_UPGRADE_ORDER.map((k) => {
				const def = ARMOURY_UPGRADE_DEFS[k];
				const lvl = ArmouryUpgradeStats[k][b.id];
				return {
					kind: k,
					def,
					lvl,
					cost: armouryUpgradeCost(def, lvl),
				};
			});
		} else if (isRepair) {
			rows = REPAIR_UPGRADE_ORDER.map((k) => {
				const def = REPAIR_UPGRADE_DEFS[k];
				const lvl = RepairUpgradeStats[k][b.id];
				return {
					kind: k,
					def,
					lvl,
					cost: repairUpgradeCost(def, lvl),
				};
			});
		}
		for (let i = 0; i < rows.length; i++) {
			const { kind, def, lvl, cost } = rows[i];
			const maxed = lvl >= def.maxLevel;
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
				.setStrokeStyle(1, def.color, maxed || !affordable ? 0.3 : 0.9);
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
						this.applyUpgradeByKind(b, kind);
					},
				);
			}
		}

		let fixedRowEndY = headerH + upgradeRows * rowH;
		if (isTower && this.supportsFixedTarget(b)) {
			const fy = fixedRowEndY + 4;
			const hasTarget = TowerState.hasFixedTarget[b.id] === 1;
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
					? `Locked at (${TowerState.fixedTargetX[b.id].toFixed(0)}, ${TowerState.fixedTargetY[b.id].toFixed(0)})`
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
			const hp = `${Math.floor(Health.hp[b.id])}/${towerMaxHp(b)}`;
			return `DMG ${dmg} · RATE ${rate}s · RNG ${rng} · HP ${hp}`;
		}
		const hpText = `${Math.floor(Health.hp[b.id])}/${Health.maxHp[b.id]}`;
		if (b.kind === 'generator') {
			return `OUTPUT +${b.spec.power}⚡ · HP ${hpText}`;
		}
		if (b.kind === 'battery') {
			return `CHARGE ${Math.floor(BatteryState.charge[b.id])}/${BatteryState.capacity[b.id]} · HP ${hpText}`;
		}
		if (b.kind === 'armoury') {
			const rate = (b.spec.spawnIntervalMs / 1000).toFixed(1);
			return `LOAD -${b.spec.power}⚡ · 1 SOLDIER / ${rate}s · HP ${hpText}`;
		}
		return `LOAD -${b.spec.power}⚡ · HEALS ${repairAmount(b)} · RNG ${repairRange(b).toFixed(0)} · HP ${hpText}`;
	}

	private applyUpgrade(tower: TowerBuilding, kind: UpgradeKind): void {
		const def = UPGRADE_DEFS[kind];
		const lvl = TowerUpgradeStats[kind][tower.id];
		if (lvl >= def.maxLevel) return;
		const cost = upgradeCost(def, lvl);
		if (this.gold < cost) return;
		this.gold -= cost;
		const prevMaxHp = towerMaxHp(tower);
		TowerUpgradeStats[kind][tower.id] = lvl + 1;
		const newMaxHp = towerMaxHp(tower);
		Health.maxHp[tower.id] = newMaxHp;
		const currentHp = Health.hp[tower.id];
		if (kind === 'armor') {
			const delta = newMaxHp - prevMaxHp;
			Health.hp[tower.id] = Math.min(newMaxHp, currentHp + delta);
		} else {
			Health.hp[tower.id] = Math.min(currentHp, newMaxHp);
		}
		this.redrawUpgradePips(tower);
		this.refreshHud();
		this.openBuildingPanel(tower);
	}

	private applyArmouryUpgrade(
		armoury: ArmouryBuilding,
		kind: ArmouryUpgradeKind,
	): void {
		const def = ARMOURY_UPGRADE_DEFS[kind];
		const lvl = ArmouryUpgradeStats[kind][armoury.id];
		if (lvl >= def.maxLevel) return;
		const cost = armouryUpgradeCost(def, lvl);
		if (this.gold < cost) return;
		this.gold -= cost;
		ArmouryUpgradeStats[kind][armoury.id] = lvl + 1;
		this.refreshHud();
		this.openBuildingPanel(armoury);
	}

	private applyUpgradeByKind(b: Building, kind: string): void {
		if (b.kind === 'tower') {
			this.applyUpgrade(b, kind as UpgradeKind);
		} else if (b.kind === 'armoury') {
			this.applyArmouryUpgrade(b, kind as ArmouryUpgradeKind);
		} else if (b.kind === 'repair') {
			this.applyRepairUpgrade(b, kind as RepairUpgradeKind);
		}
	}

	private applyRepairUpgrade(
		station: RepairBuilding,
		kind: RepairUpgradeKind,
	): void {
		const def = REPAIR_UPGRADE_DEFS[kind];
		const lvl = RepairUpgradeStats[kind][station.id];
		if (lvl >= def.maxLevel) return;
		const cost = repairUpgradeCost(def, lvl);
		if (this.gold < cost) return;
		this.gold -= cost;
		RepairUpgradeStats[kind][station.id] = lvl + 1;
		this.refreshHud();
		this.openBuildingPanel(station);
	}

	private redrawUpgradePips(t: TowerBuilding): void {
		t.upgradePips.clear();
		const anyUpgraded = UPGRADE_ORDER.some(
			(k) => TowerUpgradeStats[k][t.id] > 0,
		);
		if (!anyUpgraded) return;
		const pipW = 3;
		const pipH = TILE * 0.5;
		const startX = t.x + TILE * 0.42;
		const baseY = t.y + pipH / 2;
		for (let i = 0; i < UPGRADE_ORDER.length; i++) {
			const kind = UPGRADE_ORDER[i];
			const lvl = TowerUpgradeStats[kind][t.id];
			const def = UPGRADE_DEFS[kind];
			const px = startX + i * (pipW + 1);
			if (lvl <= 0) continue;
			const filled = (lvl / def.maxLevel) * pipH;
			t.upgradePips.fillStyle(def.color, 0.95);
			t.upgradePips.fillRect(px, baseY - filled, pipW, filled);
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
		t.fixedTargetMarker = marker;
		TowerState.hasFixedTarget[t.id] = 1;
		TowerState.fixedTargetX[t.id] = x;
		TowerState.fixedTargetY[t.id] = y;
	}

	private clearFixedTarget(t: TowerBuilding): void {
		if (t.fixedTargetMarker) {
			t.fixedTargetMarker.destroy();
			t.fixedTargetMarker = null;
		}
		TowerState.hasFixedTarget[t.id] = 0;
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
		const sprite = this.add.image(x, y, buildingTextureKey(id));
		sprite.setOrigin(0.5);
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
		const armorBarBg = this.add
			.rectangle(
				x,
				y - TILE * 0.55 - 5,
				TILE * 0.7,
				3,
				COLORS.buildingHpBarBg,
			)
			.setOrigin(0.5)
			.setVisible(false);
		const armorBar = this.add
			.rectangle(
				x - (TILE * 0.7) / 2,
				y - TILE * 0.55 - 5,
				TILE * 0.7,
				3,
				0x63b3ed,
			)
			.setOrigin(0, 0.5)
			.setVisible(false);

		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, BuildingTag);
		Position.x[eid] = x;
		Position.y[eid] = y;
		const buildingArmor = Math.floor(
			spec.maxHp * GAME_CONFIG.armorBuildingRatio,
		);
		this.addDamageable(eid, spec.maxHp, buildingArmor, spec.defense);
		BuildingState.online[eid] = 1;
		BuildingState.destroyed[eid] = 0;
		BuildingState.col[eid] = col;
		BuildingState.row[eid] = row;
		BuildingState.specIndex[eid] = buildIndexFromId(spec.id);
		BuildingState.kindIndex[eid] = BUILDING_KIND[spec.kind];
		BuildingState.power[eid] = spec.kind === 'battery' ? 0 : spec.power;
		const base: BaseBuilding = {
			id: eid,
			col,
			row,
			x,
			y,
			sprite,
			hpBar,
			hpBarBg,
			armorBar,
			armorBarBg,
		};

		let building: Building;
		if (spec.kind === 'tower') {
			addComponent(this.world, eid, TowerTag);
			TowerState.lastFireAtMs[eid] = 0;
			TowerState.hasFixedTarget[eid] = 0;
			TowerState.fixedTargetX[eid] = 0;
			TowerState.fixedTargetY[eid] = 0;
			TowerUpgradeStats.radar[eid] = 0;
			TowerUpgradeStats.attack[eid] = 0;
			TowerUpgradeStats.speed[eid] = 0;
			TowerUpgradeStats.armor[eid] = 0;
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
				powerIndicator,
				fixedTargetMarker: null,
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
			};
			building = b;
		} else if (spec.kind === 'battery') {
			addComponent(this.world, eid, BatteryTag);
			const bspec = spec as BatterySpec;
			BatteryState.charge[eid] = 0;
			BatteryState.capacity[eid] = bspec.capacity;
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
				chargeBar,
				chargeBarBg,
			};
			building = b;
		} else if (spec.kind === 'repair') {
			addComponent(this.world, eid, RepairTag);
			RepairState.cooldownLeftMs[eid] = 0;
			RepairState.activeDroneEid[eid] = -1;
			RepairUpgradeStats.reach[eid] = 0;
			RepairUpgradeStats.yield[eid] = 0;
			RepairUpgradeStats.tempo[eid] = 0;
			addComponent(this.world, eid, AuraEmitterTag);
			addComponent(this.world, eid, AuraEmitter);
			initAura(
				eid,
				AURA_KIND.repairArmor,
				(spec as RepairSpec).repairRange,
				GAME_CONFIG.passiveRepairArmor,
				GAME_CONFIG.passiveRepairIntervalMs,
			);
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
				powerIndicator,
			};
			building = b;
		} else if (spec.kind === 'armoury') {
			addComponent(this.world, eid, ArmouryTag);
			ArmouryState.nextSpawnAtMs[eid] = 0;
			ArmouryUpgradeStats.capacity[eid] = 0;
			ArmouryUpgradeStats.damage[eid] = 0;
			ArmouryUpgradeStats.vigor[eid] = 0;
			ArmouryUpgradeStats.tempo[eid] = 0;
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
				powerIndicator,
			};
			building = b;
		} else {
			throw new Error(
				`unknown build kind: ${(spec as { kind: string }).kind}`,
			);
		}

		this.buildingByEid.set(eid, building);
		if (building.kind === 'armoury') {
			for (let i = 0; i < GAME_CONFIG.archerInitialCount; i++) {
				this.spawnArcher(building);
			}
		}
		return building;
	}

	private rebuildBuildingFrameCaches(): void {
		this.frameGeneratorEids.length = 0;
		for (const eid of query(this.world, [BuildingTag, GeneratorTag])) {
			if (BuildingState.destroyed[eid]) continue;
			this.frameGeneratorEids.push(eid);
		}
		this.frameBatteryEids.length = 0;
		for (const eid of query(this.world, [BuildingTag, BatteryTag])) {
			if (BuildingState.destroyed[eid]) continue;
			this.frameBatteryEids.push(eid);
		}
		this.frameTowerEids.length = 0;
		for (const eid of query(this.world, [BuildingTag, TowerTag])) {
			if (BuildingState.destroyed[eid]) continue;
			this.frameTowerEids.push(eid);
		}
		this.frameArmouryEids.length = 0;
		for (const eid of query(this.world, [BuildingTag, ArmouryTag])) {
			if (BuildingState.destroyed[eid]) continue;
			this.frameArmouryEids.push(eid);
		}
		this.frameRepairEids.length = 0;
		for (const eid of query(this.world, [BuildingTag, RepairTag])) {
			if (BuildingState.destroyed[eid]) continue;
			this.frameRepairEids.push(eid);
		}
		this.frameConsumerEids.length = 0;
		for (let i = 0; i < this.frameTowerEids.length; i++)
			this.frameConsumerEids.push(this.frameTowerEids[i]);
		for (let i = 0; i < this.frameRepairEids.length; i++)
			this.frameConsumerEids.push(this.frameRepairEids[i]);
		for (let i = 0; i < this.frameArmouryEids.length; i++)
			this.frameConsumerEids.push(this.frameArmouryEids[i]);
	}

	private recomputePower(dt: number): void {
		this.rebuildBuildingFrameCaches();
		const result = computeAndApplyPower(
			this.frameGeneratorEids,
			this.frameConsumerEids,
			this.frameBatteryEids,
			dt,
		);
		this.cachedPower.supply = result.supply;
		this.cachedPower.demand = result.demand;
		this.cachedPower.batteryCharge = result.batteryCharge;
		this.cachedPower.batteryCapacity = result.batteryCapacity;
		this.syncBuildingVisuals();
	}

	private syncBuildingVisuals(): void {
		for (const eid of query(this.world, [BuildingTag])) {
			if (BuildingState.destroyed[eid]) continue;
			const b = this.buildingByEid.get(eid);
			if (!b) continue;
			const hp = Health.hp[eid];
			const maxHp = Health.maxHp[eid];
			if (hp < maxHp) {
				b.hpBar.setVisible(true);
				b.hpBarBg.setVisible(true);
				b.hpBar.width = (hp / maxHp) * TILE * 0.7;
			} else {
				b.hpBar.setVisible(false);
				b.hpBarBg.setVisible(false);
			}
			const armor = Armor.armor[eid];
			const maxArmor = Armor.maxArmor[eid];
			if (maxArmor > 0 && armor < maxArmor) {
				b.armorBar.setVisible(true);
				b.armorBarBg.setVisible(true);
				b.armorBar.width = (armor / maxArmor) * TILE * 0.7;
			} else {
				b.armorBar.setVisible(false);
				b.armorBarBg.setVisible(false);
			}
			if (
				b.kind === 'tower' ||
				b.kind === 'repair' ||
				b.kind === 'armoury'
			) {
				const online = BuildingState.online[eid] === 1;
				b.sprite.setAlpha(online ? 1 : 0.45);
				b.powerIndicator.setFillStyle(online ? 0x9ae6b4 : 0xfc8181);
			} else if (b.kind === 'battery') {
				b.chargeBar.width =
					(BatteryState.charge[eid] / BatteryState.capacity[eid]) *
					TILE *
					0.7;
			}
		}
	}

	private startNextWave(): void {
		this.wave += 1;
		this.sweepExpiredAllies();
		const count = Math.floor(
			GAME_CONFIG.enemiesPerWave +
				(this.wave - 1) * GAME_CONFIG.enemiesPerWaveScale,
		);
		const bossWave = this.wave % 5 === 0;
		this.pendingBosses = bossWave ? 1 : 0;
		this.enemiesToSpawn = count + this.pendingBosses;
		this.spawnAccumulatorMs = 0;
		this.cardPickedThisInterval = false;
		const armouryNow = this.simNow;
		for (const eid of query(this.world, [ArmouryTag])) {
			if (BuildingState.destroyed[eid]) continue;
			ArmouryState.nextSpawnAtMs[eid] = armouryNow;
		}
		nextWavePreviewAtom.set({ count: 0, bossCount: 0 });
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
		sprite:
			| Phaser.GameObjects.Rectangle
			| Phaser.GameObjects.Arc
			| Phaser.GameObjects.Image,
		color: number,
	): void {
		if (sprite instanceof Phaser.GameObjects.Image) {
			sprite.setTint(color);
			this.time.delayedCall(80, () => {
				if (!sprite.scene) return;
				sprite.clearTint();
			});
			return;
		}
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
		const sprite = this.acquireImage(
			start.x,
			start.y,
			enemyTextureKey(type.id),
		);
		sprite.setScale((radius * 2) / 24);
		const statusRing = this.acquireGraphics();
		statusRing.setVisible(false);
		const ringRadius = radius + 4;
		const barWidth = Math.min(
			TILE * 1.2,
			Math.max(TILE * 0.4, TILE * type.sizeRadius * 2),
		);
		const hpBarBg = this.acquireRect(
			start.x,
			start.y - TILE * 0.5,
			barWidth,
			4,
			COLORS.enemyHpBarBg,
		);
		const hpBar = this.acquireRect(
			start.x - barWidth / 2,
			start.y - TILE * 0.5,
			barWidth,
			4,
			COLORS.enemyHpBar,
		);
		hpBar.setOrigin(0, 0.5);
		hpBar.setVisible(false);
		hpBarBg.setVisible(false);
		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, EnemyTag);
		addComponent(this.world, eid, EnemyStats);
		Position.x[eid] = start.x;
		Position.y[eid] = start.y;
		const enemyArmor = Math.floor(hp * GAME_CONFIG.armorEnemyRatio);
		this.addDamageable(eid, hp, enemyArmor, type.defense);
		EnemyStats.baseSpeed[eid] = speed;
		addComponent(this.world, eid, MovementTag);
		addComponent(this.world, eid, Movement);
		initMovement(eid, speed);
		EnemyStats.pathIndex[eid] = 1;
		EnemyStats.segmentT[eid] = 0;
		clearStatus(eid, STATUS_KIND.slow);
		clearStatus(eid, STATUS_KIND.burn);
		EnemyStats.attackDamage[eid] = attackDamage;
		EnemyStats.attackRateMs[eid] = type.attackRateMs;
		EnemyStats.attackRange[eid] = type.attackRange;
		EnemyStats.lastAttackAtMs[eid] = 0;
		EnemyStats.canAttack[eid] = type.canAttack ? 1 : 0;
		EnemyStats.bountyMultiplier[eid] = type.bountyMultiplier;
		EnemyStats.typeIndex[eid] = enemyTypeIndexFromId(type.id);
		this.enemyVisuals.set(eid, {
			sprite,
			statusRing,
			hpBar,
			hpBarBg,
			ringRadius,
			barWidth,
			statusVisible: false,
		});
		EnemyStats.targetEid[eid] = -1;
		EnemyStats.targetKind[eid] = ATTACK_TARGET_KIND.none;
	}

	private findAttackTargetFor(eid: number): boolean {
		const range = EnemyStats.attackRange[eid];
		if (range <= 0) return false;
		const ex = Position.x[eid];
		const ey = Position.y[eid];
		let bestEid = -1;
		let bestKind: number = ATTACK_TARGET_KIND.none;
		let bestDist2 = range * range;
		for (const beid of this.frameBuildingEids) {
			if (BuildingState.destroyed[beid]) continue;
			const dx = Position.x[beid] - ex;
			const dy = Position.y[beid] - ey;
			const d2 = dx * dx + dy * dy;
			if (d2 <= bestDist2) {
				bestDist2 = d2;
				bestEid = beid;
				bestKind = ATTACK_TARGET_KIND.building;
			}
		}
		for (const seid of this.frameSoldierEids) {
			if (!this.soldierVisuals.has(seid)) continue;
			const dx = Position.x[seid] - ex;
			const dy = Position.y[seid] - ey;
			const d2 = dx * dx + dy * dy;
			if (d2 <= bestDist2) {
				bestDist2 = d2;
				bestEid = seid;
				bestKind = ATTACK_TARGET_KIND.soldier;
			}
		}
		EnemyStats.targetEid[eid] = bestEid;
		EnemyStats.targetKind[eid] = bestKind;
		return bestKind !== ATTACK_TARGET_KIND.none;
	}

	private targetAlive(targetEid: number, targetKind: number): boolean {
		if (targetKind === ATTACK_TARGET_KIND.building) {
			return !BuildingState.destroyed[targetEid];
		}
		if (targetKind === ATTACK_TARGET_KIND.soldier) {
			return this.soldierVisuals.has(targetEid);
		}
		return false;
	}

	private applyTargetDamage(
		targetEid: number,
		targetKind: number,
		dmg: number,
	): void {
		if (targetKind === ATTACK_TARGET_KIND.building) {
			const b = this.buildingByEid.get(targetEid);
			if (b) this.damageBuilding(b, dmg);
		} else if (targetKind === ATTACK_TARGET_KIND.soldier) {
			this.damageSoldier(targetEid, dmg);
		}
	}

	private applyDamage(
		targetEid: number,
		amount: number,
		type: number = DAMAGE_TYPE.kinetic,
		flags: number = DAMAGE_FLAG.none,
	): void {
		if (Health.hp[targetEid] <= 0) return;
		let remaining = amount * resistForType(targetEid, type);
		if (remaining <= 0) return;
		if ((flags & DAMAGE_FLAG.ignoresArmor) === 0) {
			const armor = Armor.armor[targetEid];
			if (armor > 0) {
				if (remaining <= armor) {
					Armor.armor[targetEid] = armor - remaining;
					remaining = 0;
				} else {
					Armor.armor[targetEid] = 0;
					remaining -= armor;
				}
			}
		}
		if (remaining > 0) {
			const defense = Defense.defense[targetEid];
			const reduced = Math.max(1, remaining - defense);
			Health.hp[targetEid] -= reduced;
		}
		if (Health.hp[targetEid] <= 0) {
			if (!hasComponent(this.world, targetEid, DeadTag)) {
				addComponent(this.world, targetEid, DeadTag);
			}
			if (hasComponent(this.world, targetEid, EnemyTag)) {
				this.killEnemy(targetEid, true);
			} else if (hasComponent(this.world, targetEid, SoldierTag)) {
				this.killSoldier(targetEid);
			} else if (hasComponent(this.world, targetEid, BuildingTag)) {
				const b = this.buildingByEid.get(targetEid);
				if (b) this.destroyBuilding(b);
			}
		}
	}

	private addDamageable(
		eid: number,
		hp: number,
		armor: number,
		defense: number,
	): void {
		addComponent(this.world, eid, HealthTag);
		addComponent(this.world, eid, Health);
		initHealth(eid, hp);
		addComponent(this.world, eid, ArmorTag);
		addComponent(this.world, eid, Armor);
		initArmor(eid, armor);
		addComponent(this.world, eid, DefenseTag);
		addComponent(this.world, eid, Defense);
		initDefense(eid, defense);
		addComponent(this.world, eid, ResistanceTag);
		addComponent(this.world, eid, Resistance);
		initResistance(eid);
	}

	private damageBuilding(b: Building, dmg: number): void {
		this.applyDamage(b.id, dmg, DAMAGE_TYPE.kinetic, DAMAGE_FLAG.none);
		if (Health.hp[b.id] > 0) this.flashSprite(b.sprite, 0xffffff);
	}

	private destroyBuilding(b: Building): void {
		if (BuildingState.destroyed[b.id]) return;
		BuildingState.destroyed[b.id] = 1;
		BuildingState.online[b.id] = 0;
		Health.hp[b.id] = 0;
		b.sprite.destroy();
		b.hpBar.destroy();
		b.hpBarBg.destroy();
		b.armorBar.destroy();
		b.armorBarBg.destroy();
		if (b.kind === 'tower' || b.kind === 'repair' || b.kind === 'armoury') {
			b.powerIndicator.destroy();
		}
		if (b.kind === 'tower' && b.fixedTargetMarker) {
			b.fixedTargetMarker.destroy();
			b.fixedTargetMarker = null;
		}
		if (b.kind === 'tower') {
			b.upgradePips.destroy();
		}
		if (b.kind === 'battery') {
			b.chargeBar.destroy();
			b.chargeBarBg.destroy();
		}
		if (this.targetingTower === b) this.cancelTargeting();
		for (const eid of query(this.world, [EnemyTag])) {
			if (
				EnemyStats.targetKind[eid] === ATTACK_TARGET_KIND.building &&
				EnemyStats.targetEid[eid] === b.id
			) {
				EnemyStats.targetKind[eid] = ATTACK_TARGET_KIND.none;
			}
		}
		const droneKills: number[] = [];
		for (const deid of query(this.world, [DroneTag])) {
			if (
				DroneStats.targetEid[deid] === b.id ||
				DroneStats.stationEid[deid] === b.id
			)
				droneKills.push(deid);
		}
		for (const deid of droneKills) this.killDrone(deid);
		this.buildingByEid.delete(b.id);
		this.removeEntityQueue.push(b.id);
		if (this.upgradeTarget === b) this.closeUpgradePanel();
		if (this.hoverRangeOwner === b) this.clearHoverRange();
	}

	private killDrone(eid: number): void {
		const v = this.droneVisuals.delete(eid);
		if (!v) return;
		this.releaseArc(v.sprite);
		this.releaseLine(v.beam);
		const stationEid = DroneStats.stationEid[eid];
		if (stationEid >= 0 && RepairState.activeDroneEid[stationEid] === eid) {
			RepairState.activeDroneEid[stationEid] = -1;
		}
		this.removeEntityQueue.push(eid);
	}

	private updateArmouries(nowMs: number): void {
		for (let i = 0; i < this.frameArmouryEids.length; i++) {
			const eid = this.frameArmouryEids[i];
			if (BuildingState.destroyed[eid]) continue;
			if (!BuildingState.online[eid]) continue;
			const b = this.buildingByEid.get(eid);
			if (!b || b.kind !== 'armoury') continue;
			const owned = this.countSoldiersOwnedBy(eid);
			if (owned >= armouryMaxSoldiers(b)) continue;
			if (nowMs < ArmouryState.nextSpawnAtMs[eid]) continue;
			this.spawnSoldier(b);
			ArmouryState.nextSpawnAtMs[eid] = nowMs + armourySpawnIntervalMs(b);
		}
	}

	private spawnAllySoldier(
		x: number,
		y: number,
		expiresAtWave: number,
	): void {
		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, SoldierTag);
		addComponent(this.world, eid, SoldierStats);
		Position.x[eid] = x;
		Position.y[eid] = y;
		const hp = GAME_CONFIG.allyHp;
		this.addDamageable(eid, hp, 0, 0);
		SoldierStats.speed[eid] = GAME_CONFIG.allySpeed;
		SoldierStats.attackDamage[eid] = GAME_CONFIG.allyDamage;
		SoldierStats.attackRateMs[eid] = GAME_CONFIG.allyAttackRateMs;
		SoldierStats.attackRange[eid] = GAME_CONFIG.allyAttackRange;
		SoldierStats.lastAttackAtMs[eid] = 0;
		SoldierStats.targetEnemyEid[eid] = 0;
		SoldierStats.armouryEid[eid] = -1;
		SoldierStats.expiresAtWave[eid] = expiresAtWave;
		SoldierStats.unitKind[eid] = SOLDIER_KIND.melee;
		const sprite = this.acquireRect(
			x,
			y,
			TILE * 0.3,
			TILE * 0.3,
			GAME_CONFIG.allyColor,
		);
		sprite.setStrokeStyle(1, 0xffffff, 0.7);
		const barWidth = TILE * 0.5;
		const hpBarBg = this.acquireRect(
			x,
			y - TILE * 0.32,
			barWidth,
			3,
			COLORS.enemyHpBarBg,
		);
		const hpBar = this.acquireRect(
			x - barWidth / 2,
			y - TILE * 0.32,
			barWidth,
			3,
			COLORS.enemyHpBar,
		);
		hpBar.setOrigin(0, 0.5);
		this.soldierVisuals.set(eid, { sprite, hpBar, hpBarBg });
	}

	private consumeInventoryItem(id: ItemId): void {
		const items = inventoryAtom.get();
		const idx = items.findIndex((it) => it.id === id && it.charges > 0);
		if (idx < 0) return;
		if (id === 'emergency_call_allies') {
			this.useEmergencyCallAllies();
			this.decrementItemCharge(id);
			return;
		}
		if (id === 'field_promotion') {
			this.cancelTargeting();
			if (this.upgradePanel) this.closeUpgradePanel();
			pendingItemTargetAtom.set('field_promotion');
			inventoryOpenAtom.set(false);
			return;
		}
	}

	private decrementItemCharge(id: ItemId): void {
		const items = inventoryAtom.get();
		const idx = items.findIndex((it) => it.id === id && it.charges > 0);
		if (idx < 0) return;
		const item = items[idx];
		const remaining = item.charges - 1;
		const next = [...items];
		if (remaining <= 0) next.splice(idx, 1);
		else next[idx] = { ...item, charges: remaining };
		inventoryAtom.set(next);
	}

	private applyPendingItemAt(b: Building): boolean {
		const id = pendingItemTargetAtom.get();
		if (!id) return false;
		if (id === 'field_promotion') {
			if (!this.applyRandomUpgradeTo(b)) return false;
			pendingItemTargetAtom.set(null);
			this.decrementItemCharge(id);
			return true;
		}
		return false;
	}

	private cancelPendingItem(): void {
		pendingItemTargetAtom.set(null);
	}

	private useEmergencyCallAllies(): void {
		const path = this.path;
		let cx = BASE_WIDTH / 2;
		let cy = BASE_HEIGHT / 2;
		const mid = path.waypoints[Math.floor(path.waypoints.length / 2)];
		if (mid) {
			cx = mid.x;
			cy = mid.y;
		}
		const expires = this.wave + GAME_CONFIG.allyLifespanWaves;
		const count = GAME_CONFIG.allyCallCount;
		for (let i = 0; i < count; i++) {
			const angle = (i / count) * Math.PI * 2;
			const radius = TILE * 0.6 + (i % 3) * 6;
			const sx = cx + Math.cos(angle) * radius;
			const sy = cy + Math.sin(angle) * radius;
			this.spawnAllySoldier(sx, sy, expires);
		}
	}

	private sweepExpiredAllies(): void {
		const wave = this.wave;
		for (const seid of query(this.world, [SoldierTag])) {
			if (!this.soldierVisuals.has(seid)) continue;
			const exp = SoldierStats.expiresAtWave[seid];
			if (exp > 0 && wave > exp) {
				this.killSoldier(seid);
			}
		}
	}

	private countSoldiersOwnedBy(armouryEid: number): number {
		let n = 0;
		for (const seid of this.frameSoldierEids) {
			if (!this.soldierVisuals.has(seid)) continue;
			if (SoldierStats.armouryEid[seid] === armouryEid) n++;
		}
		return n;
	}

	private spawnSoldier(armoury: ArmouryBuilding): void {
		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, SoldierTag);
		addComponent(this.world, eid, SoldierStats);
		Position.x[eid] = armoury.x;
		Position.y[eid] = armoury.y;
		const hp = armourySoldierHp(armoury);
		this.addDamageable(eid, hp, 0, 0);
		SoldierStats.speed[eid] = armoury.spec.soldierSpeed;
		SoldierStats.attackDamage[eid] = armourySoldierDamage(armoury);
		SoldierStats.attackRateMs[eid] = armoury.spec.soldierAttackRateMs;
		SoldierStats.attackRange[eid] = armoury.spec.soldierAttackRange;
		SoldierStats.lastAttackAtMs[eid] = 0;
		SoldierStats.targetEnemyEid[eid] = 0;
		SoldierStats.armouryEid[eid] = armoury.id;
		SoldierStats.expiresAtWave[eid] = -1;
		SoldierStats.unitKind[eid] = SOLDIER_KIND.melee;
		const sprite = this.acquireRect(
			armoury.x,
			armoury.y,
			TILE * 0.3,
			TILE * 0.3,
			armoury.spec.soldierColor,
		);
		sprite.setStrokeStyle(1, 0xffffff, 0.6);
		const barWidth = TILE * 0.5;
		const hpBarBg = this.acquireRect(
			armoury.x,
			armoury.y - TILE * 0.32,
			barWidth,
			3,
			COLORS.enemyHpBarBg,
		);
		const hpBar = this.acquireRect(
			armoury.x - barWidth / 2,
			armoury.y - TILE * 0.32,
			barWidth,
			3,
			COLORS.enemyHpBar,
		);
		hpBar.setOrigin(0, 0.5);
		this.soldierVisuals.set(eid, { sprite, hpBar, hpBarBg });
	}

	private spawnArcher(armoury: ArmouryBuilding): void {
		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, SoldierTag);
		addComponent(this.world, eid, SoldierStats);
		Position.x[eid] = armoury.x;
		Position.y[eid] = armoury.y;
		const hp = Math.floor(
			armourySoldierHp(armoury) * GAME_CONFIG.archerHpMultiplier,
		);
		this.addDamageable(eid, hp, 0, 0);
		SoldierStats.speed[eid] = GAME_CONFIG.archerSpeed;
		SoldierStats.attackDamage[eid] = GAME_CONFIG.archerDamage;
		SoldierStats.attackRateMs[eid] = GAME_CONFIG.archerAttackRateMs;
		SoldierStats.attackRange[eid] =
			armoury.spec.soldierAttackRange *
			GAME_CONFIG.archerAttackRangeMultiplier;
		SoldierStats.lastAttackAtMs[eid] = 0;
		SoldierStats.targetEnemyEid[eid] = 0;
		SoldierStats.armouryEid[eid] = armoury.id;
		SoldierStats.expiresAtWave[eid] = -1;
		SoldierStats.unitKind[eid] = SOLDIER_KIND.archer;
		const sprite = this.acquireRect(
			armoury.x,
			armoury.y,
			TILE * 0.28,
			TILE * 0.28,
			GAME_CONFIG.archerColor,
		);
		sprite.setStrokeStyle(1, 0xffffff, 0.8);
		const barWidth = TILE * 0.5;
		const hpBarBg = this.acquireRect(
			armoury.x,
			armoury.y - TILE * 0.32,
			barWidth,
			3,
			COLORS.enemyHpBarBg,
		);
		const hpBar = this.acquireRect(
			armoury.x - barWidth / 2,
			armoury.y - TILE * 0.32,
			barWidth,
			3,
			COLORS.enemyHpBar,
		);
		hpBar.setOrigin(0, 0.5);
		this.soldierVisuals.set(eid, { sprite, hpBar, hpBarBg });
	}

	private fireArcherShot(
		archerEid: number,
		targetEid: number,
		damage: number,
	): void {
		const sx = Position.x[archerEid];
		const sy = Position.y[archerEid];
		const tx = Position.x[targetEid];
		const ty = Position.y[targetEid];
		const sprite = this.acquireArc(
			sx,
			sy,
			3,
			GAME_CONFIG.archerProjectileColor,
		);
		const dist = Math.hypot(tx - sx, ty - sy);
		const speed = GAME_CONFIG.archerProjectileSpeed;
		const duration = Math.max(80, (dist / speed) * 1000);
		this.tweens.add({
			targets: sprite,
			x: tx,
			y: ty,
			duration,
			onComplete: () => {
				if (this.enemyVisuals.has(targetEid)) {
					this.applyDamage(
						targetEid,
						damage,
						DAMAGE_TYPE.cold,
						DAMAGE_FLAG.none,
					);
					if (this.enemyVisuals.has(targetEid)) {
						applyStatus(
							targetEid,
							STATUS_KIND.slow,
							this.simNow + GAME_CONFIG.archerSlowMs,
							GAME_CONFIG.archerSlowFactor,
							GAME_CONFIG.archerSlowMs,
						);
					}
				}
				this.releaseArc(sprite);
			},
		});
	}

	private findEnemyForSoldier(seid: number): number {
		const sx = Position.x[seid];
		const sy = Position.y[seid];
		let best = -1;
		let bestDist2 = Infinity;
		for (const eeid of this.frameEnemyEids) {
			if (!this.enemyVisuals.has(eeid)) continue;
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
		this.applyDamage(eid, dmg, DAMAGE_TYPE.kinetic, DAMAGE_FLAG.none);
		if (Health.hp[eid] > 0) {
			const v = this.soldierVisuals.get(eid);
			if (v) this.flashSprite(v.sprite, 0xffffff);
		}
	}

	private killSoldier(eid: number): void {
		const v = this.soldierVisuals.delete(eid);
		if (!v) return;
		this.releaseRect(v.sprite);
		this.releaseRect(v.hpBar);
		this.releaseRect(v.hpBarBg);
		for (const enemyEid of query(this.world, [EnemyTag])) {
			if (
				EnemyStats.targetKind[enemyEid] ===
					ATTACK_TARGET_KIND.soldier &&
				EnemyStats.targetEid[enemyEid] === eid
			) {
				EnemyStats.targetKind[enemyEid] = ATTACK_TARGET_KIND.none;
			}
		}
		this.removeEntityQueue.push(eid);
	}

	private updateSoldiers(dt: number, nowMs: number): void {
		for (const seid of this.frameSoldierEids) {
			if (!this.soldierVisuals.has(seid)) continue;
			if (Health.hp[seid] <= 0) {
				this.killSoldier(seid);
				continue;
			}
			let target = SoldierStats.targetEnemyEid[seid];
			if (target === 0 || !this.enemyVisuals.has(target)) {
				target = this.findEnemyForSoldier(seid);
				SoldierStats.targetEnemyEid[seid] = target >= 0 ? target : 0;
			}
			if (SoldierStats.targetEnemyEid[seid] === 0) {
				const hp = Health.hp[seid];
				const maxHp = Health.maxHp[seid];
				if (hp < maxHp) {
					const armouryEid = SoldierStats.armouryEid[seid];
					const armoury =
						armouryEid >= 0
							? this.buildingByEid.get(armouryEid)
							: undefined;
					if (
						armoury &&
						armoury.kind === 'armoury' &&
						!BuildingState.destroyed[armouryEid]
					) {
						const ax = armoury.x;
						const ay = armoury.y;
						const dx = ax - Position.x[seid];
						const dy = ay - Position.y[seid];
						const dist = Math.sqrt(dx * dx + dy * dy);
						const healRange =
							TILE * GAME_CONFIG.soldierHealRangeRatio;
						if (dist <= healRange) {
							Health.hp[seid] = Math.min(
								maxHp,
								hp + GAME_CONFIG.soldierHealPerSec * dt,
							);
						} else {
							const step = SoldierStats.speed[seid] * dt;
							if (step >= dist) {
								Position.x[seid] = ax;
								Position.y[seid] = ay;
							} else {
								Position.x[seid] += (dx / dist) * step;
								Position.y[seid] += (dy / dist) * step;
							}
						}
					}
				}
				this.syncSoldierVisuals(seid);
				continue;
			}
			target = SoldierStats.targetEnemyEid[seid];
			const tx = Position.x[target];
			const ty = Position.y[target];
			const dx = tx - Position.x[seid];
			const dy = ty - Position.y[seid];
			const dist = Math.sqrt(dx * dx + dy * dy);
			const range = SoldierStats.attackRange[seid];
			if (dist <= range) {
				if (
					nowMs - SoldierStats.lastAttackAtMs[seid] >=
					SoldierStats.attackRateMs[seid]
				) {
					SoldierStats.lastAttackAtMs[seid] = nowMs;
					if (SoldierStats.unitKind[seid] === SOLDIER_KIND.archer) {
						this.fireArcherShot(
							seid,
							target,
							SoldierStats.attackDamage[seid],
						);
					} else {
						this.damageEnemy(
							target,
							SoldierStats.attackDamage[seid],
						);
					}
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
		const hp = Health.hp[seid];
		const maxHp = Health.maxHp[seid];
		if (hp < maxHp) {
			const barWidth = TILE * 0.5;
			v.hpBarBg.setVisible(true);
			v.hpBar.setVisible(true);
			v.hpBarBg.setPosition(x, y - TILE * 0.32);
			v.hpBar.setPosition(x - barWidth / 2, y - TILE * 0.32);
			v.hpBar.width = (hp / maxHp) * barWidth;
		} else {
			v.hpBarBg.setVisible(false);
			v.hpBar.setVisible(false);
		}
	}

	private updateEnemies(dt: number, nowMs: number): void {
		for (const eid of this.frameEnemyEids) {
			if (!this.enemyVisuals.has(eid)) continue;
			const hpCheck = Health.hp[eid];
			const maxHpCheck = Health.maxHp[eid];
			if (
				hpCheck <= 0 ||
				!Number.isFinite(hpCheck) ||
				(maxHpCheck > 0 && hpCheck <= maxHpCheck * 0.05)
			) {
				this.killEnemy(eid, true);
				continue;
			}
			if (hasStatus(eid, STATUS_KIND.burn, nowMs)) {
				const dps = statusMagnitude(eid, STATUS_KIND.burn);
				if (dps > 0) {
					this.applyDamage(
						eid,
						dps * dt,
						DAMAGE_TYPE.fire,
						DAMAGE_FLAG.ignoresArmor,
					);
					if (Health.hp[eid] <= 0) continue;
				}
			}

			if (EnemyStats.canAttack[eid] === 1) {
				let targetEid = EnemyStats.targetEid[eid];
				let targetKind = EnemyStats.targetKind[eid];
				if (
					targetKind !== ATTACK_TARGET_KIND.none &&
					!this.targetAlive(targetEid, targetKind)
				) {
					targetKind = ATTACK_TARGET_KIND.none;
					EnemyStats.targetKind[eid] = ATTACK_TARGET_KIND.none;
				}
				if (targetKind === ATTACK_TARGET_KIND.none) {
					if (this.findAttackTargetFor(eid)) {
						targetEid = EnemyStats.targetEid[eid];
						targetKind = EnemyStats.targetKind[eid];
					}
				} else {
					const tx =
						targetKind === ATTACK_TARGET_KIND.building
							? Position.x[targetEid]
							: Position.x[targetEid];
					const ty =
						targetKind === ATTACK_TARGET_KIND.building
							? Position.y[targetEid]
							: Position.y[targetEid];
					const dx = tx - Position.x[eid];
					const dy = ty - Position.y[eid];
					const range = EnemyStats.attackRange[eid];
					if (dx * dx + dy * dy > range * range * 2.25) {
						targetKind = ATTACK_TARGET_KIND.none;
						EnemyStats.targetKind[eid] = ATTACK_TARGET_KIND.none;
					}
				}

				if (targetKind !== ATTACK_TARGET_KIND.none) {
					if (
						nowMs - EnemyStats.lastAttackAtMs[eid] >=
						EnemyStats.attackRateMs[eid]
					) {
						EnemyStats.lastAttackAtMs[eid] = nowMs;
						this.applyTargetDamage(
							targetEid,
							targetKind,
							EnemyStats.attackDamage[eid],
						);
					}
					this.recomputeEnemyMovement(eid, nowMs);
					const speed =
						Movement.speed[eid] *
						GAME_CONFIG.enemyAttackSpeedFactor;
					if (speed > 0) this.moveAlongPath(eid, speed, dt);
					this.updateEnemyVisuals(eid, nowMs);
					continue;
				}
			}

			this.recomputeEnemyMovement(eid, nowMs);
			const speed = Movement.speed[eid];
			this.moveAlongPath(eid, speed, dt);
			this.updateEnemyVisuals(eid, nowMs);
		}
	}

	private recomputeEnemyMovement(eid: number, nowMs: number): void {
		const baseSpeed = Movement.baseSpeed[eid];
		const maxHp = Health.maxHp[eid];
		const hp = Health.hp[eid];
		let wounded = 1;
		if (hp <= 0 || !Number.isFinite(hp) || !Number.isFinite(maxHp)) {
			wounded = 0;
		} else if (maxHp > 0) {
			const hpRatio = hp / maxHp;
			if (hpRatio <= 0.3) wounded = 0;
			else if (hpRatio < 0.5) wounded = ((hpRatio - 0.3) / 0.2) * 0.85;
		}
		const slow = hasStatus(eid, STATUS_KIND.slow, nowMs)
			? statusMagnitude(eid, STATUS_KIND.slow)
			: 1;
		const next = baseSpeed * wounded * slow;
		Movement.speed[eid] = next;
		const frozen = next <= 0;
		Movement.frozen[eid] = frozen ? 1 : 0;
		const hasImmobile = hasComponent(this.world, eid, ImmobileTag);
		if (frozen && !hasImmobile) {
			addComponent(this.world, eid, ImmobileTag);
		} else if (!frozen && hasImmobile) {
			removeComponent(this.world, eid, ImmobileTag);
		}
	}

	private moveAlongPath(eid: number, speed: number, dt: number): void {
		let segIdx = EnemyStats.pathIndex[eid] - 1;
		let remaining = speed * dt;
		while (remaining > 0) {
			const seg = this.path.segments[segIdx];
			if (!seg) {
				this.killEnemy(eid, false);
				this.lives -= 1;
				if (this.lives <= 0) this.endGame(false);
				return;
			}
			const tDelta = remaining * seg.invLen;
			const nextT = EnemyStats.segmentT[eid] + tDelta;
			if (nextT < 1) {
				EnemyStats.segmentT[eid] = nextT;
				Position.x[eid] = seg.startX + seg.dx * nextT;
				Position.y[eid] = seg.startY + seg.dy * nextT;
				return;
			}
			const overshoot = (nextT - 1) * seg.len;
			Position.x[eid] = seg.endX;
			Position.y[eid] = seg.endY;
			segIdx += 1;
			EnemyStats.pathIndex[eid] = segIdx + 1;
			EnemyStats.segmentT[eid] = 0;
			remaining = overshoot;
		}
	}

	private updateEnemyVisuals(eid: number, nowMs: number): void {
		const v = this.enemyVisuals.get(eid);
		if (!v) return;
		const x = Position.x[eid];
		const y = Position.y[eid];
		v.sprite.setPosition(x, y);
		const hpEnemy = Health.hp[eid];
		const maxHpEnemy = Health.maxHp[eid];
		if (hpEnemy < maxHpEnemy) {
			v.hpBarBg.setVisible(true);
			v.hpBar.setVisible(true);
			v.hpBarBg.setPosition(x, y - TILE * 0.5);
			v.hpBar.setPosition(x - v.barWidth / 2, y - TILE * 0.5);
			const ratio = maxHpEnemy > 0 ? hpEnemy / maxHpEnemy : 0;
			v.hpBar.width = Math.max(0, ratio) * v.barWidth;
			const hpColor =
				ratio > 0.6
					? COLORS.enemyHpBar
					: ratio > 0.3
						? 0xf6ad55
						: 0xfc8181;
			v.hpBar.setFillStyle(hpColor);
		} else {
			v.hpBarBg.setVisible(false);
			v.hpBar.setVisible(false);
		}
		const slowed = hasStatus(eid, STATUS_KIND.slow, nowMs);
		const burning = hasStatus(eid, STATUS_KIND.burn, nowMs);
		const anyStatus = slowed || burning;
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
			v.statusVisible = false;
		}
	}

	private updateTowers(nowMs: number): void {
		for (let i = 0; i < this.frameTowerEids.length; i++) {
			const eid = this.frameTowerEids[i];
			if (BuildingState.destroyed[eid]) continue;
			if (!BuildingState.online[eid]) continue;
			const b = this.buildingByEid.get(eid);
			if (!b || b.kind !== 'tower') continue;
			if (nowMs - TowerState.lastFireAtMs[eid] < towerFireRateMs(b))
				continue;
			if (TowerState.hasFixedTarget[eid] === 1) {
				TowerState.lastFireAtMs[eid] = nowMs;
				this.fireAt(
					b,
					TowerState.fixedTargetX[eid],
					TowerState.fixedTargetY[eid],
					null,
				);
				continue;
			}
			const targetEid = this.findTarget(b, nowMs);
			if (targetEid === null) continue;
			TowerState.lastFireAtMs[eid] = nowMs;
			this.fireAt(
				b,
				Position.x[targetEid],
				Position.y[targetEid],
				targetEid,
			);
		}
	}

	private syncTowerFireFrames(nowMs: number): void {
		const recoilWindow = 150;
		for (let i = 0; i < this.frameTowerEids.length; i++) {
			const eid = this.frameTowerEids[i];
			if (BuildingState.destroyed[eid]) continue;
			const b = this.buildingByEid.get(eid);
			if (!b || b.kind !== 'tower') continue;
			const elapsed = nowMs - TowerState.lastFireAtMs[eid];
			const wantFire = elapsed >= 0 && elapsed < recoilWindow;
			const desired = wantFire ? 'fire' : 'idle';
			const desiredKey = buildingTextureKey(b.spec.id, desired);
			if (b.sprite.texture.key !== desiredKey) {
				b.sprite.setTexture(desiredKey);
			}
		}
	}

	private findTarget(t: TowerBuilding, nowMs: number): number | null {
		const range = towerRange(t);
		if (t.spec.arcHeight > 0 && !t.spec.avoidSlowed) {
			return this.leadEnemyEid >= 0 ? this.leadEnemyEid : null;
		}
		let best = -1;
		let bestProgress = -1;
		const skipSlowed = t.spec.avoidSlowed;
		this.forEachEnemyInRange(t.x, t.y, range, (eid) => {
			if (skipSlowed && hasStatus(eid, STATUS_KIND.slow, nowMs)) return;
			const prog = EnemyStats.pathIndex[eid];
			if (prog > bestProgress) {
				bestProgress = prog;
				best = eid;
			}
		});
		return best >= 0 ? best : null;
	}

	private acquireProjectileSprite(
		x: number,
		y: number,
		radius: number,
		color: number,
	): Phaser.GameObjects.Arc {
		const pooled = this.projectileSpritePool.pop();
		if (pooled) {
			pooled.setPosition(x, y);
			pooled.setRadius(radius);
			pooled.setFillStyle(color);
			pooled.setActive(true);
			pooled.setVisible(true);
			return pooled;
		}
		return this.add.circle(x, y, radius, color);
	}

	private releaseProjectileSprite(sprite: Phaser.GameObjects.Arc): void {
		sprite.setActive(false);
		sprite.setVisible(false);
		this.projectileSpritePool.push(sprite);
	}

	private acquireArc(
		x: number,
		y: number,
		radius: number,
		color: number,
		alpha = 1,
	): Phaser.GameObjects.Arc {
		const pooled = this.arcPool.pop();
		if (pooled) {
			pooled
				.setPosition(x, y)
				.setRadius(radius)
				.setFillStyle(color, alpha)
				.setStrokeStyle();
			pooled.setActive(true).setVisible(true).setAlpha(1).setScale(1);
			return pooled;
		}
		return this.add.circle(x, y, radius, color, alpha);
	}

	private releaseArc(sprite: Phaser.GameObjects.Arc): void {
		sprite
			.setActive(false)
			.setVisible(false)
			.setStrokeStyle()
			.setPosition(-1000, -1000);
		this.arcPool.push(sprite);
	}

	private acquireRect(
		x: number,
		y: number,
		w: number,
		h: number,
		color: number,
		alpha = 1,
	): Phaser.GameObjects.Rectangle {
		const pooled = this.rectPool.pop();
		if (pooled) {
			pooled
				.setPosition(x, y)
				.setSize(w, h)
				.setFillStyle(color, alpha)
				.setOrigin(0.5);
			pooled.setActive(true).setVisible(true).setAlpha(1);
			return pooled;
		}
		return this.add.rectangle(x, y, w, h, color, alpha);
	}

	private releaseRect(rect: Phaser.GameObjects.Rectangle): void {
		rect.setActive(false)
			.setVisible(false)
			.setStrokeStyle()
			.setPosition(-1000, -1000);
		this.rectPool.push(rect);
	}

	private acquireGraphics(): Phaser.GameObjects.Graphics {
		const pooled = this.graphicsPool.pop();
		if (pooled) {
			pooled.clear();
			pooled.setActive(true).setVisible(true);
			return pooled;
		}
		return this.add.graphics();
	}

	private releaseGraphics(g: Phaser.GameObjects.Graphics): void {
		g.clear();
		g.setActive(false).setVisible(false);
		this.graphicsPool.push(g);
	}

	private acquireLine(
		x1: number,
		y1: number,
		x2: number,
		y2: number,
		color: number,
		alpha = 1,
		width = 2,
	): Phaser.GameObjects.Line {
		const pooled = this.linePool.pop();
		if (pooled) {
			pooled
				.setTo(x1, y1, x2, y2)
				.setStrokeStyle(width, color, alpha)
				.setLineWidth(width)
				.setOrigin(0, 0);
			pooled.setActive(true).setVisible(true).setAlpha(alpha);
			return pooled;
		}
		return this.add
			.line(0, 0, x1, y1, x2, y2, color)
			.setOrigin(0, 0)
			.setLineWidth(width)
			.setAlpha(alpha);
	}

	private releaseLine(line: Phaser.GameObjects.Line): void {
		line.setActive(false).setVisible(false);
		this.linePool.push(line);
	}

	private acquireImage(
		x: number,
		y: number,
		key: string,
	): Phaser.GameObjects.Image {
		const pooled = this.imagePool.pop();
		if (pooled) {
			pooled.setPosition(x, y).setTexture(key).setOrigin(0.5).clearTint();
			pooled.setActive(true).setVisible(true).setAlpha(1).setScale(1);
			return pooled;
		}
		return this.add.image(x, y, key).setOrigin(0.5);
	}

	private releaseImage(img: Phaser.GameObjects.Image): void {
		img.clearTint();
		img.setActive(false)
			.setVisible(false)
			.setPosition(-1000, -1000)
			.setScale(1);
		this.imagePool.push(img);
	}

	private fireAt(
		t: TowerBuilding,
		targetX: number,
		targetY: number,
		enemyId: number | null,
	): void {
		const spec = t.spec;
		const radius = spec.arcHeight > 0 ? 6 : 4;
		const sprite = this.acquireProjectileSprite(
			t.x,
			t.y,
			radius,
			spec.projectileColor,
		);
		const totalDist = Math.hypot(targetX - t.x, targetY - t.y);
		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, ProjectileTag);
		addComponent(this.world, eid, ProjectileStats);
		Position.x[eid] = t.x;
		Position.y[eid] = t.y;
		ProjectileStats.startX[eid] = t.x;
		ProjectileStats.startY[eid] = t.y;
		ProjectileStats.targetX[eid] = targetX;
		ProjectileStats.targetY[eid] = targetY;
		ProjectileStats.traveled[eid] = 0;
		ProjectileStats.totalDist[eid] = totalDist;
		ProjectileStats.speed[eid] = spec.projectileSpeed;
		ProjectileStats.arcHeight[eid] = spec.arcHeight;
		ProjectileStats.homing[eid] = spec.homing ? 1 : 0;
		ProjectileStats.enemyEid[eid] =
			spec.homing && enemyId !== null ? enemyId : -1;
		ProjectileStats.damage[eid] = towerDamage(t);
		ProjectileStats.burnDps[eid] = towerBurnDps(t);
		ProjectileStats.burnMs[eid] = spec.burnMs;
		ProjectileStats.burnRadius[eid] = spec.burnRadius;
		ProjectileStats.splashRadius[eid] = spec.splashRadius;
		ProjectileStats.slowMs[eid] = spec.slowMs;
		ProjectileStats.slowFactor[eid] = spec.slowFactor;
		ProjectileStats.damageType[eid] = spec.damageType;
		this.projectileVisuals.set(eid, { sprite });
	}

	private isEnemyAlive(eid: number | null): eid is number {
		return eid !== null && eid >= 0 && this.enemyVisuals.has(eid);
	}

	private updateProjectiles(dt: number, nowMs: number): void {
		this.projectileDeathRow.length = 0;
		for (const eid of query(this.world, [ProjectileTag, Position])) {
			const v = this.projectileVisuals.get(eid);
			if (!v) {
				this.projectileDeathRow.push(eid);
				continue;
			}
			const speed = ProjectileStats.speed[eid];
			if (ProjectileStats.homing[eid] === 1) {
				const targetEid = ProjectileStats.enemyEid[eid];
				if (this.isEnemyAlive(targetEid)) {
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
					this.applyProjectileHit(eid, nowMs, px, py);
					this.projectileDeathRow.push(eid);
				} else {
					Position.x[eid] = px + (dx / dist) * step;
					Position.y[eid] = py + (dy / dist) * step;
					v.sprite.setPosition(Position.x[eid], Position.y[eid]);
				}
			} else {
				ProjectileStats.traveled[eid] += speed * dt;
				const total = ProjectileStats.totalDist[eid];
				const tt =
					total > 0
						? Math.min(1, ProjectileStats.traveled[eid] / total)
						: 1;
				const sx = ProjectileStats.startX[eid];
				const sy = ProjectileStats.startY[eid];
				const tx = ProjectileStats.targetX[eid];
				const ty = ProjectileStats.targetY[eid];
				const baseX = sx + (tx - sx) * tt;
				const baseY = sy + (ty - sy) * tt;
				const arcOffset =
					-Math.sin(Math.PI * tt) * ProjectileStats.arcHeight[eid];
				Position.x[eid] = baseX;
				Position.y[eid] = baseY + arcOffset;
				v.sprite.setPosition(Position.x[eid], Position.y[eid]);
				if (tt >= 1) {
					this.applyProjectileHit(eid, nowMs, tx, ty);
					this.projectileDeathRow.push(eid);
				}
			}
		}
		for (let i = 0; i < this.projectileDeathRow.length; i++) {
			const eid = this.projectileDeathRow[i];
			const v = this.projectileVisuals.delete(eid);
			if (v) this.releaseProjectileSprite(v.sprite);
			this.removeEntityQueue.push(eid);
		}
	}

	private applyProjectileHit(
		eid: number,
		nowMs: number,
		x: number,
		y: number,
	): void {
		const burnDps = ProjectileStats.burnDps[eid];
		const burnMs = ProjectileStats.burnMs[eid];
		const burnRadius = ProjectileStats.burnRadius[eid];
		if (burnDps > 0 && burnMs > 0 && burnRadius > 0) {
			this.spawnBurnPatch(x, y, burnRadius, burnDps, nowMs + burnMs);
			return;
		}
		const damage = ProjectileStats.damage[eid];
		const dmgType = ProjectileStats.damageType[eid];
		const splashRadius = ProjectileStats.splashRadius[eid];
		if (splashRadius > 0) {
			this.forEachEnemyInRange(x, y, splashRadius, (id) => {
				this.applyDamage(id, damage, dmgType, DAMAGE_FLAG.none);
				if (Health.hp[id] > 0) {
					const v = this.enemyVisuals.get(id);
					if (v) this.flashSprite(v.sprite, 0xffffff);
				}
			});
			this.spawnSplashFlash(x, y, splashRadius);
			return;
		}
		const targetEid = ProjectileStats.enemyEid[eid];
		if (this.isEnemyAlive(targetEid)) {
			this.applyDamage(targetEid, damage, dmgType, DAMAGE_FLAG.none);
			if (Health.hp[targetEid] > 0) {
				const v = this.enemyVisuals.get(targetEid);
				if (v) this.flashSprite(v.sprite, 0xffffff);
			}
			const slowMs = ProjectileStats.slowMs[eid];
			if (this.isEnemyAlive(targetEid) && slowMs > 0) {
				applyStatus(
					targetEid,
					STATUS_KIND.slow,
					nowMs + slowMs,
					ProjectileStats.slowFactor[eid],
					slowMs,
				);
			}
		}
	}

	private damageEnemy(eid: number, dmg: number): void {
		this.applyDamage(eid, dmg, DAMAGE_TYPE.kinetic, DAMAGE_FLAG.none);
		if (Health.hp[eid] <= 0) return;
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
		const sprite = this.acquireArc(x, y, radius, COLORS.burnPatch, 0.25);
		sprite.setStrokeStyle(2, COLORS.burnPatch, 0.6);
		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, BurnPatchTag);
		addComponent(this.world, eid, BurnPatchStats);
		Position.x[eid] = x;
		Position.y[eid] = y;
		BurnPatchStats.radius[eid] = radius;
		BurnPatchStats.dps[eid] = dps;
		BurnPatchStats.expiresAtMs[eid] = expiresAtMs;
		this.burnPatchVisuals.set(eid, { sprite });
	}

	private spawnSplashFlash(x: number, y: number, radius: number): void {
		const flash = this.acquireArc(x, y, radius, 0xfbd38d, 0.45);
		this.tweens.add({
			targets: flash,
			alpha: 0,
			scale: 1.2,
			duration: 220,
			onComplete: () => this.releaseArc(flash),
		});
	}

	private updateBurnPatches(dt: number, nowMs: number): void {
		this.burnPatchDeathRow.length = 0;
		for (const eid of query(this.world, [BurnPatchTag, Position])) {
			const expires = BurnPatchStats.expiresAtMs[eid];
			const v = this.burnPatchVisuals.get(eid);
			if (nowMs >= expires) {
				this.burnPatchDeathRow.push(eid);
				continue;
			}
			const x = Position.x[eid];
			const y = Position.y[eid];
			const radius = BurnPatchStats.radius[eid];
			const dps = BurnPatchStats.dps[eid];
			this.forEachEnemyInRange(x, y, radius, (enemyEid) => {
				const currentDps = statusMagnitude(enemyEid, STATUS_KIND.burn);
				applyStatus(
					enemyEid,
					STATUS_KIND.burn,
					nowMs + 500,
					currentDps > dps ? currentDps : dps,
				);
			});
			if (v) {
				const remaining = (expires - nowMs) / 1000;
				v.sprite.setAlpha(0.1 + Math.min(0.25, remaining * 0.1));
			}
		}
		for (let i = 0; i < this.burnPatchDeathRow.length; i++) {
			const eid = this.burnPatchDeathRow[i];
			const v = this.burnPatchVisuals.delete(eid);
			if (v) this.releaseArc(v.sprite);
			this.removeEntityQueue.push(eid);
		}
	}

	private updateRepair(dt: number): void {
		const dtMs = dt * 1000;
		for (let i = 0; i < this.frameRepairEids.length; i++) {
			const eid = this.frameRepairEids[i];
			if (BuildingState.destroyed[eid]) continue;
			if (!BuildingState.online[eid]) continue;
			const b = this.buildingByEid.get(eid);
			if (!b || b.kind !== 'repair') continue;
			const activeDrone = RepairState.activeDroneEid[eid];
			if (activeDrone >= 0 && this.droneVisuals.has(activeDrone))
				continue;
			RepairState.cooldownLeftMs[eid] -= dtMs;
			if (RepairState.cooldownLeftMs[eid] > 0) continue;
			const target = this.findRepairTarget(b);
			if (!target) {
				RepairState.cooldownLeftMs[eid] = 0;
				continue;
			}
			RepairState.cooldownLeftMs[eid] = repairCooldownMs(b);
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
		for (const deid of deathRow) this.killDrone(deid);
	}

	private updateEnemyHover(): void {
		const pointer = this.input.activePointer;
		const px = pointer.worldX;
		const py = pointer.worldY;
		if (
			py < HUD_HEIGHT ||
			py > BASE_HEIGHT - PALETTE_HEIGHT ||
			pointer.isDown
		) {
			if (enemyHoverAtom.get() !== null) enemyHoverAtom.set(null);
			return;
		}
		let bestEid = -1;
		let bestDist2 = TILE * TILE * 0.5;
		for (const eid of this.frameEnemyEids) {
			if (!this.enemyVisuals.has(eid)) continue;
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
		const cam = this.cameras.main;
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

	private deathSystem(): void {
		for (const eid of query(this.world, [HealthTag])) {
			if (Health.hp[eid] > 0) continue;
			if (!hasComponent(this.world, eid, DeadTag)) {
				addComponent(this.world, eid, DeadTag);
			}
			if (hasComponent(this.world, eid, EnemyTag)) {
				if (this.enemyVisuals.has(eid)) this.killEnemy(eid, false);
			} else if (hasComponent(this.world, eid, SoldierTag)) {
				if (this.soldierVisuals.has(eid)) this.killSoldier(eid);
			} else if (hasComponent(this.world, eid, BuildingTag)) {
				if (BuildingState.destroyed[eid]) continue;
				const b = this.buildingByEid.get(eid);
				if (b) this.destroyBuilding(b);
			}
		}
	}

	private drainRemoveEntityQueue(): void {
		if (this.removeEntityQueue.length === 0) return;
		for (let i = 0; i < this.removeEntityQueue.length; i++) {
			removeEntity(this.world, this.removeEntityQueue[i]);
		}
		this.removeEntityQueue.length = 0;
	}

	private tickAuraEmitters(nowMs: number): void {
		for (const eid of query(this.world, [AuraEmitterTag, Position])) {
			if (nowMs < AuraEmitter.nextTickAtMs[eid]) continue;
			if (
				hasComponent(this.world, eid, BuildingTag) &&
				(BuildingState.destroyed[eid] || !BuildingState.online[eid])
			) {
				AuraEmitter.nextTickAtMs[eid] =
					nowMs + AuraEmitter.intervalMs[eid];
				continue;
			}
			AuraEmitter.nextTickAtMs[eid] = nowMs + AuraEmitter.intervalMs[eid];
			const kind = AuraEmitter.kind[eid];
			const magnitude = AuraEmitter.magnitude[eid];
			let range = AuraEmitter.range[eid];
			if (kind === AURA_KIND.repairArmor) {
				const station = this.buildingByEid.get(eid);
				if (station && station.kind === 'repair') {
					range = repairRange(station);
				}
				const rangeSq = range * range;
				const sx = Position.x[eid];
				const sy = Position.y[eid];
				for (const beid of this.frameBuildingEids) {
					if (beid === eid) continue;
					if (BuildingState.destroyed[beid]) continue;
					const max = Armor.maxArmor[beid];
					const cur = Armor.armor[beid];
					if (cur >= max) continue;
					const dx = Position.x[beid] - sx;
					const dy = Position.y[beid] - sy;
					if (dx * dx + dy * dy > rangeSq) continue;
					const room = max - cur;
					Armor.armor[beid] =
						cur + (magnitude < room ? magnitude : room);
				}
			}
		}
	}

	private findRepairTarget(station: RepairBuilding): Building | null {
		let best: Building | null = null;
		let bestRatio = 1;
		const range = repairRange(station);
		const rangeSq = range * range;
		for (const beid of this.frameBuildingEids) {
			const b = this.buildingByEid.get(beid);
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

	private spawnDrone(station: RepairBuilding, target: Building): void {
		const sprite = this.acquireArc(
			station.x,
			station.y,
			5,
			COLORS.repairDrone,
		);
		const beam = this.acquireLine(
			station.x,
			station.y,
			target.x,
			target.y,
			COLORS.repairBeam,
			0.7,
			2,
		);
		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, DroneTag);
		addComponent(this.world, eid, DroneStats);
		Position.x[eid] = station.x;
		Position.y[eid] = station.y;
		DroneStats.speed[eid] = GAME_CONFIG.repairDroneSpeed;
		DroneStats.state[eid] = DroneState.Outbound;
		DroneStats.stationEid[eid] = station.id;
		DroneStats.targetEid[eid] = target.id;
		DroneStats.repairAmount[eid] = repairAmount(station);
		this.droneVisuals.set(eid, { sprite, beam });
		RepairState.activeDroneEid[station.id] = eid;
	}

	private killEnemy(eid: number, reward: boolean): void {
		const v = this.enemyVisuals.delete(eid);
		if (!v) return;
		this.releaseImage(v.sprite);
		this.releaseGraphics(v.statusRing);
		this.releaseRect(v.hpBar);
		this.releaseRect(v.hpBarBg);
		if (reward) {
			this.gold += Math.round(
				GAME_CONFIG.goldPerKill *
					EnemyStats.bountyMultiplier[eid] *
					this.bountyBonusMultiplier,
			);
		}
		this.removeEntityQueue.push(eid);
	}

	private endGame(win: boolean): void {
		this.isGameOver = true;
		this.placementPreview.setVisible(false);
		this.placementRange.setVisible(false);
		const previousBest = loadBestWave();
		const newRecord = this.wave > previousBest;
		if (newRecord) {
			saveBestWave(this.wave);
			bestWaveAtom.set(this.wave);
		}
		gameOverAtom.set({
			visible: true,
			win,
			wave: this.wave,
			bestBefore: previousBest,
			newRecord,
		});
	}

	update(_time: number, deltaMs: number): void {
		if (this.isGameOver) return;
		if (this.awaitingCardPick) {
			this.refreshHud();
			return;
		}
		const factor = this.speedFactor;
		if (factor <= 0) {
			this.refreshHud();
			return;
		}
		const scaledDeltaMs = deltaMs * factor;
		const dt = scaledDeltaMs / 1000;
		this.simNow += scaledDeltaMs;
		const nowMs = this.simNow;

		if (this.enemiesToSpawn > 0) {
			this.spawnAccumulatorMs += scaledDeltaMs;
			while (
				this.spawnAccumulatorMs >= GAME_CONFIG.enemySpawnIntervalMs &&
				this.enemiesToSpawn > 0
			) {
				this.spawnAccumulatorMs -= GAME_CONFIG.enemySpawnIntervalMs;
				this.spawnEnemy();
				this.enemiesToSpawn -= 1;
			}
		} else if (this.enemyVisuals.size === 0) {
			this.pushNextWavePreview();
			if (
				this.wave >= 1 &&
				!this.cardPickedThisInterval &&
				!cardOptionsAtom.get()
			) {
				this.openCardPanel();
			} else {
				this.interWaveDelayMs -= scaledDeltaMs;
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
		this.rebuildBuildingFrameCaches();
		this.rebuildEnemyGrid();

		this.updateBurnPatches(dt, nowMs);
		this.updateEnemies(dt, nowMs);
		this.updateTowers(nowMs);
		this.syncTowerFireFrames(nowMs);
		this.updateProjectiles(dt, nowMs);
		this.updateRepair(dt);
		this.updateArmouries(nowMs);
		this.updateSoldiers(dt, nowMs);

		this.tickAuraEmitters(nowMs);
		this.deathSystem();
		this.updateEnemyHover();
		this.drainRemoveEntityQueue();

		this.powerRefreshAccumulatorMs += scaledDeltaMs;
		if (this.powerRefreshAccumulatorMs >= 100) {
			this.recomputePower(this.powerRefreshAccumulatorMs / 1000);
			this.powerRefreshAccumulatorMs = 0;
		}

		this.refreshHud();
	}

	private openCardPanel(): void {
		this.awaitingCardPick = true;
		this.bountyBonusMultiplier = 1;
		const cards = pickCardsForWave(this.wave);
		cardWaveAtom.set(this.wave);
		cardOptionsAtom.set(cards);
	}

	private applyCardPick(card: CardOption): void {
		switch (card.id) {
			case 'bonus_gold':
				this.gold += 150 + this.wave;
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
			case 'structure_upgrade':
				inventoryAtom.set([
					...inventoryAtom.get(),
					createItem('field_promotion'),
				]);
				break;
			case 'item_call_allies':
				inventoryAtom.set([
					...inventoryAtom.get(),
					createItem('emergency_call_allies'),
				]);
				break;
		}
		this.closeCardPanel();
		this.cardPickedThisInterval = true;
		this.interWaveDelayMs = 1500;
	}

	private closeCardPanel(): void {
		cardOptionsAtom.set(null);
		this.awaitingCardPick = false;
	}

	private skipCardPick(): void {
		this.closeCardPanel();
		this.cardPickedThisInterval = true;
		this.interWaveDelayMs = 1500;
	}

	private pushNextWavePreview(): void {
		const next = this.wave + 1;
		const baseCount = Math.floor(
			GAME_CONFIG.enemiesPerWave +
				(next - 1) * GAME_CONFIG.enemiesPerWaveScale,
		);
		const bossCount = next % 5 === 0 ? 1 : 0;
		nextWavePreviewAtom.set({
			count: baseCount + bossCount,
			bossCount,
		});
	}

	private summonSoldierSquad(count: number): void {
		const alive: ArmouryBuilding[] = [];
		for (const eid of query(this.world, [ArmouryTag])) {
			if (BuildingState.destroyed[eid]) continue;
			const b = this.buildingByEid.get(eid);
			if (b && b.kind === 'armoury') alive.push(b);
		}
		if (alive.length === 0) {
			this.gold += 60;
			return;
		}
		for (let i = 0; i < count; i++) {
			this.spawnSoldier(alive[i % alive.length]);
		}
	}

	private healAllBuildings(): void {
		for (const eid of query(this.world, [BuildingTag])) {
			if (BuildingState.destroyed[eid]) continue;
			Health.hp[eid] = Health.maxHp[eid];
		}
	}

	private applyRandomUpgradeTo(b: Building): boolean {
		interface UpgradeCandidate {
			apply: () => void;
		}
		const candidates: UpgradeCandidate[] = [];
		if (b.kind === 'tower') {
			const tower = b;
			for (const k of UPGRADE_ORDER) {
				if (TowerUpgradeStats[k][tower.id] >= UPGRADE_DEFS[k].maxLevel)
					continue;
				candidates.push({
					apply: () => {
						const prevMaxHp = towerMaxHp(tower);
						TowerUpgradeStats[k][tower.id] += 1;
						const newMaxHp = towerMaxHp(tower);
						Health.maxHp[tower.id] = newMaxHp;
						if (k === 'armor') {
							const delta = newMaxHp - prevMaxHp;
							Health.hp[tower.id] = Math.min(
								newMaxHp,
								Health.hp[tower.id] + delta,
							);
						}
						this.redrawUpgradePips(tower);
					},
				});
			}
		} else if (b.kind === 'armoury') {
			const armoury = b;
			for (const k of ARMOURY_UPGRADE_ORDER) {
				if (
					ArmouryUpgradeStats[k][armoury.id] >=
					ARMOURY_UPGRADE_DEFS[k].maxLevel
				)
					continue;
				candidates.push({
					apply: () => {
						ArmouryUpgradeStats[k][armoury.id] += 1;
					},
				});
			}
		} else if (b.kind === 'repair') {
			const station = b;
			for (const k of REPAIR_UPGRADE_ORDER) {
				if (
					RepairUpgradeStats[k][station.id] >=
					REPAIR_UPGRADE_DEFS[k].maxLevel
				)
					continue;
				candidates.push({
					apply: () => {
						RepairUpgradeStats[k][station.id] += 1;
					},
				});
			}
		}
		if (candidates.length === 0) return false;
		const pick = candidates[Math.floor(Math.random() * candidates.length)];
		pick.apply();
		return true;
	}

	private boostBatteries(amount: number): void {
		let left = amount;
		for (const eid of query(this.world, [BatteryTag])) {
			if (BuildingState.destroyed[eid]) continue;
			const room = BatteryState.capacity[eid] - BatteryState.charge[eid];
			const add = Math.min(room, left);
			BatteryState.charge[eid] += add;
			left -= add;
			if (left <= 0) break;
		}
	}
}
