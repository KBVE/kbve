import { GAME_CONFIG, TILE, type EnemyType } from '../config';

export interface ComputedEnemyStats {
	hp: number;
	armor: number;
	baseSpeed: number;
	speed: number;
	attackDamage: number;
	radius: number;
}

export function computeEnemyStats(
	wave: number,
	type: EnemyType,
): ComputedEnemyStats {
	const baseHp = Math.floor(
		GAME_CONFIG.enemyBaseHp * Math.pow(GAME_CONFIG.enemyHpScale, wave - 1),
	);
	const hp = Math.floor(baseHp * type.hpMultiplier);
	const baseSpeed = GAME_CONFIG.enemyBaseSpeed + (wave - 1) * 4;
	const speed = baseSpeed * type.speedMultiplier;
	const attackDamage = type.canAttack
		? type.attackDamage + (wave - 1) * GAME_CONFIG.enemyAttackDamageScale
		: 0;
	const radius = TILE * type.sizeRadius;
	const armor = Math.floor(hp * GAME_CONFIG.armorEnemyRatio);
	return { hp, armor, baseSpeed, speed, attackDamage, radius };
}
