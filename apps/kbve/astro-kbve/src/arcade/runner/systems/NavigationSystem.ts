import { getComponents, getPlatforms, type GameWorld } from '../ecs';
import { KNIGHT_HITBOX } from '../sprites';
import { GAME_CONFIG } from '../config';

// ============================================================================
// Path Result
// ============================================================================

export interface PathStep {
	x: number;
	y: number;
	action: 'walk' | 'jump' | 'fall';
}

// ============================================================================
// Navigation System - Platform-aware pathfinding
// ============================================================================

export class NavigationSystem {
	private world: GameWorld;
	private groundY: number = 0;
	private groundBreakX: number = 0;

	// Simple approach: track platforms and generate waypoints dynamically
	private cachedPlatforms: Array<{
		eid: number;
		x: number;
		y: number;
		width: number;
	}> = [];
	private lastCacheTime: number = 0;
	private cacheInterval: number = 500; // Rebuild cache every 500ms

	constructor(world: GameWorld) {
		this.world = world;
	}

	// ============================================================================
	// Update ground state
	// ============================================================================

	updateGroundState(groundY: number, groundBreakX: number): void {
		this.groundY = groundY;
		this.groundBreakX = groundBreakX;
	}

	// ============================================================================
	// Find path from current position to target
	// ============================================================================

	findPath(
		fromX: number,
		fromY: number,
		toX: number,
		toY: number,
		time: number,
	): PathStep[] {
		// Rebuild platform cache periodically
		if (time - this.lastCacheTime > this.cacheInterval) {
			this.rebuildPlatformCache();
			this.lastCacheTime = time;
		}

		const steps: PathStep[] = [];

		// Simple heuristic navigation for platformer:
		// 1. If target is roughly same height, walk towards it
		// 2. If target is above, look for a platform to jump to
		// 3. If target is below, walk and fall

		const dx = toX - fromX;
		const dy = toY - fromY;
		const horizontalDist = Math.abs(dx);

		// Check if we're on the ground
		const onGround = fromY >= this.groundY - KNIGHT_HITBOX.height / 2 - 10;
		const targetOnGround =
			toY >= this.groundY - KNIGHT_HITBOX.height / 2 - 10;

		// If both on ground and ground is valid, just walk
		if (
			onGround &&
			targetOnGround &&
			fromX > this.groundBreakX &&
			toX > this.groundBreakX
		) {
			steps.push({
				x: toX,
				y: this.groundY - KNIGHT_HITBOX.height / 2,
				action: 'walk',
			});
			return steps;
		}

		// Target is on a platform above - need to find a path
		if (dy < -30) {
			// Look for platforms we can jump to that get us closer
			const reachablePlatform = this.findReachablePlatformTowards(
				fromX,
				fromY,
				toX,
				toY,
			);
			if (reachablePlatform) {
				steps.push({
					x: reachablePlatform.x,
					y: reachablePlatform.y - KNIGHT_HITBOX.height / 2,
					action: 'jump',
				});
			}
		}

		// Target is lower or same level - walk towards
		if (horizontalDist > 10) {
			steps.push({ x: toX, y: fromY, action: 'walk' });
		}

		return steps;
	}

	// ============================================================================
	// Get next movement command for AI
	// ============================================================================

	getMovementTowards(
		knightX: number,
		knightY: number,
		targetX: number,
		targetY: number,
		targetIsGrounded: boolean, // Whether the TARGET is grounded (not the AI)
		isGrounded: boolean,
		_time: number,
	): { moveLeft: boolean; moveRight: boolean; jump: boolean } {
		const result = { moveLeft: false, moveRight: false, jump: false };

		const dx = targetX - knightX;
		const dy = targetY - knightY;
		const horizontalDist = Math.abs(dx);

		// Basic horizontal movement
		if (horizontalDist > 30) {
			if (dx > 0) {
				result.moveRight = true;
			} else {
				result.moveLeft = true;
			}
		}

		// Jump logic - AI decides independently, NOT based on player's Y position during jumps
		if (isGrounded) {
			// Only consider jumping to reach target if target is GROUNDED at a higher position
			// This prevents AI from jumping just because player is mid-jump
			if (targetIsGrounded && dy < -80) {
				// Target is standing on something significantly higher - look for a platform to reach
				const platformAhead = this.findPlatformInDirection(
					knightX,
					knightY,
					dx > 0 ? 1 : -1,
				);
				if (platformAhead && platformAhead.y < knightY - 30) {
					result.jump = true;
				}
			}

			// Jump if approaching a gap in the ground (self-preservation)
			const lookAheadDist = dx > 0 ? 80 : -80;
			const futureX = knightX + lookAheadDist;
			if (
				futureX <= this.groundBreakX + 50 &&
				futureX > this.groundBreakX - 100
			) {
				// Approaching the break point - jump to get momentum
				result.jump = true;
			}

			// DON'T jump just because there's a platform ahead - only if needed
			// Removed the automatic platform jump that was causing issues
		}

		return result;
	}

	// ============================================================================
	// Helper methods
	// ============================================================================

	private rebuildPlatformCache(): void {
		const { Position, Platform } = getComponents(this.world);
		const platforms = getPlatforms(this.world);

		this.cachedPlatforms = [];
		for (const eid of platforms) {
			this.cachedPlatforms.push({
				eid,
				x: Position.x[eid],
				y: Position.y[eid],
				width: Platform.width[eid],
			});
		}
	}

	private findReachablePlatformTowards(
		fromX: number,
		fromY: number,
		toX: number,
		toY: number,
	): { x: number; y: number } | null {
		const jumpHeight = Math.abs(GAME_CONFIG.jumpForce) * 0.4; // Approximate jump height
		const maxJumpDist = 200; // Max horizontal distance for a jump

		let bestPlatform: { x: number; y: number } | null = null;
		let bestScore = Infinity;

		for (const plat of this.cachedPlatforms) {
			// Platform must be above us but within jump reach
			const platTop = plat.y - 12; // Platform top
			const heightDiff = fromY - platTop;

			if (heightDiff < 0 || heightDiff > jumpHeight) continue;

			// Must be within horizontal jump distance
			const horizDist = Math.abs(plat.x - fromX);
			if (horizDist > maxJumpDist) continue;

			// Score by how much closer this gets us to target
			const distToTarget = Math.sqrt(
				Math.pow(plat.x - toX, 2) + Math.pow(platTop - toY, 2),
			);

			if (distToTarget < bestScore) {
				bestScore = distToTarget;
				bestPlatform = { x: plat.x, y: platTop };
			}
		}

		return bestPlatform;
	}

	private findPlatformInDirection(
		fromX: number,
		_fromY: number,
		direction: number,
	): { x: number; y: number; width: number } | null {
		const searchDist = 200;

		for (const plat of this.cachedPlatforms) {
			const dx = plat.x - fromX;

			// Platform must be in the right direction and within search distance
			if (direction > 0 && dx > 0 && dx < searchDist) {
				return plat;
			} else if (direction < 0 && dx < 0 && dx > -searchDist) {
				return plat;
			}
		}

		return null;
	}

	// ============================================================================
	// Check if position is safe (has ground or platform)
	// ============================================================================

	isPositionSafe(x: number, y: number): boolean {
		// Check if over valid ground
		if (x > this.groundBreakX && y >= this.groundY - KNIGHT_HITBOX.height) {
			return true;
		}

		// Check if on a platform
		for (const plat of this.cachedPlatforms) {
			const platTop = plat.y - 12;
			const platLeft = plat.x - plat.width / 2;
			const platRight = plat.x + plat.width / 2;

			if (x >= platLeft && x <= platRight && Math.abs(y - platTop) < 20) {
				return true;
			}
		}

		return false;
	}
}
