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
	type CastleSpec,
	type NexusSpec,
	type RepairUpgradeKind,
	type TowerSpec,
	type UpgradeKind,
	type VillageSpec,
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
	stackSlow,
	statusMagnitude,
	DroneStats,
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
	CastleState,
	CastleTag,
	NexusTag,
	TowerState,
	TowerTag,
	TowerUpgradeStats,
	VillageTag,
	type BurnPatchVisual,
	type DroneVisual,
	type EnemyVisual,
	type ProjectileVisual,
	type SoldierVisual,
} from './components';
import { pickCardsForWave, type CardOption } from './cards';
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
	freeTowersAtom,
	gameOverAtom,
	gameStateAtom,
	gameStatsAtom,
	goldAtom,
	playRequestSignalAtom,
	inventoryAtom,
	inventoryOpenAtom,
	livesAtom,
	nexusMaxHpAtom,
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
import { SfxPlayer } from './audio';
import { mulberry32, randomSeed, type Rand } from './random';
import {
	clearSnapshot,
	loadSnapshot,
	saveSnapshot,
	type SaveSnapshot,
	type SavedBuilding,
} from './state';
import {
	consumeBatteryCharge,
	createBuildingAmbience,
	createBuildingBaseVisual,
	createChargeBar,
	createPowerIndicator,
	disposeBuildingAmbience,
} from './buildings';
import {
	SpatialGrid,
	findAttackTargetFor,
	findEnemyForArcher,
	findEnemyForSoldier,
	findWeakestEnemyInRange,
	spawnTowerProjectile,
	stepProjectile,
	type ProjectileSpawnDeps,
	type ProjectileStepCtx,
	type TargetingCtx,
} from './combat';
import {
	FloatingTextPool,
	spawnBurnPatch as spawnBurnPatchExt,
	spawnParticleBurst,
	spawnSplashFlash as spawnSplashFlashExt,
	updateBurnPatches as updateBurnPatchesExt,
	type BurnPatchDeps,
	type ParticleBurstDeps,
} from './effects';
import {
	computeEnemyStats,
	createEnemyVisual,
	syncEnemyVisual,
	type EnemyVisualDeps,
} from './enemies';
import {
	applyRandomUpgradeTo as applyRandomUpgradeToExt,
	boostBatteries as boostBatteriesExt,
	healAllBuildings as healAllBuildingsExt,
	summonSoldierSquad as summonSoldierSquadExt,
	type CardCtx,
} from './cards';
import {
	spawnStunDrone as spawnStunDroneExt,
	updateRepair as updateRepairExt,
	updateStunDrones as updateStunDronesExt,
	type RepairDeps,
	type StunDroneDeps,
} from './drones';
import { drawGrass, drawGridLines, drawPath } from './environment';
import { createGameObjectPools, type GameObjectPools } from './pools';
import {
	tickAuraEmitters as tickAuraEmittersExt,
	type AuraTickDeps,
} from './auras';
import {
	DebugOverlay,
	HotkeyOverlay,
	PauseOverlay,
	updateEnemyHover as updateEnemyHoverExt,
	type DebugOverlayDeps,
	type HoverInfoDeps,
} from './ui';
import {
	spawnAllySoldier as spawnAllySoldierExt,
	spawnArmouryArcher,
	spawnArmourySoldier,
	spawnCastleUnit,
	syncSoldierVisual,
	type SpawnUnitDeps,
	type UnitVisualDeps,
} from './units';
import { createItem, type ItemId } from './items';
import { generatePath, type GeneratedPath } from './path-generator';
import {
	buildingTextureKey,
	ensureBuildingTextures,
	ensureEnemyTextures,
	ensureUnitTextures,
} from './art/sprite-mint';
import { computeAndApplyPower } from './systems';
import { planStarterKit } from './starter-kit';
import {
	armouryMaxSoldiers,
	armourySpawnIntervalMs,
	repairAmount,
	repairRange,
	towerDamage,
	towerFireRateMs,
	towerMaxHp,
	towerRange,
	towerTier,
	towerTierCost,
} from './stats';
import type {
	ArmouryBuilding,
	BaseBuilding,
	BatteryBuilding,
	Building,
	CastleBuilding,
	GeneratorBuilding,
	NexusBuilding,
	RepairBuilding,
	TowerBuilding,
	VillageBuilding,
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
	private enemySpatial: SpatialGrid = new SpatialGrid({
		cellSize: TowerDefenseScene.ENEMY_GRID_CELL,
		worldWidth: BASE_WIDTH,
		worldHeight: BASE_HEIGHT,
	});
	private soldierSpatial: SpatialGrid = new SpatialGrid({
		cellSize: TowerDefenseScene.ENEMY_GRID_CELL,
		worldWidth: BASE_WIDTH,
		worldHeight: BASE_HEIGHT,
	});
	private buildingSpatial: SpatialGrid = new SpatialGrid({
		cellSize: TowerDefenseScene.ENEMY_GRID_CELL,
		worldWidth: BASE_WIDTH,
		worldHeight: BASE_HEIGHT,
	});
	private leadEnemyEid = -1;
	private leadPathIndex = -1;
	private frameGeneratorEids: number[] = [];
	private frameBatteryEids: number[] = [];
	private frameTowerEids: number[] = [];
	private frameWallEids: number[] = [];
	private frameArmouryEids: number[] = [];
	private frameRepairEids: number[] = [];
	private frameVillageEids: number[] = [];
	private frameCastleEids: number[] = [];
	private frameConsumerEids: number[] = [];
	private archerTargetClaims = new Set<number>();
	private buildingByEid = new SideMap<Building>();
	private buildingAmbience = new SideMap<{
		sprites: Phaser.GameObjects.GameObject[];
		tweens: Phaser.Tweens.Tween[];
	}>();
	private droneVisuals = new SideMap<DroneVisual>();
	private stunDroneVisuals = new SideMap<Phaser.GameObjects.Arc>();
	private soldierVisuals = new SideMap<SoldierVisual>();
	private projectileVisuals = new SideMap<ProjectileVisual>();
	private projectileDeathRow: number[] = [];
	private burnPatchVisuals = new SideMap<BurnPatchVisual>();
	private burnPatchDeathRow: number[] = [];
	private removeEntityQueue: number[] = [];
	private pools: GameObjectPools = createGameObjectPools(this);

	private freeBasicTowers = 0;
	private bountyBonusMultiplier = 1;
	private awaitingCardPick = false;
	private lastCardPickN = 0;
	private lastCardSkipN = 0;
	private lastUseItemN = 0;
	private cardPickedThisInterval = false;
	private cardPicksRemaining = 1;

	private gold: number = GAME_CONFIG.startingGold;
	private lives: number = GAME_CONFIG.startingLives;
	private nexusEid = -1;
	private unitVisualDeps: UnitVisualDeps = {
		scene: this,
		acquireRect: (x, y, w, h, color, alpha) =>
			this.acquireRect(x, y, w, h, color, alpha),
	};
	private floatingText = new FloatingTextPool(this);
	private soldierSyncCtx = {
		enemyAlive: (eid: number) => this.enemyVisuals.has(eid),
	};
	private projectileSpawnDeps: ProjectileSpawnDeps = Object.defineProperties(
		{
			acquireProjectileSprite: (
				x: number,
				y: number,
				radius: number,
				color: number,
			) => this.acquireProjectileSprite(x, y, radius, color),
			consumeBatteryCharge: (amount: number) =>
				this.consumeBatteryCharge(amount),
		} as unknown as ProjectileSpawnDeps,
		{
			world: { get: () => this.world, enumerable: true },
			simNow: { get: () => this.simNow, enumerable: true },
			projectileVisuals: {
				get: () => this.projectileVisuals,
				enumerable: true,
			},
		},
	);
	private stunDroneDeps: StunDroneDeps = Object.defineProperties(
		{
			scene: this,
			enemyAlive: (eid: number) => this.enemyVisuals.has(eid),
			applyDamage: (
				targetEid: number,
				amount: number,
				type: number,
				flags: number,
			) => this.applyDamage(targetEid, amount, type, flags),
			findWeakestEnemyInRange: (x: number, y: number, range: number) =>
				this.findWeakestEnemyInRange(x, y, range),
		} as unknown as StunDroneDeps,
		{
			world: { get: () => this.world, enumerable: true },
			stunDroneVisuals: {
				get: () => this.stunDroneVisuals,
				enumerable: true,
			},
			removeEntityQueue: {
				get: () => this.removeEntityQueue,
				enumerable: true,
			},
		},
	);
	private auraDeps: AuraTickDeps = Object.defineProperties(
		{} as unknown as AuraTickDeps,
		{
			world: { get: () => this.world, enumerable: true },
			frameBuildingEids: {
				get: () => this.frameBuildingEids,
				enumerable: true,
			},
			buildingByEid: {
				get: () => this.buildingByEid,
				enumerable: true,
			},
		},
	);
	private hoverDeps: HoverInfoDeps = Object.defineProperties(
		{
			scene: this,
			hudHeight: HUD_HEIGHT,
			paletteHeight: PALETTE_HEIGHT,
			enemyAlive: (eid: number) => this.enemyVisuals.has(eid),
		} as unknown as HoverInfoDeps,
		{
			frameEnemyEids: {
				get: () => this.frameEnemyEids,
				enumerable: true,
			},
		},
	);
	private particleDeps: ParticleBurstDeps = {
		scene: this,
		acquireArc: (x, y, radius, color, alpha) =>
			this.acquireArc(x, y, radius, color, alpha),
		releaseArc: (sprite) => this.releaseArc(sprite),
	};
	private burnDeps: BurnPatchDeps = Object.defineProperties(
		{
			acquireArc: (
				x: number,
				y: number,
				radius: number,
				color: number,
				alpha?: number,
			) => this.acquireArc(x, y, radius, color, alpha),
			releaseArc: (sprite: Phaser.GameObjects.Arc) =>
				this.releaseArc(sprite),
			forEachEnemyInRange: (
				cx: number,
				cy: number,
				range: number,
				fn: (eid: number) => void,
			) => this.forEachEnemyInRange(cx, cy, range, fn),
		} as unknown as BurnPatchDeps,
		{
			world: { get: () => this.world, enumerable: true },
			tweens: { get: () => this.tweens, enumerable: true },
			burnPatchVisuals: {
				get: () => this.burnPatchVisuals,
				enumerable: true,
			},
			burnPatchDeathRow: {
				get: () => this.burnPatchDeathRow,
				enumerable: true,
			},
			removeEntityQueue: {
				get: () => this.removeEntityQueue,
				enumerable: true,
			},
		},
	);
	private cardCtx: CardCtx = Object.defineProperties(
		{
			spawnArmourySoldier: (b: ArmouryBuilding) => this.spawnSoldier(b),
			redrawUpgradePips: (b: TowerBuilding) => this.redrawUpgradePips(b),
		} as unknown as CardCtx,
		{
			world: { get: () => this.world, enumerable: true },
			buildingByEid: {
				get: () => this.buildingByEid,
				enumerable: true,
			},
		},
	);
	private repairDeps: RepairDeps = Object.defineProperties(
		{
			acquireArc: (
				x: number,
				y: number,
				radius: number,
				color: number,
				alpha?: number,
			) => this.acquireArc(x, y, radius, color, alpha),
			acquireLine: (
				x1: number,
				y1: number,
				x2: number,
				y2: number,
				color: number,
				alpha?: number,
				width?: number,
			) => this.acquireLine(x1, y1, x2, y2, color, alpha, width),
			killDrone: (eid: number) => this.killDrone(eid),
		} as unknown as RepairDeps,
		{
			world: { get: () => this.world, enumerable: true },
			frameRepairEids: {
				get: () => this.frameRepairEids,
				enumerable: true,
			},
			frameBuildingEids: {
				get: () => this.frameBuildingEids,
				enumerable: true,
			},
			buildingByEid: {
				get: () => this.buildingByEid,
				enumerable: true,
			},
			droneVisuals: {
				get: () => this.droneVisuals,
				enumerable: true,
			},
		},
	);
	private projectileStepCtx: ProjectileStepCtx = {
		enemyAlive: (eid: number) => this.enemyVisuals.has(eid),
		getVisual: (eid: number) => this.projectileVisuals.get(eid),
		onHit: (eid, nowMs, hitX, hitY) =>
			this.applyProjectileHit(eid, nowMs, hitX, hitY),
		onDead: (eid) => this.projectileDeathRow.push(eid),
	};
	private targetingCtx: TargetingCtx = Object.defineProperties(
		{
			enemyAlive: (eid: number) => this.enemyVisuals.has(eid),
			soldierAlive: (eid: number) => this.soldierVisuals.has(eid),
		} as TargetingCtx,
		{
			frameBuildingEids: {
				get: () => this.frameBuildingEids,
				enumerable: true,
			},
			frameSoldierEids: {
				get: () => this.frameSoldierEids,
				enumerable: true,
			},
			frameEnemyEids: {
				get: () => this.frameEnemyEids,
				enumerable: true,
			},
			archerTargetClaims: {
				get: () => this.archerTargetClaims,
				enumerable: true,
			},
			soldierGrid: {
				get: () => this.soldierSpatial,
				enumerable: true,
			},
			buildingGrid: {
				get: () => this.buildingSpatial,
				enumerable: true,
			},
		},
	);
	private enemyVisualDeps: EnemyVisualDeps = {
		scene: this,
		acquireImage: (x, y, key) => this.acquireImage(x, y, key),
		acquireGraphics: () => this.acquireGraphics(),
		acquireRect: (x, y, w, h, color, alpha) =>
			this.acquireRect(x, y, w, h, color, alpha),
	};
	private spawnUnitDeps: SpawnUnitDeps = Object.defineProperties(
		{
			scene: this,
			unitVisuals: this.unitVisualDeps,
			addDamageable: (
				eid: number,
				hp: number,
				armor: number,
				defense: number,
			) => this.addDamageable(eid, hp, armor, defense),
		} as unknown as SpawnUnitDeps,
		{
			world: { get: () => this.world, enumerable: true },
			soldierVisuals: {
				get: () => this.soldierVisuals,
				enumerable: true,
			},
		},
	);
	private wave = 0;
	private enemiesToSpawn = 0;
	private spawnAccumulatorMs = 0;
	private interWaveDelayMs = 0;
	private isGameOver = false;
	private statGoldEarned = 0;
	private statEnemiesKilled = 0;
	private statBossesKilled = 0;
	private statBuildingsBuilt = 0;
	private lastPlayRequestN = 0;

	private hudUnsubs: Array<() => void> = [];
	private lastSkipSignal = 0;
	private lastRestartSignal = 0;
	private simNow = 0;
	private speedFactor = 1;
	private isPaused = false;
	private speedFactorBeforePause = 1;
	private debugOverlay: DebugOverlay | null = null;
	private hotkeyOverlay: HotkeyOverlay | null = null;
	private pauseOverlay: PauseOverlay | null = null;
	private sfx: SfxPlayer = new SfxPlayer();
	private currentSeed: number = randomSeed();
	private rand: Rand = mulberry32(this.currentSeed);

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
	private burnTickAccumulatorMs = 0;

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
		this.enemySpatial = new SpatialGrid({
			cellSize: TowerDefenseScene.ENEMY_GRID_CELL,
			worldWidth: BASE_WIDTH,
			worldHeight: BASE_HEIGHT,
		});
		this.soldierSpatial = new SpatialGrid({
			cellSize: TowerDefenseScene.ENEMY_GRID_CELL,
			worldWidth: BASE_WIDTH,
			worldHeight: BASE_HEIGHT,
		});
		this.buildingSpatial = new SpatialGrid({
			cellSize: TowerDefenseScene.ENEMY_GRID_CELL,
			worldWidth: BASE_WIDTH,
			worldHeight: BASE_HEIGHT,
		});
		this.leadEnemyEid = -1;
		this.leadPathIndex = -1;
		this.frameGeneratorEids = [];
		this.frameBatteryEids = [];
		this.frameTowerEids = [];
		this.frameWallEids = [];
		this.frameArmouryEids = [];
		this.frameRepairEids = [];
		this.frameVillageEids = [];
		this.frameCastleEids = [];
		this.frameConsumerEids = [];
		this.buildingByEid = new SideMap<Building>();
		this.buildingAmbience = new SideMap();
		this.droneVisuals = new SideMap<DroneVisual>();
		this.stunDroneVisuals = new SideMap<Phaser.GameObjects.Arc>();
		this.soldierVisuals = new SideMap<SoldierVisual>();
		this.projectileVisuals = new SideMap<ProjectileVisual>();
		this.projectileDeathRow = [];
		this.burnPatchVisuals = new SideMap<BurnPatchVisual>();
		this.burnPatchDeathRow = [];
		this.removeEntityQueue = [];
		this.pools = createGameObjectPools(this);
		this.freeBasicTowers = 0;
		this.bountyBonusMultiplier = 1;
		this.awaitingCardPick = false;
		this.cardPickedThisInterval = false;
		this.lastCardPickN = cardPickSignalAtom.get().n;
		this.lastCardSkipN = cardSkipSignalAtom.get();
		this.lastUseItemN = useItemSignalAtom.get().n;
		this.gold = GAME_CONFIG.startingGold;
		this.lives = GAME_CONFIG.startingLives;
		this.nexusEid = -1;
		this.floatingText = new FloatingTextPool(this);
		this.wave = 0;
		this.enemiesToSpawn = 0;
		this.spawnAccumulatorMs = 0;
		this.interWaveDelayMs = 0;
		this.isGameOver = false;
		this.statGoldEarned = 0;
		this.statEnemiesKilled = 0;
		this.statBossesKilled = 0;
		this.statBuildingsBuilt = 0;
		this.lastPlayRequestN = playRequestSignalAtom.get();
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
		this.burnTickAccumulatorMs = 0;
		this.hudUnsubs = [];
		this.lastSkipSignal = skipSignalAtom.get();
		this.lastRestartSignal = restartSignalAtom.get();
		this.simNow = 0;
		this.speedFactor = 1;
		this.currentSeed = randomSeed();
		this.rand = mulberry32(this.currentSeed);
		resetHudStore();
		bestWaveAtom.set(loadBestWave());
	}

	create(): void {
		ensureBuildingTextures(this);
		ensureEnemyTextures(this);
		ensureUnitTextures(this);
		this.debugOverlay = new DebugOverlay(this);
		this.hotkeyOverlay = new HotkeyOverlay(this);
		this.pauseOverlay = new PauseOverlay(this);
		const snapPreview = loadSnapshot();
		if (snapPreview?.seed !== undefined) {
			this.currentSeed = snapPreview.seed;
			this.rand = mulberry32(this.currentSeed);
		}
		this.path = generatePath(this.rand);
		this.cameras.main.setBackgroundColor(COLORS.background);
		drawGrass(this);
		drawGridLines(this);
		drawPath(this, this.path);
		this.subscribeHudSignals();
		this.buildPlacementPreview();
		this.placeNexus();
		const snap = loadSnapshot();
		if (snap) {
			this.restoreFromSnapshot(snap);
			this.time.delayedCall(220, () => {
				this.floatingText.spawn({
					x: BASE_WIDTH / 2,
					y: BASE_HEIGHT * 0.3,
					text: `RESUMED · WAVE ${snap.wave}`,
					color: '#9ae6b4',
					rise: 50,
					fontSize: '22px',
					duration: 1200,
				});
			});
		} else {
			this.placeStarterKit();
		}
		this.time.delayedCall(360, () => {
			this.floatingText.spawn({
				x: BASE_WIDTH / 2,
				y: BASE_HEIGHT * 0.42,
				text: `SEED ${this.currentSeed}`,
				color: '#a0aec0',
				rise: 40,
				fontSize: '14px',
				duration: 1400,
			});
		});
		this.recomputePower(0);
		this.refreshHud();

		this.input.on('pointermove', this.onPointerMove, this);
		this.input.on('pointerdown', this.onPointerDown, this);

		const kb = this.input.keyboard;
		if (kb) {
			kb.on('keydown-R', () => {
				if (this.isGameOver) this.scene.restart();
			});
			kb.on('keydown-N', (e: KeyboardEvent) => {
				if (e.shiftKey) clearSnapshot();
				this.scene.restart();
			});
			kb.on('keydown-P', () => this.togglePause());
			kb.on('keydown-SPACE', () => this.togglePause());
			kb.on('keydown-F1', () => this.debugOverlay?.toggle());
			kb.on('keydown-T', () => this.promoteSelectedTower());
			kb.on('keydown-QUESTION_MARK', () => this.hotkeyOverlay?.toggle());
			kb.on('keydown-FORWARD_SLASH', () => this.hotkeyOverlay?.toggle());
			kb.on('keydown-F5', (e: KeyboardEvent) => {
				e.preventDefault?.();
				this.scene.restart();
			});
			kb.on('keydown-M', () => {
				const muted = this.sfx.toggleMute();
				this.floatingText.spawn({
					x: BASE_WIDTH / 2,
					y: BASE_HEIGHT * 0.35,
					text: muted ? 'AUDIO OFF' : 'AUDIO ON',
					color: '#a0aec0',
					rise: 40,
				});
			});
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
			if (!this.canSkipWave()) return;
			const remainingMs = this.interWaveDelayMs;
			const bonus = Math.floor(remainingMs / 250);
			if (bonus > 0) {
				this.gold += bonus;
				this.statGoldEarned += bonus;
				this.floatingText.spawn({
					x: BASE_WIDTH / 2,
					y: BASE_HEIGHT * 0.35,
					text: `+${bonus}g`,
					color: '#fbd38d',
					rise: 60,
					fontSize: '24px',
				});
			}
			this.interWaveDelayMs = 0;
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
		const playRequestUnsub = playRequestSignalAtom.subscribe((v) => {
			if (v === this.lastPlayRequestN) return;
			this.lastPlayRequestN = v;
			gameStateAtom.set('playing');
			gameStatsAtom.set(null);
			this.scene.restart();
		});
		this.hudUnsubs.push(
			skipUnsub,
			restartUnsub,
			speedUnsub,
			cardPickUnsub,
			cardSkipUnsub,
			useItemUnsub,
			playRequestUnsub,
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

	private placeNexus(): void {
		const wp = this.path.waypoints;
		const last = wp[wp.length - 2] ?? wp[wp.length - 1];
		const col = Math.floor(last.x / TILE);
		const row = Math.floor(last.y / TILE);
		const cx = col * TILE + TILE / 2;
		const cy = row * TILE + TILE / 2;
		const nexus = this.spawnBuilding('nexus', col, row, cx, cy);
		this.nexusEid = nexus.id;
		nexusMaxHpAtom.set(Health.maxHp[nexus.id]);
	}

	private placeStarterKit(): void {
		const items = planStarterKit(this.path.cells, this.path.startRow);
		for (const item of items) {
			const cx = item.col * TILE + TILE / 2;
			const cy = item.row * TILE + TILE / 2;
			this.spawnBuilding(item.id, item.col, item.row, cx, cy);
		}
	}

	private restoreFromSnapshot(snap: SaveSnapshot): void {
		this.gold = snap.gold;
		this.wave = snap.wave;
		this.freeBasicTowers = snap.freeBasicTowers ?? 0;
		this.bountyBonusMultiplier = snap.bountyBonusMultiplier ?? 1;
		this.statGoldEarned = snap.stats.goldEarned;
		this.statEnemiesKilled = snap.stats.enemiesKilled;
		this.statBossesKilled = snap.stats.bossesKilled;
		this.statBuildingsBuilt = snap.stats.buildingsBuilt;
		for (const b of snap.buildings) {
			if (b.id === 'nexus') continue;
			const cx = b.col * TILE + TILE / 2;
			const cy = b.row * TILE + TILE / 2;
			const built = this.spawnBuilding(b.id, b.col, b.row, cx, cy);
			const eid = built.id;
			if (b.towerUpgrades && built.kind === 'tower') {
				TowerUpgradeStats.radar[eid] = b.towerUpgrades.radar ?? 0;
				TowerUpgradeStats.attack[eid] = b.towerUpgrades.attack ?? 0;
				TowerUpgradeStats.speed[eid] = b.towerUpgrades.speed ?? 0;
				TowerUpgradeStats.armor[eid] = b.towerUpgrades.armor ?? 0;
				TowerUpgradeStats.tier[eid] = b.towerUpgrades.tier ?? 0;
				Health.maxHp[eid] = towerMaxHp(built);
				this.redrawUpgradePips(built);
			}
			if (b.armouryUpgrades && built.kind === 'armoury') {
				ArmouryUpgradeStats.capacity[eid] =
					b.armouryUpgrades.capacity ?? 0;
				ArmouryUpgradeStats.damage[eid] = b.armouryUpgrades.damage ?? 0;
				ArmouryUpgradeStats.vigor[eid] = b.armouryUpgrades.vigor ?? 0;
				ArmouryUpgradeStats.tempo[eid] = b.armouryUpgrades.tempo ?? 0;
			}
			if (b.repairUpgrades && built.kind === 'repair') {
				RepairUpgradeStats.reach[eid] = b.repairUpgrades.reach ?? 0;
				RepairUpgradeStats.yield[eid] = b.repairUpgrades.yield ?? 0;
				RepairUpgradeStats.tempo[eid] = b.repairUpgrades.tempo ?? 0;
			}
			Health.hp[eid] = Math.min(Health.maxHp[eid], b.hp);
			Armor.armor[eid] = Math.min(Armor.maxArmor[eid], b.armor);
			if (b.batteryCharge !== undefined && built.kind === 'battery') {
				BatteryState.charge[eid] = Math.min(
					BatteryState.capacity[eid],
					b.batteryCharge,
				);
			}
		}
	}

	private captureSnapshot(): SaveSnapshot {
		const buildings: SavedBuilding[] = [];
		for (const eid of this.frameBuildingEids) {
			if (BuildingState.destroyed[eid]) continue;
			const b = this.buildingByEid.get(eid);
			if (!b) continue;
			const entry: SavedBuilding = {
				id: b.spec.id,
				col: BuildingState.col[eid],
				row: BuildingState.row[eid],
				hp: Health.hp[eid],
				armor: Armor.armor[eid],
			};
			if (b.kind === 'tower') {
				entry.towerUpgrades = {
					radar: TowerUpgradeStats.radar[eid],
					attack: TowerUpgradeStats.attack[eid],
					speed: TowerUpgradeStats.speed[eid],
					armor: TowerUpgradeStats.armor[eid],
					tier: TowerUpgradeStats.tier[eid],
				};
			} else if (b.kind === 'armoury') {
				entry.armouryUpgrades = {
					capacity: ArmouryUpgradeStats.capacity[eid],
					damage: ArmouryUpgradeStats.damage[eid],
					vigor: ArmouryUpgradeStats.vigor[eid],
					tempo: ArmouryUpgradeStats.tempo[eid],
				};
			} else if (b.kind === 'repair') {
				entry.repairUpgrades = {
					reach: RepairUpgradeStats.reach[eid],
					yield: RepairUpgradeStats.yield[eid],
					tempo: RepairUpgradeStats.tempo[eid],
				};
			} else if (b.kind === 'battery') {
				entry.batteryCharge = BatteryState.charge[eid];
			}
			buildings.push(entry);
		}
		return {
			v: 1,
			wave: this.wave,
			gold: this.gold,
			freeBasicTowers: this.freeBasicTowers,
			bountyBonusMultiplier: this.bountyBonusMultiplier,
			seed: this.currentSeed,
			stats: {
				goldEarned: this.statGoldEarned,
				enemiesKilled: this.statEnemiesKilled,
				bossesKilled: this.statBossesKilled,
				buildingsBuilt: this.statBuildingsBuilt,
			},
			buildings,
		};
	}

	private refreshHud(): void {
		if (this.nexusEid >= 0 && !BuildingState.destroyed[this.nexusEid]) {
			this.lives = Math.max(0, Math.ceil(Health.hp[this.nexusEid]));
		}
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
		} else if (b.kind === 'castle') {
			radius = b.spec.droneRange;
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
		const eids = this.frameEnemyEids as unknown as ArrayLike<number>;
		const alive = (eid: number) => this.enemyVisuals.has(eid);
		this.enemySpatial.rebuild(eids, alive);
		let leadEid = -1;
		let leadProgress = -1;
		for (let i = 0; i < eids.length; i++) {
			const eid = eids[i];
			if (!alive(eid)) continue;
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
		this.enemySpatial.forEachInRange(
			cx,
			cy,
			range,
			(eid) => this.enemyVisuals.has(eid),
			fn,
		);
	}

	private onPointerDown(pointer: Phaser.Input.Pointer): void {
		if (this.isGameOver) return;
		if (this.isPaused) return;

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
		this.sfx.play('place_building');
		this.statBuildingsBuilt += 1;
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
		if (b.kind === 'nexus') return;
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
		if (b.kind === 'village') return `${b.spec.name}`;
		if (b.kind === 'castle') return `${b.spec.name}`;
		if (b.kind === 'nexus') return `${b.spec.name}`;
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
		if (b.kind === 'village') {
			return `LOAD -${b.spec.power}⚡ · +${b.spec.goldPerWave}g/WAVE · HP ${hpText}`;
		}
		if (b.kind === 'castle') {
			const ur = (b.spec.unitSpawnIntervalMs / 1000).toFixed(1);
			const dr = (b.spec.droneSpawnIntervalMs / 1000).toFixed(1);
			return `LOAD -${b.spec.power}⚡ · UNIT/${ur}s · DRONE/${dr}s · HP ${hpText}`;
		}
		if (b.kind === 'nexus') {
			return `NEXUS · HP ${hpText}`;
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
		const tier = TowerUpgradeStats.tier[t.id];
		if (tier > 0) {
			const starY = t.y - TILE * 0.55;
			const starSize = 3;
			const startX = t.x - tier * (starSize + 1.5);
			t.upgradePips.fillStyle(0xf6e05e, 0.95);
			for (let i = 0; i < tier; i++) {
				const sx = startX + i * (starSize * 2 + 2);
				t.upgradePips.fillCircle(sx, starY, starSize);
			}
		}
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
		const { sprite, hpBar, hpBarBg, armorBar, armorBarBg } =
			createBuildingBaseVisual(this, id, x, y);

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
		BuildingState.power[eid] =
			spec.kind === 'battery' || spec.kind === 'nexus' ? 0 : spec.power;
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
			TowerState.chargedReadyAtMs[eid] =
				this.simNow + GAME_CONFIG.chargedShotCooldownMs;
			TowerUpgradeStats.radar[eid] = 0;
			TowerUpgradeStats.attack[eid] = 0;
			TowerUpgradeStats.speed[eid] = 0;
			TowerUpgradeStats.armor[eid] = 0;
			TowerUpgradeStats.tier[eid] = 0;
			const powerIndicator = createPowerIndicator(this, x, y);
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
			const { chargeBar, chargeBarBg } = createChargeBar(this, x, y);
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
			const powerIndicator = createPowerIndicator(this, x, y);
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
			const powerIndicator = createPowerIndicator(this, x, y);
			const b: ArmouryBuilding = {
				...base,
				kind: 'armoury',
				spec: spec as ArmourySpec,
				powerIndicator,
			};
			building = b;
		} else if (spec.kind === 'village') {
			addComponent(this.world, eid, VillageTag);
			const powerIndicator = createPowerIndicator(this, x, y);
			const b: VillageBuilding = {
				...base,
				kind: 'village',
				spec: spec as VillageSpec,
				powerIndicator,
			};
			building = b;
		} else if (spec.kind === 'nexus') {
			addComponent(this.world, eid, NexusTag);
			const b: NexusBuilding = {
				...base,
				kind: 'nexus',
				spec: spec as NexusSpec,
			};
			building = b;
		} else if (spec.kind === 'castle') {
			addComponent(this.world, eid, CastleTag);
			CastleState.nextUnitSpawnAtMs[eid] =
				this.simNow + (spec as CastleSpec).unitSpawnIntervalMs;
			CastleState.nextDroneSpawnAtMs[eid] =
				this.simNow + (spec as CastleSpec).droneSpawnIntervalMs;
			CastleState.nextFireAtMs[eid] = this.simNow;
			const powerIndicator = createPowerIndicator(this, x, y);
			const b: CastleBuilding = {
				...base,
				kind: 'castle',
				spec: spec as CastleSpec,
				powerIndicator,
			};
			building = b;
		} else {
			throw new Error(
				`unknown build kind: ${(spec as { kind: string }).kind}`,
			);
		}

		this.buildingByEid.set(eid, building);
		this.addBuildingAmbience(building);
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
		this.frameWallEids.length = 0;
		for (const eid of query(this.world, [BuildingTag, TowerTag])) {
			if (BuildingState.destroyed[eid]) continue;
			this.frameTowerEids.push(eid);
			const b = this.buildingByEid.get(eid);
			if (b && b.kind === 'tower' && b.spec.id === 'wall') {
				this.frameWallEids.push(eid);
			}
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
		this.frameVillageEids.length = 0;
		for (const eid of query(this.world, [BuildingTag, VillageTag])) {
			if (BuildingState.destroyed[eid]) continue;
			this.frameVillageEids.push(eid);
		}
		this.frameCastleEids.length = 0;
		for (const eid of query(this.world, [BuildingTag, CastleTag])) {
			if (BuildingState.destroyed[eid]) continue;
			this.frameCastleEids.push(eid);
		}
		this.frameConsumerEids.length = 0;
		for (let i = 0; i < this.frameTowerEids.length; i++)
			this.frameConsumerEids.push(this.frameTowerEids[i]);
		for (let i = 0; i < this.frameRepairEids.length; i++)
			this.frameConsumerEids.push(this.frameRepairEids[i]);
		for (let i = 0; i < this.frameArmouryEids.length; i++)
			this.frameConsumerEids.push(this.frameArmouryEids[i]);
		for (let i = 0; i < this.frameVillageEids.length; i++)
			this.frameConsumerEids.push(this.frameVillageEids[i]);
		for (let i = 0; i < this.frameCastleEids.length; i++)
			this.frameConsumerEids.push(this.frameCastleEids[i]);
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
			if (hp < maxHp || b.kind === 'nexus') {
				b.hpBar.setVisible(true);
				b.hpBarBg.setVisible(true);
				b.hpBar.displayWidth = (hp / maxHp) * TILE * 0.7;
			} else {
				b.hpBar.setVisible(false);
				b.hpBarBg.setVisible(false);
			}
			const armor = Armor.armor[eid];
			const maxArmor = Armor.maxArmor[eid];
			if (maxArmor > 0 && armor < maxArmor) {
				b.armorBar.setVisible(true);
				b.armorBarBg.setVisible(true);
				b.armorBar.displayWidth = (armor / maxArmor) * TILE * 0.7;
			} else {
				b.armorBar.setVisible(false);
				b.armorBarBg.setVisible(false);
			}
			if (
				b.kind === 'tower' ||
				b.kind === 'repair' ||
				b.kind === 'armoury' ||
				b.kind === 'village' ||
				b.kind === 'castle'
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
		this.sfx.play('wave_start');
		saveSnapshot(this.captureSnapshot());
		this.sweepExpiredAllies();
		this.collectVillageIncome();
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
			.setAlpha(0)
			.setScale(1.4);
		this.tweens.add({
			targets: splash,
			alpha: 1,
			scale: 1,
			duration: 280,
			ease: 'Back.easeOut',
			onComplete: () => {
				this.tweens.add({
					targets: splash,
					alpha: 0,
					y: splash.y - 30,
					duration: 600,
					delay: 600,
					ease: 'Cubic.easeIn',
					onComplete: () => splash.destroy(),
				});
			},
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
			this.floatingText.spawn({
				x: BASE_WIDTH / 2,
				y: BASE_HEIGHT * 0.35,
				text: 'BOSS INCOMING',
				color: '#ffd700',
				fontSize: '28px',
				rise: 40,
				duration: 1400,
			});
			this.cameras.main.shake(220, 0.005);
		} else {
			typeId = rollEnemyType(this.wave, this.rand);
		}
		const type = ENEMY_CATALOG[typeId];
		const stats = computeEnemyStats(this.wave, type);
		const visual = createEnemyVisual(
			this.enemyVisualDeps,
			type,
			start.x,
			start.y,
			stats.radius,
		);
		const eid = addEntity(this.world);
		addComponent(this.world, eid, Position);
		addComponent(this.world, eid, EnemyTag);
		addComponent(this.world, eid, EnemyStats);
		Position.x[eid] = start.x;
		Position.y[eid] = start.y;
		this.addDamageable(eid, stats.hp, stats.armor, type.defense);
		EnemyStats.baseSpeed[eid] = stats.speed;
		addComponent(this.world, eid, MovementTag);
		addComponent(this.world, eid, Movement);
		initMovement(eid, stats.speed);
		EnemyStats.pathIndex[eid] = 1;
		EnemyStats.segmentT[eid] = 0;
		clearStatus(eid, STATUS_KIND.slow);
		clearStatus(eid, STATUS_KIND.burn);
		EnemyStats.attackDamage[eid] = stats.attackDamage;
		EnemyStats.attackRateMs[eid] = type.attackRateMs;
		EnemyStats.attackRange[eid] = type.attackRange;
		EnemyStats.lastAttackAtMs[eid] = 0;
		EnemyStats.canAttack[eid] = type.canAttack ? 1 : 0;
		EnemyStats.bountyMultiplier[eid] = type.bountyMultiplier;
		EnemyStats.typeIndex[eid] = enemyTypeIndexFromId(type.id);
		this.enemyVisuals.set(eid, visual);
		EnemyStats.targetEid[eid] = -1;
		EnemyStats.targetKind[eid] = ATTACK_TARGET_KIND.none;
	}

	private findAttackTargetFor(eid: number): boolean {
		return findAttackTargetFor(this.targetingCtx, eid);
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

	private addBuildingAmbience(b: Building): void {
		const amb = createBuildingAmbience(this, b);
		if (amb) this.buildingAmbience.set(b.id, amb);
	}

	private clearBuildingAmbience(eid: number): void {
		const amb = this.buildingAmbience.delete(eid);
		if (amb) disposeBuildingAmbience(amb);
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
		const hpBefore = Health.hp[b.id];
		this.applyDamage(b.id, dmg, DAMAGE_TYPE.kinetic, DAMAGE_FLAG.none);
		const taken = Math.max(0, hpBefore - Health.hp[b.id]);
		if (Health.hp[b.id] > 0) {
			if (b.kind === 'nexus') this.showNexusDamageFx(b, taken);
			else this.flashSprite(b.sprite, 0xffffff);
		}
	}

	private showNexusDamageFx(b: Building, taken: number): void {
		this.flashSprite(b.sprite, 0xfc8181);
		this.sfx.play('nexus_hit', 60);
		const intensity = Math.min(0.012, 0.002 + taken * 0.0008);
		this.cameras.main.shake(120, intensity);
		if (taken <= 0) return;
		this.floatingText.spawn({
			x: b.x,
			y: b.y - TILE * 0.6,
			text: `-${Math.ceil(taken)}`,
			color: '#fc8181',
			rise: TILE * 0.8,
		});
	}

	private destroyBuilding(b: Building): void {
		if (BuildingState.destroyed[b.id]) return;
		BuildingState.destroyed[b.id] = 1;
		BuildingState.online[b.id] = 0;
		Health.hp[b.id] = 0;
		this.sfx.play('demolish', 80);
		spawnParticleBurst(
			this.particleDeps,
			b.x,
			b.y,
			b.spec.color,
			10,
			TILE * 0.9,
			520,
		);
		this.cameras.main.shake(180, 0.006);
		if (b.kind === 'nexus' && !this.isGameOver) {
			this.lives = 0;
			this.endGame(false);
		}
		this.clearBuildingAmbience(b.id);
		b.sprite.destroy();
		b.hpBar.destroy();
		b.hpBarBg.destroy();
		b.armorBar.destroy();
		b.armorBarBg.destroy();
		if (
			b.kind === 'tower' ||
			b.kind === 'repair' ||
			b.kind === 'armoury' ||
			b.kind === 'village' ||
			b.kind === 'castle'
		) {
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
			if (nowMs < ArmouryState.nextSpawnAtMs[eid]) continue;
			const meleeCount = this.countSoldiersOwnedBy(
				eid,
				SOLDIER_KIND.melee,
			);
			const archerCount = this.countSoldiersOwnedBy(
				eid,
				SOLDIER_KIND.archer,
			);
			const meleeCap = armouryMaxSoldiers(b);
			const archerCap = GAME_CONFIG.archerInitialCount;
			if (archerCount < archerCap) {
				this.spawnArcher(b);
			} else if (meleeCount < meleeCap) {
				this.spawnSoldier(b);
			} else {
				continue;
			}
			ArmouryState.nextSpawnAtMs[eid] = nowMs + armourySpawnIntervalMs(b);
		}
	}

	private spawnAllySoldier(
		x: number,
		y: number,
		expiresAtWave: number,
		asArcher: boolean = false,
	): void {
		spawnAllySoldierExt(this.spawnUnitDeps, x, y, expiresAtWave, asArcher);
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
		const wp = path.waypoints;
		const spawn = wp[wp.length - 1] ?? {
			x: BASE_WIDTH / 2,
			y: BASE_HEIGHT / 2,
		};
		const cx = spawn.x;
		const cy = spawn.y;
		const expires = this.wave + GAME_CONFIG.allyLifespanWaves;
		const count = GAME_CONFIG.allyCallCount;
		const archerQuota = Math.floor(count * GAME_CONFIG.allyArcherRatio);
		const ringSizes = [1, 6, 12, 18];
		let placed = 0;
		let ring = 0;
		while (placed < count) {
			const slots = ringSizes[ring] ?? Math.max(6, ring * 6);
			const ringRadius = ring === 0 ? 0 : TILE * (0.55 + ring * 0.7);
			const fill = Math.min(slots, count - placed);
			for (let k = 0; k < fill; k++) {
				const angle = (k / Math.max(1, slots)) * Math.PI * 2;
				const sx = cx + Math.cos(angle) * ringRadius;
				const sy = cy + Math.sin(angle) * ringRadius;
				const i = placed + k;
				const asArcher = i < archerQuota;
				this.spawnAllySoldier(sx, sy, expires, asArcher);
			}
			placed += fill;
			ring += 1;
		}
	}

	private collectVillageIncome(): void {
		let total = 0;
		for (const eid of query(this.world, [VillageTag])) {
			if (BuildingState.destroyed[eid]) continue;
			if (!BuildingState.online[eid]) continue;
			const b = this.buildingByEid.get(eid) as
				| VillageBuilding
				| undefined;
			if (!b) continue;
			total += b.spec.goldPerWave;
		}
		if (total > 0) {
			this.gold += total;
			goldAtom.set(this.gold);
		}
	}

	private updateCastles(nowMs: number): void {
		for (let i = 0; i < this.frameCastleEids.length; i++) {
			const eid = this.frameCastleEids[i];
			if (BuildingState.destroyed[eid]) continue;
			if (!BuildingState.online[eid]) continue;
			const b = this.buildingByEid.get(eid);
			if (!b || b.kind !== 'castle') continue;
			if (nowMs >= CastleState.nextUnitSpawnAtMs[eid]) {
				const owned = this.countSoldiersOwnedBy(eid);
				if (owned < b.spec.maxUnits) {
					this.spawnCastleSoldier(b);
				}
				CastleState.nextUnitSpawnAtMs[eid] =
					nowMs + b.spec.unitSpawnIntervalMs;
			}
			if (nowMs >= CastleState.nextDroneSpawnAtMs[eid]) {
				const target = this.findWeakestEnemyInRange(
					b.x,
					b.y,
					b.spec.droneRange,
				);
				if (target >= 0) {
					this.spawnStunDrone(b, target);
				}
				CastleState.nextDroneSpawnAtMs[eid] =
					nowMs + b.spec.droneSpawnIntervalMs;
			}
			if (nowMs >= CastleState.nextFireAtMs[eid]) {
				const target = this.findNearestEnemyInRange(
					b.x,
					b.y,
					b.spec.fireRange,
				);
				if (target >= 0) {
					this.fireCastleArrow(b, target);
					CastleState.nextFireAtMs[eid] = nowMs + b.spec.fireRateMs;
				} else {
					CastleState.nextFireAtMs[eid] = nowMs + 200;
				}
			}
		}
	}

	private findNearestWallCover(
		seid: number,
	): { x: number; y: number; eid: number } | null {
		const sx = Position.x[seid];
		const sy = Position.y[seid];
		let best = -1;
		let bestD2 = Infinity;
		for (let i = 0; i < this.frameWallEids.length; i++) {
			const eid = this.frameWallEids[i];
			if (BuildingState.destroyed[eid]) continue;
			const dx = Position.x[eid] - sx;
			const dy = Position.y[eid] - sy;
			const d2 = dx * dx + dy * dy;
			if (d2 < bestD2) {
				bestD2 = d2;
				best = eid;
			}
		}
		if (best < 0) return null;
		const wx = Position.x[best];
		const wy = Position.y[best];
		const jitterX = ((seid % 3) - 1) * TILE * 0.25;
		const jitterY = (((seid >> 1) % 3) - 1) * TILE * 0.25;
		return {
			x: wx + TILE * 0.85 + jitterX,
			y: wy + jitterY,
			eid: best,
		};
	}

	private findNearestArmoury(x: number, y: number): ArmouryBuilding | null {
		let best: ArmouryBuilding | null = null;
		let bestD2 = Infinity;
		for (let i = 0; i < this.frameArmouryEids.length; i++) {
			const eid = this.frameArmouryEids[i];
			if (BuildingState.destroyed[eid]) continue;
			const b = this.buildingByEid.get(eid);
			if (!b || b.kind !== 'armoury') continue;
			const dx = b.x - x;
			const dy = b.y - y;
			const d2 = dx * dx + dy * dy;
			if (d2 < bestD2) {
				bestD2 = d2;
				best = b;
			}
		}
		return best;
	}

	private findNearestEnemyInRange(
		x: number,
		y: number,
		range: number,
	): number {
		let best = -1;
		let bestD2 = range * range;
		this.forEachEnemyInRange(x, y, range, (eid) => {
			const dx = Position.x[eid] - x;
			const dy = Position.y[eid] - y;
			const d2 = dx * dx + dy * dy;
			if (d2 < bestD2) {
				bestD2 = d2;
				best = eid;
			}
		});
		return best;
	}

	private fireCastleArrow(castle: CastleBuilding, targetEid: number): void {
		const sx = castle.x;
		const sy = castle.y;
		const tx = Position.x[targetEid];
		const ty = Position.y[targetEid];
		const sprite = this.acquireArc(sx, sy, 3, castle.spec.fireColor);
		const dx = tx - sx;
		const dy = ty - sy;
		const dist = Math.sqrt(dx * dx + dy * dy);
		const duration = Math.max(80, (dist / 360) * 1000);
		this.tweens.add({
			targets: sprite,
			x: tx,
			y: ty,
			duration,
			onComplete: () => {
				if (this.enemyVisuals.has(targetEid)) {
					this.applyDamage(
						targetEid,
						castle.spec.fireDamage,
						DAMAGE_TYPE.kinetic,
						DAMAGE_FLAG.none,
					);
				}
				this.releaseArc(sprite);
			},
		});
	}

	private spawnCastleSoldier(castle: CastleBuilding): void {
		spawnCastleUnit(this.spawnUnitDeps, castle);
	}

	private findWeakestEnemyInRange(
		x: number,
		y: number,
		range: number,
	): number {
		return findWeakestEnemyInRange(this.targetingCtx, x, y, range);
	}

	private spawnStunDrone(castle: CastleBuilding, targetEid: number): void {
		spawnStunDroneExt(this.stunDroneDeps, castle, targetEid);
	}

	private updateStunDrones(dt: number, nowMs: number): void {
		updateStunDronesExt(this.stunDroneDeps, dt, nowMs);
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

	private countSoldiersOwnedBy(armouryEid: number, kind?: number): number {
		let n = 0;
		for (const seid of this.frameSoldierEids) {
			if (!this.soldierVisuals.has(seid)) continue;
			if (SoldierStats.armouryEid[seid] !== armouryEid) continue;
			if (kind !== undefined && SoldierStats.unitKind[seid] !== kind)
				continue;
			n++;
		}
		return n;
	}

	private spawnSoldier(armoury: ArmouryBuilding): void {
		spawnArmourySoldier(this.spawnUnitDeps, armoury);
	}

	private spawnArcher(armoury: ArmouryBuilding): void {
		spawnArmouryArcher(this.spawnUnitDeps, armoury);
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
		const adx = tx - sx;
		const ady = ty - sy;
		const dist = Math.sqrt(adx * adx + ady * ady);
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
						stackSlow(
							targetEid,
							this.simNow + GAME_CONFIG.archerSlowMs,
							GAME_CONFIG.archerSlowFactor,
							GAME_CONFIG.archerSlowMs,
							0.15,
						);
					}
				}
				this.releaseArc(sprite);
			},
		});
	}

	private findEnemyForSoldier(seid: number): number {
		return findEnemyForSoldier(this.targetingCtx, seid);
	}

	private findEnemyForArcher(seid: number, nowMs: number): number {
		return findEnemyForArcher(this.targetingCtx, seid, nowMs);
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
		if (v.idleTween) {
			v.idleTween.remove();
			v.idleTween = undefined;
		}
		v.sprite.destroy();
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
		this.archerTargetClaims.clear();
		for (const seid of this.frameSoldierEids) {
			if (!this.soldierVisuals.has(seid)) continue;
			if (Health.hp[seid] <= 0) {
				this.killSoldier(seid);
				continue;
			}
			let target = SoldierStats.targetEnemyEid[seid];
			if (target === 0 || !this.enemyVisuals.has(target)) {
				target =
					SoldierStats.unitKind[seid] === SOLDIER_KIND.archer
						? this.findEnemyForArcher(seid, nowMs)
						: this.findEnemyForSoldier(seid);
				SoldierStats.targetEnemyEid[seid] = target >= 0 ? target : 0;
			}
			if (
				SoldierStats.unitKind[seid] === SOLDIER_KIND.archer &&
				SoldierStats.targetEnemyEid[seid] !== 0
			) {
				this.archerTargetClaims.add(SoldierStats.targetEnemyEid[seid]);
			}
			if (SoldierStats.targetEnemyEid[seid] === 0) {
				const hp = Health.hp[seid];
				const maxHp = Health.maxHp[seid];
				const wounded = hp < maxHp * 0.95;
				let destX = 0;
				let destY = 0;
				let haveDest = false;
				let canHeal = false;
				if (wounded) {
					const armoury = this.findNearestArmoury(
						Position.x[seid],
						Position.y[seid],
					);
					if (armoury) {
						destX = armoury.x;
						destY = armoury.y;
						haveDest = true;
						canHeal = true;
					}
				}
				if (!haveDest) {
					const cover = this.findNearestWallCover(seid);
					if (cover) {
						destX = cover.x;
						destY = cover.y;
						haveDest = true;
					}
				}
				if (haveDest) {
					const dx = destX - Position.x[seid];
					const dy = destY - Position.y[seid];
					const dist = Math.sqrt(dx * dx + dy * dy);
					const healRange = TILE * GAME_CONFIG.soldierHealRangeRatio;
					const arrived = dist <= healRange;
					if (arrived && canHeal) {
						Health.hp[seid] = Math.min(
							maxHp,
							hp + GAME_CONFIG.soldierHealPerSec * dt,
						);
					} else if (!arrived) {
						const step = SoldierStats.speed[seid] * dt;
						if (step >= dist) {
							Position.x[seid] = destX;
							Position.y[seid] = destY;
						} else {
							Position.x[seid] += (dx / dist) * step;
							Position.y[seid] += (dy / dist) * step;
						}
					}
				}
				this.applySoldierSeparation(seid, dt);
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
			this.applySoldierSeparation(seid, dt);
			this.syncSoldierVisuals(seid);
		}
	}

	private applySoldierSeparation(seid: number, dt: number): void {
		const minSep = TILE * 0.35;
		const minSepSq = minSep * minSep;
		const push = TILE * 0.9;
		let ax = 0;
		let ay = 0;
		let neighbors = 0;
		const sx = Position.x[seid];
		const sy = Position.y[seid];
		this.soldierSpatial.forEachInRange(
			sx,
			sy,
			minSep,
			(id) => id !== seid && this.soldierVisuals.has(id),
			(other) => {
				const dx = sx - Position.x[other];
				const dy = sy - Position.y[other];
				const d2 = dx * dx + dy * dy;
				if (d2 <= 0.0001) {
					ax += ((seid % 7) - 3) * 0.05;
					ay += ((seid % 5) - 2) * 0.05;
					neighbors += 1;
					return;
				}
				if (d2 > minSepSq) return;
				const dist = Math.sqrt(d2);
				const overlap = (minSep - dist) / minSep;
				ax += (dx / dist) * overlap;
				ay += (dy / dist) * overlap;
				neighbors += 1;
			},
		);
		if (neighbors === 0) return;
		const step = push * dt;
		Position.x[seid] += ax * step;
		Position.y[seid] += ay * step;
	}

	private syncSoldierVisuals(seid: number): void {
		const v = this.soldierVisuals.get(seid);
		if (!v) return;
		syncSoldierVisual(this.soldierSyncCtx, v, seid, this.simNow);
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

			const typeIdx = EnemyStats.typeIndex[eid];
			const enemyType = ENEMY_CATALOG[ENEMY_TYPE_INDEX[typeIdx]];
			if (
				enemyType?.regenPerSec &&
				!hasStatus(eid, STATUS_KIND.burn, nowMs)
			) {
				Health.hp[eid] = Math.min(
					Health.maxHp[eid],
					Health.hp[eid] + enemyType.regenPerSec * dt,
				);
			}

			let stunned = false;
			if (hasStatus(eid, STATUS_KIND.stun, nowMs)) {
				stunned = true;
			} else if (EnemyStats.canAttack[eid] === 1) {
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
					const tx = Position.x[targetEid];
					const ty = Position.y[targetEid];
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
					const attackSpeed =
						Movement.speed[eid] *
						GAME_CONFIG.enemyAttackSpeedFactor;
					if (attackSpeed > 0)
						this.moveAlongPath(eid, attackSpeed, dt);
					this.updateEnemyVisuals(eid, nowMs);
					continue;
				}
			}

			if (!stunned) {
				this.recomputeEnemyMovement(eid, nowMs);
				const speed = Movement.speed[eid];
				this.moveAlongPath(eid, speed, dt);
			}
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

	private pinEnemyToNexus(eid: number): void {
		const nexus = this.nexusEid;
		if (nexus < 0 || BuildingState.destroyed[nexus]) {
			this.killEnemy(eid, false);
			return;
		}
		Position.x[eid] = Position.x[nexus];
		Position.y[eid] = Position.y[nexus];
		const lastSegIdx = this.path.segments.length - 1;
		EnemyStats.pathIndex[eid] = lastSegIdx + 1;
		EnemyStats.segmentT[eid] = 1;
		EnemyStats.targetKind[eid] = ATTACK_TARGET_KIND.building;
		EnemyStats.targetEid[eid] = nexus;
		Movement.speed[eid] = 0;
		Movement.frozen[eid] = 1;
	}

	private moveAlongPath(eid: number, speed: number, dt: number): void {
		let segIdx = EnemyStats.pathIndex[eid] - 1;
		let remaining = speed * dt;
		while (remaining > 0) {
			const seg = this.path.segments[segIdx];
			if (!seg) {
				this.pinEnemyToNexus(eid);
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
		syncEnemyVisual(v, eid, nowMs);
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
		let bestFresh = -1;
		let bestFreshProgress = -1;
		let bestStale = -1;
		let bestStaleProgress = -1;
		const skipSlowed = t.spec.avoidSlowed;
		this.forEachEnemyInRange(t.x, t.y, range, (eid) => {
			const prog = EnemyStats.pathIndex[eid];
			if (skipSlowed && hasStatus(eid, STATUS_KIND.slow, nowMs)) {
				if (prog > bestStaleProgress) {
					bestStaleProgress = prog;
					bestStale = eid;
				}
				return;
			}
			if (prog > bestFreshProgress) {
				bestFreshProgress = prog;
				bestFresh = eid;
			}
		});
		if (bestFresh >= 0) return bestFresh;
		if (bestStale >= 0) return bestStale;
		return null;
	}

	private acquireProjectileSprite(
		x: number,
		y: number,
		radius: number,
		color: number,
	): Phaser.GameObjects.Arc {
		return this.pools.projectileSprite.acquire(x, y, radius, color);
	}

	private releaseProjectileSprite(sprite: Phaser.GameObjects.Arc): void {
		this.pools.projectileSprite.release(sprite);
	}

	private acquireArc(
		x: number,
		y: number,
		radius: number,
		color: number,
		alpha = 1,
	): Phaser.GameObjects.Arc {
		return this.pools.arc.acquire(x, y, radius, color, alpha);
	}

	private releaseArc(sprite: Phaser.GameObjects.Arc): void {
		this.pools.arc.release(sprite);
	}

	private acquireRect(
		x: number,
		y: number,
		w: number,
		h: number,
		color: number,
		alpha = 1,
	): Phaser.GameObjects.Rectangle {
		return this.pools.rect.acquire(x, y, w, h, color, alpha);
	}

	private releaseRect(rect: Phaser.GameObjects.Rectangle): void {
		this.pools.rect.release(rect);
	}

	private acquireGraphics(): Phaser.GameObjects.Graphics {
		return this.pools.graphics.acquire();
	}

	private releaseGraphics(g: Phaser.GameObjects.Graphics): void {
		this.pools.graphics.release(g);
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
		return this.pools.line.acquire(x1, y1, x2, y2, color, alpha, width);
	}

	private releaseLine(line: Phaser.GameObjects.Line): void {
		this.pools.line.release(line);
	}

	private acquireImage(
		x: number,
		y: number,
		key: string,
	): Phaser.GameObjects.Image {
		return this.pools.image.acquire(x, y, key);
	}

	private releaseImage(img: Phaser.GameObjects.Image): void {
		this.pools.image.release(img);
	}

	private fireAt(
		t: TowerBuilding,
		targetX: number,
		targetY: number,
		enemyId: number | null,
	): void {
		this.sfx.play('tower_fire', 50);
		if (t.spec.chainJumps && enemyId !== null) {
			this.fireChainLightning(t, enemyId);
			return;
		}
		spawnTowerProjectile(
			this.projectileSpawnDeps,
			t,
			targetX,
			targetY,
			enemyId,
		);
	}

	private fireChainLightning(t: TowerBuilding, primaryEid: number): void {
		const jumps = t.spec.chainJumps ?? 0;
		const falloff = t.spec.chainFalloff ?? 0.7;
		const damage = towerDamage(t);
		const range = towerRange(t);
		const visited = new Set<number>();
		let prevX = t.x;
		let prevY = t.y;
		let cur = primaryEid;
		let dmg = damage;
		for (let jump = 0; jump <= jumps; jump++) {
			if (!this.enemyVisuals.has(cur)) break;
			visited.add(cur);
			const tx = Position.x[cur];
			const ty = Position.y[cur];
			const line = this.acquireLine(
				prevX,
				prevY,
				tx,
				ty,
				t.spec.projectileColor,
				1,
				2,
			);
			this.tweens.add({
				targets: line,
				alpha: 0,
				duration: 220,
				onComplete: () => this.releaseLine(line),
			});
			this.applyDamage(cur, dmg, t.spec.damageType, DAMAGE_FLAG.none);
			prevX = tx;
			prevY = ty;
			dmg *= falloff;
			if (jump >= jumps) break;
			let next = -1;
			let bestD2 = range * range;
			this.forEachEnemyInRange(prevX, prevY, range, (eid) => {
				if (visited.has(eid)) return;
				const dx = Position.x[eid] - prevX;
				const dy = Position.y[eid] - prevY;
				const d2 = dx * dx + dy * dy;
				if (d2 < bestD2) {
					bestD2 = d2;
					next = eid;
				}
			});
			if (next < 0) break;
			cur = next;
		}
	}

	private consumeBatteryCharge(amount: number): boolean {
		return consumeBatteryCharge(this.frameBatteryEids, amount);
	}

	private isEnemyAlive(eid: number | null): eid is number {
		return eid !== null && eid >= 0 && this.enemyVisuals.has(eid);
	}

	private updateProjectiles(dt: number, nowMs: number): void {
		this.projectileDeathRow.length = 0;
		for (const eid of query(this.world, [ProjectileTag, Position])) {
			stepProjectile(this.projectileStepCtx, eid, dt, nowMs);
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
				stackSlow(
					targetEid,
					nowMs + slowMs,
					ProjectileStats.slowFactor[eid],
					slowMs,
					0.15,
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
		spawnBurnPatchExt(this.burnDeps, x, y, radius, dps, expiresAtMs);
	}

	private spawnSplashFlash(x: number, y: number, radius: number): void {
		spawnSplashFlashExt(this.burnDeps, x, y, radius);
	}

	private updateBurnPatches(dt: number, nowMs: number): void {
		updateBurnPatchesExt(this.burnDeps, nowMs);
	}

	private updateRepair(dt: number): void {
		updateRepairExt(this.repairDeps, dt);
	}

	private renderDebugOverlay(): void {
		if (!this.debugOverlay || !this.debugOverlay.isOn()) return;
		const deps: DebugOverlayDeps = {
			scene: this,
			frameEnemyEids: this.frameEnemyEids as unknown as ArrayLike<number>,
			frameTowerEids: this.frameTowerEids,
			frameBuildingEids: this
				.frameBuildingEids as unknown as ArrayLike<number>,
		};
		this.debugOverlay.render(deps);
	}

	private promoteSelectedTower(): void {
		const target = this.upgradeTarget;
		if (!target || target.kind !== 'tower') return;
		const tier = towerTier(target);
		if (tier >= 2) {
			this.floatingText.spawn({
				x: target.x,
				y: target.y - TILE * 0.6,
				text: 'MAX TIER',
				color: '#a0aec0',
				rise: 40,
			});
			return;
		}
		const cost = towerTierCost(target);
		if (this.gold < cost) {
			this.floatingText.spawn({
				x: target.x,
				y: target.y - TILE * 0.6,
				text: `NEED ${cost}g`,
				color: '#fc8181',
				rise: 40,
			});
			return;
		}
		this.gold -= cost;
		const prevMaxHp = towerMaxHp(target);
		TowerUpgradeStats.tier[target.id] = tier + 1;
		const newMaxHp = towerMaxHp(target);
		Health.maxHp[target.id] = newMaxHp;
		const delta = newMaxHp - prevMaxHp;
		Health.hp[target.id] = Math.min(newMaxHp, Health.hp[target.id] + delta);
		this.redrawUpgradePips(target);
		this.sfx.play('place_building');
		this.floatingText.spawn({
			x: target.x,
			y: target.y - TILE * 0.6,
			text: `TIER ${tier + 2}`,
			color: '#f6e05e',
			rise: 50,
		});
	}

	private togglePause(): void {
		if (this.isGameOver) return;
		if (this.isPaused) {
			this.isPaused = false;
			speedFactorAtom.set(this.speedFactorBeforePause || 1);
		} else {
			this.isPaused = true;
			this.speedFactorBeforePause = this.speedFactor || 1;
			speedFactorAtom.set(0);
		}
		this.pauseOverlay?.setPaused(this.isPaused);
	}

	private updateEnemyHover(): void {
		updateEnemyHoverExt(this.hoverDeps);
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
		tickAuraEmittersExt(this.auraDeps, nowMs);
	}

	private killEnemy(eid: number, reward: boolean): void {
		const v = this.enemyVisuals.delete(eid);
		if (!v) return;
		this.sfx.play('enemy_die', 40);
		const ex = Position.x[eid];
		const ey = Position.y[eid];
		this.releaseImage(v.sprite);
		this.releaseGraphics(v.statusRing);
		this.releaseRect(v.hpBar);
		this.releaseRect(v.hpBarBg);
		const isBoss =
			EnemyStats.typeIndex[eid] === enemyTypeIndexFromId('boss');
		spawnParticleBurst(
			this.particleDeps,
			ex,
			ey,
			isBoss ? 0xffd700 : 0xfc8181,
			isBoss ? 12 : 6,
			isBoss ? 40 : 24,
			isBoss ? 520 : 380,
		);
		if (reward) {
			const award = Math.round(
				GAME_CONFIG.goldPerKill *
					EnemyStats.bountyMultiplier[eid] *
					this.bountyBonusMultiplier,
			);
			this.gold += award;
			this.statGoldEarned += award;
			this.statEnemiesKilled += 1;
			if (EnemyStats.typeIndex[eid] === enemyTypeIndexFromId('boss')) {
				this.statBossesKilled += 1;
			}
		}
		this.removeEntityQueue.push(eid);
	}

	private endGame(win: boolean): void {
		this.isGameOver = true;
		this.sfx.play('game_over');
		clearSnapshot();
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
		gameStatsAtom.set({
			win,
			wave: this.wave,
			livesLeft: Math.max(0, this.lives),
			goldEarned: this.statGoldEarned,
			enemiesKilled: this.statEnemiesKilled,
			bossesKilled: this.statBossesKilled,
			buildingsBuilt: this.statBuildingsBuilt,
			bestBefore: previousBest,
			newRecord,
		});
		gameStateAtom.set('gameover');
	}

	update(_time: number, deltaMs: number): void {
		if (gameStateAtom.get() !== 'playing') return;
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
		this.soldierSpatial.rebuild(
			this.frameSoldierEids as unknown as ArrayLike<number>,
			(eid) => this.soldierVisuals.has(eid),
		);
		this.buildingSpatial.rebuild(
			this.frameBuildingEids as unknown as ArrayLike<number>,
			(eid) => !BuildingState.destroyed[eid],
		);

		this.burnTickAccumulatorMs += scaledDeltaMs;
		if (this.burnTickAccumulatorMs >= 100) {
			this.updateBurnPatches(this.burnTickAccumulatorMs / 1000, nowMs);
			this.burnTickAccumulatorMs = 0;
		}
		this.updateEnemies(dt, nowMs);
		this.updateTowers(nowMs);
		this.syncTowerFireFrames(nowMs);
		this.updateProjectiles(dt, nowMs);
		this.updateRepair(dt);
		this.updateArmouries(nowMs);
		this.updateCastles(nowMs);
		this.updateStunDrones(dt, nowMs);
		this.updateSoldiers(dt, nowMs);

		this.tickAuraEmitters(nowMs);
		this.deathSystem();
		this.updateEnemyHover();
		this.renderDebugOverlay();
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
		this.cardPicksRemaining = this.wave >= 20 ? 2 : 1;
		cardWaveAtom.set(this.wave);
		cardOptionsAtom.set(cards);
	}

	private applyCardPick(card: CardOption): void {
		this.sfx.play('card_pick');
		switch (card.id) {
			case 'bonus_gold':
				this.gold += 150 + this.wave;
				break;
			case 'bonus_lives':
				if (
					this.nexusEid >= 0 &&
					!BuildingState.destroyed[this.nexusEid]
				) {
					Health.hp[this.nexusEid] +=
						Health.maxHp[this.nexusEid] * 0.05;
				}
				break;
			case 'free_basic_tower':
				this.freeBasicTowers += 1;
				break;
			case 'soldier_squad':
				this.summonSoldierSquad(5);
				break;
			case 'field_repair':
				healAllBuildingsExt(this.cardCtx);
				break;
			case 'battery_surge':
				boostBatteriesExt(this.cardCtx, 30);
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
		this.cardPicksRemaining -= 1;
		const remainingOpts = (cardOptionsAtom.get() ?? []).filter(
			(c) => c.id !== card.id,
		);
		if (this.cardPicksRemaining > 0 && remainingOpts.length > 0) {
			cardOptionsAtom.set(remainingOpts);
			return;
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
		if (!summonSoldierSquadExt(this.cardCtx, count)) this.gold += 60;
	}

	private applyRandomUpgradeTo(b: Building): boolean {
		return applyRandomUpgradeToExt(this.cardCtx, b);
	}
}
