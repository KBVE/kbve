import { Knight, type KnightCommands, emptyCommands } from '../entities/Knight';
import {
	getComponents,
	getPlatforms,
	getEnemies,
	type GameWorld,
} from '../ecs';
import { NavigationSystem } from './NavigationSystem';

// ============================================================================
// AI Behavior Types
// ============================================================================

export enum AIBehavior {
	FOLLOW_PLAYER, // Follow the player knight
	PATROL, // Patrol back and forth
	AGGRESSIVE, // Actively seek and attack enemies
}

// ============================================================================
// AI Configuration
// ============================================================================

export interface AIConfig {
	behavior: AIBehavior;
	followDistance: number; // Ideal distance to maintain from player
	minDistanceFromPlayer: number; // Minimum distance - back off if closer
	attackRange: number; // Range to detect and attack enemies
	enemySearchRange: number; // Range to search for enemies
	grappleChance: number; // Probability (0-1) to use grapple
	rollChance: number; // Probability (0-1) to roll when enemy is close
	rollCooldown: number; // Minimum time (ms) between rolls
	combatPriority: number; // 0-1, how much to prioritize combat over following
}

const defaultAIConfig: AIConfig = {
	behavior: AIBehavior.FOLLOW_PLAYER,
	followDistance: 150, // Stay further back from player
	minDistanceFromPlayer: 80, // Don't get closer than this
	attackRange: 100,
	enemySearchRange: 300, // Look for enemies within this range
	grappleChance: 0.4,
	rollChance: 0.4,
	rollCooldown: 2000,
	combatPriority: 0.7, // Prioritize combat when enemies are present
};

// ============================================================================
// AI State for Individual Knight
// ============================================================================

interface AIState {
	// Movement state - persisted to reduce jitter
	lastMoveDirection: -1 | 0 | 1; // -1 = left, 0 = stopped, 1 = right
	// Hysteresis - once moving, keep moving until closer
	isChasing: boolean;
	// Roll cooldown tracking
	lastRollTime: number;
	// Grapple cooldown
	lastGrappleTime: number;
	// Obstacle avoidance state
	obstacleAhead: 'none' | 'low' | 'high' | 'blocking';
	// Combat state
	currentTarget: { x: number; y: number; eid: number } | null;
	lastTargetUpdateTime: number;
	combatMode: boolean; // True when actively engaged in combat
	// Positioning state
	preferredSide: 'left' | 'right' | 'any'; // Which side of player to stay on
	tacticalPlatformEid: number | null; // Platform to use for tactical advantage
}

// ============================================================================
// AI System - Generates commands for AI-controlled knights
// ============================================================================

export class AISystem {
	private world: GameWorld;
	private aiStates: Map<number, AIState> = new Map();
	private configs: Map<number, AIConfig> = new Map();
	private navigation: NavigationSystem;

	constructor(world: GameWorld) {
		this.world = world;
		this.navigation = new NavigationSystem(world);
	}

	// ============================================================================
	// Update navigation ground state (call each frame)
	// ============================================================================

	updateGroundState(groundY: number, groundBreakX: number): void {
		this.navigation.updateGroundState(groundY, groundBreakX);
	}

	// ============================================================================
	// Registration
	// ============================================================================

	registerKnight(knight: Knight, config: Partial<AIConfig> = {}): void {
		const fullConfig = { ...defaultAIConfig, ...config };
		this.configs.set(knight.eid, fullConfig);

		// Assign a preferred side to spread allies out
		const existingAllies = this.aiStates.size;
		const preferredSide = existingAllies % 2 === 0 ? 'left' : 'right';

		this.aiStates.set(knight.eid, {
			lastMoveDirection: 0,
			isChasing: false,
			lastRollTime: 0,
			lastGrappleTime: 0,
			obstacleAhead: 'none',
			currentTarget: null,
			lastTargetUpdateTime: 0,
			combatMode: false,
			preferredSide: preferredSide as 'left' | 'right',
			tacticalPlatformEid: null,
		});
	}

	unregisterKnight(knight: Knight): void {
		this.configs.delete(knight.eid);
		this.aiStates.delete(knight.eid);
	}

	// ============================================================================
	// Command Generation
	// ============================================================================

	getCommands(
		knight: Knight,
		playerKnight: Knight | null,
		time: number,
	): KnightCommands {
		const config = this.configs.get(knight.eid);
		const state = this.aiStates.get(knight.eid);

		if (!config || !state) {
			return { ...emptyCommands };
		}

		const commands: KnightCommands = { ...emptyCommands };

		// Check for obstacles ahead
		state.obstacleAhead = this.detectObstacleAhead(
			knight,
			state.lastMoveDirection,
		);

		switch (config.behavior) {
			case AIBehavior.FOLLOW_PLAYER:
				this.processFollowBehavior(
					knight,
					playerKnight,
					config,
					state,
					commands,
					time,
				);
				break;
			case AIBehavior.PATROL:
				this.processPatrolBehavior(knight, config, state, commands);
				break;
			case AIBehavior.AGGRESSIVE:
				this.processAggressiveBehavior(
					knight,
					playerKnight,
					config,
					state,
					commands,
					time,
				);
				break;
		}

		// Handle obstacle avoidance
		this.handleObstacleAvoidance(knight, config, state, commands, time);

		// Check for grapple opportunities (follow player who is swinging, or reach platforms)
		this.checkForGrappleOpportunity(
			knight,
			playerKnight,
			config,
			state,
			commands,
			time,
		);

		// Check for nearby enemies to attack or dodge
		this.checkForEnemies(knight, config, state, commands, time);

		return commands;
	}

	// ============================================================================
	// Behaviors
	// ============================================================================

	private processFollowBehavior(
		knight: Knight,
		playerKnight: Knight | null,
		config: AIConfig,
		state: AIState,
		commands: KnightCommands,
		time: number,
	): void {
		if (!playerKnight) return;

		const dx = playerKnight.x - knight.x;
		const distance = Math.abs(dx);

		// Check if we have an active combat target
		const hasEnemy = state.currentTarget !== null;

		// If in combat mode, prioritize combat over following
		if (hasEnemy && state.combatMode) {
			this.processCombatPositioning(
				knight,
				playerKnight,
				config,
				state,
				commands,
				time,
			);
			return;
		}

		// Calculate ideal position based on preferred side
		// Allies should spread out on their preferred side of the player
		let idealOffsetX = config.followDistance;
		if (state.preferredSide === 'left') {
			idealOffsetX = -config.followDistance;
		} else if (state.preferredSide === 'right') {
			idealOffsetX = config.followDistance;
		}

		const idealX = playerKnight.x + idealOffsetX;
		const dxToIdeal = idealX - knight.x;
		const distToIdeal = Math.abs(dxToIdeal);

		// Check if too close to player - need to back off
		const tooClose = distance < config.minDistanceFromPlayer;

		if (tooClose) {
			// Back away from player
			const backOffDirection = dx > 0 ? -1 : 1; // Move opposite to player
			state.lastMoveDirection = backOffDirection as -1 | 1;

			if (backOffDirection > 0) {
				commands.moveRight = true;
			} else {
				commands.moveLeft = true;
			}
			state.isChasing = false;
			return;
		}

		// Hysteresis: use different thresholds for starting vs stopping movement
		const startMoveDistance = 40; // Start moving when far from ideal
		const stopMoveDistance = 20; // Stop when close to ideal

		// Update chase state with hysteresis
		if (distToIdeal > startMoveDistance) {
			state.isChasing = true;
		} else if (distToIdeal < stopMoveDistance) {
			state.isChasing = false;
		}

		if (state.isChasing) {
			// Move toward ideal position
			const moveDirection = dxToIdeal > 0 ? 1 : -1;
			state.lastMoveDirection = moveDirection;

			if (moveDirection > 0) {
				commands.moveRight = true;
			} else {
				commands.moveLeft = true;
			}

			// Jump logic - only when grounded and player is grounded on higher platform
			if (knight.isGrounded && playerKnight.isGrounded) {
				const dy = playerKnight.y - knight.y;
				if (dy < -60) {
					// Player is significantly higher and grounded - look for platform to jump to
					const movement = this.navigation.getMovementTowards(
						knight.x,
						knight.y,
						playerKnight.x,
						playerKnight.y,
						true,
						true,
						time,
					);
					commands.jump = movement.jump;
				}
			}

			// Self-preservation: jump over gaps
			if (knight.isGrounded) {
				const lookAhead = state.lastMoveDirection * 80;
				const futureX = knight.x + lookAhead;
				const groundBreakX = this.navigation['groundBreakX'];
				if (
					futureX <= groundBreakX + 50 &&
					futureX > groundBreakX - 100
				) {
					commands.jump = true;
				}
			}
		} else {
			state.lastMoveDirection = 0;
		}
	}

	// Combat positioning - move to attack enemies while not blocking player
	private processCombatPositioning(
		knight: Knight,
		playerKnight: Knight | null,
		config: AIConfig,
		state: AIState,
		commands: KnightCommands,
		time: number,
	): void {
		const target = state.currentTarget;
		if (!target) {
			state.combatMode = false;
			return;
		}

		const dxToTarget = target.x - knight.x;
		const dyToTarget = target.y - knight.y;
		const distToTarget = Math.abs(dxToTarget);

		// Check if we should use a tactical platform
		if (state.tacticalPlatformEid !== null && !knight.isGrounded) {
			// Currently trying to reach a platform - handled by grapple logic
			return;
		}

		// If enemy is above us, look for a platform to get height advantage
		if (dyToTarget < -80 && knight.isGrounded) {
			const platform = this.findTacticalPlatform(knight, target);
			if (platform) {
				state.tacticalPlatformEid = platform.eid;
				// Will try to grapple in checkForGrappleOpportunity
			}
		}

		// Move toward enemy but stay out of player's way
		const playerDx = playerKnight ? playerKnight.x - knight.x : 0;
		const playerDist = Math.abs(playerDx);

		// Don't block the player - if player is between us and enemy, go around
		const playerBetweenUsAndEnemy =
			playerKnight &&
			((dxToTarget > 0 && playerDx > 0 && playerDx < dxToTarget) ||
				(dxToTarget < 0 &&
					playerDx < 0 &&
					Math.abs(playerDx) < distToTarget));

		if (
			playerBetweenUsAndEnemy &&
			playerDist < config.minDistanceFromPlayer * 2
		) {
			// Player is in the way - flank around
			// Move to opposite side briefly
			const flankDirection = playerDx > 0 ? -1 : 1;
			state.lastMoveDirection = flankDirection as -1 | 1;
			if (flankDirection > 0) {
				commands.moveRight = true;
			} else {
				commands.moveLeft = true;
			}
			return;
		}

		// Approach enemy
		if (distToTarget > config.attackRange) {
			const moveDirection = dxToTarget > 0 ? 1 : -1;
			state.lastMoveDirection = moveDirection;

			if (moveDirection > 0) {
				commands.moveRight = true;
			} else {
				commands.moveLeft = true;
			}

			// Jump over gaps
			if (knight.isGrounded) {
				const lookAhead = state.lastMoveDirection * 80;
				const futureX = knight.x + lookAhead;
				const groundBreakX = this.navigation['groundBreakX'];
				if (
					futureX <= groundBreakX + 50 &&
					futureX > groundBreakX - 100
				) {
					commands.jump = true;
				}
			}
		} else {
			// In attack range - attack!
			if (!knight.isAttacking && knight.isGrounded) {
				commands.attack = true;
			}
			state.lastMoveDirection = 0;
		}
	}

	// Find a platform that gives tactical advantage over target
	private findTacticalPlatform(
		knight: Knight,
		target: { x: number; y: number; eid: number },
	): { x: number; y: number; eid: number } | null {
		const { Position, Platform } = getComponents(this.world);
		const platforms = getPlatforms(this.world);

		let bestPlatform: { x: number; y: number; eid: number } | null = null;
		let bestScore = -Infinity;

		for (const eid of platforms) {
			const isGround = Platform.isGround[eid] === 1;
			if (isGround) continue;

			const px = Position.x[eid];
			const py = Position.y[eid];

			const distFromKnight = Math.sqrt(
				Math.pow(px - knight.x, 2) + Math.pow(py - knight.y, 2),
			);

			const distFromTarget = Math.sqrt(
				Math.pow(px - target.x, 2) + Math.pow(py - target.y, 2),
			);

			// Must be reachable
			if (distFromKnight > 350 || distFromKnight < 50) continue;

			// Platform should be:
			// - Above the target (height advantage)
			// - Close enough to attack from
			// - Not too far from target
			const heightAboveTarget = target.y - py; // Positive = platform is above target
			const horizontalDistToTarget = Math.abs(px - target.x);

			if (heightAboveTarget < 30) continue; // Must be above target
			if (horizontalDistToTarget > 200) continue; // Must be close enough horizontally

			// Score: higher is better, closer horizontally is better
			const score =
				heightAboveTarget * 2 -
				horizontalDistToTarget * 0.5 -
				distFromKnight * 0.3;

			if (score > bestScore) {
				bestScore = score;
				bestPlatform = { x: px, y: py, eid };
			}
		}

		return bestPlatform;
	}

	private processPatrolBehavior(
		knight: Knight,
		config: AIConfig,
		state: AIState,
		commands: KnightCommands,
	): void {
		// Simple patrol: move in current facing direction
		if (knight.facingRight) {
			commands.moveRight = true;
			state.lastMoveDirection = 1;
		} else {
			commands.moveLeft = true;
			state.lastMoveDirection = -1;
		}
	}

	private processAggressiveBehavior(
		knight: Knight,
		playerKnight: Knight | null,
		config: AIConfig,
		state: AIState,
		commands: KnightCommands,
		time: number,
	): void {
		// Find nearest enemy
		const nearestEnemy = this.findNearestEnemy(knight);

		if (nearestEnemy) {
			const dx = nearestEnemy.x - knight.x;
			const distance = Math.abs(dx);

			// Move towards enemy
			if (distance > 40) {
				const moveDirection = dx > 0 ? 1 : -1;
				state.lastMoveDirection = moveDirection;
				if (moveDirection > 0) {
					commands.moveRight = true;
				} else {
					commands.moveLeft = true;
				}
			}

			// Attack if in range
			if (
				distance < config.attackRange &&
				knight.isGrounded &&
				!knight.isAttacking
			) {
				commands.attack = true;
			}
		} else {
			// No enemies, follow player
			this.processFollowBehavior(
				knight,
				playerKnight,
				config,
				state,
				commands,
				time,
			);
		}
	}

	// ============================================================================
	// Enemy Detection
	// ============================================================================

	private findNearestEnemy(
		knight: Knight,
		maxRange: number = Infinity,
	): { x: number; y: number; eid: number } | null {
		const { Position } = getComponents(this.world);
		const enemies = getEnemies(this.world);

		let nearest: { x: number; y: number; eid: number } | null = null;
		let nearestDist = Infinity;

		for (const eid of enemies) {
			const ex = Position.x[eid];
			const ey = Position.y[eid];
			const dx = ex - knight.x;
			const dy = ey - knight.y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			// Only consider enemies within range
			if (dist < nearestDist && dist <= maxRange) {
				nearestDist = dist;
				nearest = { x: ex, y: ey, eid };
			}
		}

		return nearest;
	}

	private checkForEnemies(
		knight: Knight,
		config: AIConfig,
		state: AIState,
		commands: KnightCommands,
		time: number,
	): void {
		// Update target periodically (every 500ms) to avoid constant switching
		const targetUpdateInterval = 500;
		if (time - state.lastTargetUpdateTime > targetUpdateInterval) {
			const nearest = this.findNearestEnemy(
				knight,
				config.enemySearchRange,
			);
			state.currentTarget = nearest;
			state.lastTargetUpdateTime = time;

			// Enter/exit combat mode based on enemy presence
			if (nearest) {
				const distance = Math.sqrt(
					Math.pow(nearest.x - knight.x, 2) +
						Math.pow(nearest.y - knight.y, 2),
				);
				state.combatMode = distance < config.enemySearchRange;
			} else {
				state.combatMode = false;
				state.tacticalPlatformEid = null;
			}
		}

		const target = state.currentTarget;
		if (!target) return;

		const distance = Math.abs(target.x - knight.x);

		// Enemy very close - consider rolling to dodge
		const rollDodgeRange = 60;
		if (
			distance < rollDodgeRange &&
			knight.isGrounded &&
			!knight.isRolling &&
			!knight.isAttacking
		) {
			const canRoll = time - state.lastRollTime > config.rollCooldown;
			if (canRoll && Math.random() < config.rollChance) {
				commands.roll = true;
				state.lastRollTime = time;
				return; // Don't attack if we're rolling
			}
		}

		// Enemy in attack range - attack if able
		if (distance < config.attackRange) {
			if (!knight.isAttacking && knight.isGrounded) {
				commands.attack = true;
			}
		}
	}

	// ============================================================================
	// Platform/Grapple Decisions
	// ============================================================================

	shouldGrapple(
		knight: Knight,
		playerKnight: Knight | null,
	): { x: number; y: number } | null {
		const config = this.configs.get(knight.eid);
		if (!config) return null;

		// Random chance to grapple
		if (Math.random() > config.grappleChance) return null;

		// If player is swinging, maybe follow
		if (
			playerKnight &&
			playerKnight.isSwinging &&
			playerKnight.grapple.active
		) {
			const targetPlatform = this.findNearestPlatform(
				playerKnight.grapple.targetX,
				playerKnight.grapple.targetY,
				knight,
			);
			if (targetPlatform) {
				return targetPlatform;
			}
		}

		// Find a platform above and ahead
		const { Position, Platform } = getComponents(this.world);
		const platforms = getPlatforms(this.world);

		for (const eid of platforms) {
			const px = Position.x[eid];
			const py = Position.y[eid];

			const dx = px - knight.x;
			const dy = py - knight.y;

			if (dy < -50 && Math.abs(dx) < 300 && dx > 0) {
				return { x: px, y: py };
			}
		}

		return null;
	}

	private findNearestPlatform(
		targetX: number,
		targetY: number,
		knight: Knight,
	): { x: number; y: number } | null {
		const { Position } = getComponents(this.world);
		const platforms = getPlatforms(this.world);

		let nearest: { x: number; y: number } | null = null;
		let nearestDist = Infinity;

		for (const eid of platforms) {
			const px = Position.x[eid];
			const py = Position.y[eid];

			const dx = px - targetX;
			const dy = py - targetY;
			const dist = Math.sqrt(dx * dx + dy * dy);

			const dxFromKnight = px - knight.x;
			const dyFromKnight = py - knight.y;
			const distFromKnight = Math.sqrt(
				dxFromKnight * dxFromKnight + dyFromKnight * dyFromKnight,
			);

			if (dist < nearestDist && distFromKnight < 450) {
				nearestDist = dist;
				nearest = { x: px, y: py };
			}
		}

		return nearest;
	}

	// ============================================================================
	// Obstacle Detection
	// ============================================================================

	private detectObstacleAhead(
		knight: Knight,
		moveDirection: -1 | 0 | 1,
	): 'none' | 'low' | 'high' | 'blocking' {
		if (moveDirection === 0) return 'none';

		const { Position, Platform } = getComponents(this.world);
		const platforms = getPlatforms(this.world);

		const lookAhead = moveDirection * 60; // Check 60 pixels ahead
		const futureX = knight.x + lookAhead;

		// Knight dimensions (approximate)
		const knightHeight = 105; // KNIGHT_HITBOX.height
		const knightTop = knight.y - knightHeight / 2;
		const knightBottom = knight.y + knightHeight / 2;
		const crouchHeight = 65; // KNIGHT_CROUCH_HITBOX.height

		for (const eid of platforms) {
			const isGround = Platform.isGround[eid] === 1;
			if (isGround) continue;

			const platX = Position.x[eid];
			const platY = Position.y[eid];
			const platW = Platform.width[eid];
			const platH = Platform.height[eid];

			const surfaceLeft = platX - platW / 2;
			const surfaceRight = platX + platW / 2;
			const surfaceTop = platY - platH / 2;
			const surfaceBottom = platY + platH / 2;

			// Check if platform is in path
			const inPath =
				(moveDirection > 0 &&
					futureX > surfaceLeft &&
					knight.x < surfaceRight) ||
				(moveDirection < 0 &&
					futureX < surfaceRight &&
					knight.x > surfaceLeft);

			if (!inPath) continue;

			// Check vertical overlap with knight
			if (knightBottom > surfaceTop && knightTop < surfaceBottom) {
				// Platform is blocking our path
				const platformHeight = surfaceBottom - surfaceTop;
				const gapBelow = knightBottom - surfaceBottom; // Space below platform

				// Low obstacle: can crouch under it
				if (
					surfaceBottom < knightTop + crouchHeight &&
					gapBelow > crouchHeight
				) {
					return 'low';
				}

				// High obstacle: need to jump over or grapple
				if (surfaceTop < knightTop) {
					return 'high';
				}

				// Otherwise it's blocking
				return 'blocking';
			}
		}

		return 'none';
	}

	private handleObstacleAvoidance(
		knight: Knight,
		config: AIConfig,
		state: AIState,
		commands: KnightCommands,
		time: number,
	): void {
		switch (state.obstacleAhead) {
			case 'low':
				// Crouch to go under low platforms
				commands.crouch = true;
				break;
			case 'high':
				// Jump over high obstacles
				if (knight.isGrounded && !knight.isAttacking) {
					commands.jump = true;
				}
				break;
			case 'blocking':
				// Can't get through - try to jump or find another route
				if (knight.isGrounded && !knight.isAttacking) {
					commands.jump = true;
				}
				break;
		}
	}

	// ============================================================================
	// Grapple Logic
	// ============================================================================

	private checkForGrappleOpportunity(
		knight: Knight,
		playerKnight: Knight | null,
		config: AIConfig,
		state: AIState,
		commands: KnightCommands,
		time: number,
	): void {
		// Grapple cooldown (3 seconds)
		const grappleCooldown = 3000;
		if (time - state.lastGrappleTime < grappleCooldown) return;

		// Don't grapple if already swinging
		if (knight.grapple.active) return;

		// If we have a tactical platform target (for combat), prioritize that
		if (state.tacticalPlatformEid !== null && state.combatMode) {
			const { Position, Platform } = getComponents(this.world);
			const platforms = getPlatforms(this.world);

			// Check if tactical platform still exists
			for (const eid of platforms) {
				if (eid === state.tacticalPlatformEid) {
					const px = Position.x[eid];
					const py = Position.y[eid];

					const dist = Math.sqrt(
						Math.pow(px - knight.x, 2) + Math.pow(py - knight.y, 2),
					);

					// If reachable, grapple to it
					if (dist < 400 && dist > 50) {
						commands.grapple = true;
						commands.grappleTarget = {
							x: px,
							y: py,
							platformEid: eid,
						};
						state.lastGrappleTime = time;
						state.tacticalPlatformEid = null; // Clear after using
						return;
					}
				}
			}
			// Platform not found or not reachable
			state.tacticalPlatformEid = null;
		}

		// Don't grapple while grounded unless player is swinging or very far
		const playerIsFar =
			playerKnight && Math.abs(playerKnight.x - knight.x) > 300;
		const playerIsSwinging = playerKnight && playerKnight.isSwinging;

		if (knight.isGrounded && !playerIsFar && !playerIsSwinging) return;

		// Random chance check
		if (Math.random() > config.grappleChance) return;

		// Find a good grapple target
		const target = this.findGrappleTarget(knight, playerKnight);

		if (target) {
			commands.grapple = true;
			commands.grappleTarget = target;
			state.lastGrappleTime = time;
		}
	}

	private findGrappleTarget(
		knight: Knight,
		playerKnight: Knight | null,
	): { x: number; y: number; platformEid: number } | null {
		const { Position, Platform } = getComponents(this.world);
		const platforms = getPlatforms(this.world);

		// If player is swinging, try to grapple to a similar location
		if (
			playerKnight &&
			playerKnight.isSwinging &&
			playerKnight.grapple.active
		) {
			// Find platform near player's grapple target
			for (const eid of platforms) {
				const isGround = Platform.isGround[eid] === 1;
				if (isGround) continue;

				const px = Position.x[eid];
				const py = Position.y[eid];

				const distToPlayerGrapple = Math.sqrt(
					Math.pow(px - playerKnight.grapple.targetX, 2) +
						Math.pow(py - playerKnight.grapple.targetY, 2),
				);

				const distFromKnight = Math.sqrt(
					Math.pow(px - knight.x, 2) + Math.pow(py - knight.y, 2),
				);

				// Close to player's target and reachable
				if (
					distToPlayerGrapple < 150 &&
					distFromKnight < 400 &&
					distFromKnight > 50
				) {
					return { x: px, y: py, platformEid: eid };
				}
			}
		}

		// Find platform above and ahead that would help navigate
		let bestTarget: { x: number; y: number; platformEid: number } | null =
			null;
		let bestScore = -Infinity;

		for (const eid of platforms) {
			const isGround = Platform.isGround[eid] === 1;
			if (isGround) continue;

			const px = Position.x[eid];
			const py = Position.y[eid];

			const dx = px - knight.x;
			const dy = py - knight.y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			// Must be reachable
			if (dist > 400 || dist < 50) continue;

			// Must be above or level
			if (dy > 50) continue;

			// Score: prefer platforms that are ahead and above
			const score = dx * 0.5 - dy * 2; // Ahead is good, above is very good

			if (score > bestScore) {
				bestScore = score;
				bestTarget = { x: px, y: py, platformEid: eid };
			}
		}

		return bestTarget;
	}

	// ============================================================================
	// Cleanup
	// ============================================================================

	destroy(): void {
		this.aiStates.clear();
		this.configs.clear();
	}
}
