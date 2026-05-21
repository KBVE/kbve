export {
	findAttackTargetFor,
	findEnemyForArcher,
	findEnemyForSoldier,
	findWeakestEnemyInRange,
	type TargetingCtx,
} from './targeting';
export { EnemySpatialGrid, type SpatialGridConfig } from './spatial';
export {
	spawnTowerProjectile,
	type ProjectileSpawnDeps,
} from './projectile-spawn';
export { stepProjectile, type ProjectileStepCtx } from './projectile-step';
