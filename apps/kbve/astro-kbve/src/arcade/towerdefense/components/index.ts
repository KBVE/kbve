export { Position, MAX_ENTITIES } from './shared';
export { Health, HealthTag, initHealth } from './health';
export { Armor, ArmorTag, initArmor } from './armor';
export { Defense, DefenseTag, initDefense } from './defense';
export {
	Resistance,
	ResistanceTag,
	DAMAGE_TYPE,
	DAMAGE_FLAG,
	resistForType,
	initResistance,
	type DamageType,
} from './resistance';
export {
	EnemyTag,
	EnemyStats,
	ENEMY_TYPE_INDEX,
	ATTACK_TARGET_KIND,
	enemyTypeIndexFromId,
	type EnemyVisual,
} from './enemy';
export {
	SoldierTag,
	SoldierStats,
	SOLDIER_KIND,
	type SoldierKind,
	type SoldierVisual,
} from './soldier';
export { DroneTag, DroneState, DroneStats, type DroneVisual } from './drone';
export {
	ProjectileTag,
	ProjectileStats,
	type ProjectileVisual,
} from './projectile';
export {
	BurnPatchTag,
	BurnPatchStats,
	type BurnPatchVisual,
} from './burn-patch';
export {
	STATUS_KIND,
	StatusState,
	applyStatus,
	hasStatus,
	statusMagnitude,
	statusExtra,
	statusExpiresAt,
	clearStatus,
	type StatusKind,
} from './status';
export {
	AURA_KIND,
	AuraEmitter,
	AuraEmitterTag,
	initAura,
	type AuraKind,
} from './aura';
export { Movement, MovementTag, initMovement } from './movement';
export { DeadTag, ImmobileTag } from './lifecycle';
export {
	BuildingTag,
	TowerTag,
	GeneratorTag,
	BatteryTag,
	RepairTag,
	ArmouryTag,
	VillageTag,
	CastleTag,
	NexusTag,
	StunDroneTag,
	BUILDING_KIND,
	BUILDING_TYPE_INDEX,
	buildIdFromIndex,
	buildIndexFromId,
	BuildingState,
	TowerState,
	TowerUpgradeStats,
	BatteryState,
	RepairState,
	RepairUpgradeStats,
	ArmouryState,
	ArmouryUpgradeStats,
	CastleState,
	StunDroneStats,
	type BuildingKindIndex,
} from './building';
