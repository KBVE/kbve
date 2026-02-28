// ============================================================================
// Rapier Physics System
// Uses @phaserjs/rapier-connector for Phaser integration
// Rapier is the SOURCE OF TRUTH for physics - positions are read FROM Rapier
// Uses dynamic bodies with real gravity (matches official Phaser Rapier examples)
// ============================================================================

import { RAPIER, createRapierPhysics } from '@phaserjs/rapier-connector';
import { getComponents, getPlatforms, type GameWorld } from '../ecs';

// ============================================================================
// Types
// ============================================================================

export interface CollisionResult {
	isGrounded: boolean;
	hitWallLeft: boolean;
	hitWallRight: boolean;
	hitCeiling: boolean;
	wallNormal: { x: number; y: number } | null;
	groundNormal: { x: number; y: number } | null;
	groundY: number | null;
	// Ledge detection - true when character can grab a ledge (wall with empty space above)
	canLedgeGrab: boolean;
	// Y position of the ledge surface (top of the platform)
	ledgeY: number | null;
}

// Type for the rapier physics connector
type RapierPhysicsConnector = ReturnType<typeof createRapierPhysics>;

interface PlatformBody {
	eid: number;
	rigidBody: RAPIER.RigidBody;
	collider: RAPIER.Collider;
}

interface CharacterBody {
	rigidBody: RAPIER.RigidBody;
	collider: RAPIER.Collider;
	width: number;
	height: number;
}

// Physics constants
const GRAVITY = 980; // pixels per second squared (adjust as needed)
const MAX_FALL_SPEED = 600; // Terminal velocity

// Collision groups - used to prevent characters from colliding with each other
// Group membership (what group this collider belongs to)
// Filter membership (what groups this collider can collide with)
const COLLISION_GROUP_CHARACTER = 0x0001; // Group 1: Characters (player, allies)
const COLLISION_GROUP_PLATFORM = 0x0002; // Group 2: Platforms, ground

// Characters: belong to group 1, collide with group 2 only (platforms)
// This means characters pass through each other (ghosting)
const CHARACTER_COLLISION_GROUPS =
	(COLLISION_GROUP_CHARACTER << 16) | COLLISION_GROUP_PLATFORM;

// Platforms: belong to group 2, collide with group 1 (characters)
const PLATFORM_COLLISION_GROUPS =
	(COLLISION_GROUP_PLATFORM << 16) | COLLISION_GROUP_CHARACTER;

// ============================================================================
// Rapier Physics System
// ============================================================================

export class RapierPhysicsSystem {
	private scene: Phaser.Scene;
	private gameWorld: GameWorld;
	private rapierPhysics: RapierPhysicsConnector | null = null;
	private world: RAPIER.World | null = null;

	// Character physics bodies - keyed by entity ID
	// Using DYNAMIC bodies - Rapier handles collisions automatically
	private characterBodies: Map<number, CharacterBody> = new Map();

	// Platform colliders - synced from ECS
	private platformBodies: Map<number, PlatformBody> = new Map();

	// State
	private initialized: boolean = false;

	constructor(scene: Phaser.Scene, world: GameWorld) {
		this.scene = scene;
		this.gameWorld = world;
	}

	// ============================================================================
	// Initialization
	// ============================================================================

	async initialize(): Promise<void> {
		if (this.initialized) return;

		try {
			// Initialize RAPIER WASM module
			await RAPIER.init();
			console.log('[RapierPhysicsSystem] RAPIER WASM initialized');

			// Create physics with REAL gravity - Rapier handles everything
			this.rapierPhysics = createRapierPhysics(
				{ x: 0, y: GRAVITY },
				this.scene,
			);

			this.world = this.rapierPhysics.getWorld();
			console.log(
				'[RapierPhysicsSystem] World created with gravity:',
				GRAVITY,
			);

			// Enable debug rendering
			this.rapierPhysics.debugger(true);

			this.initialized = true;
			console.log('[RapierPhysicsSystem] Initialized successfully');
		} catch (error) {
			console.error('[RapierPhysicsSystem] Failed to initialize:', error);
			throw error;
		}
	}

	// ============================================================================
	// Character Body Management
	// ============================================================================

	/**
	 * Create a DYNAMIC character body - Rapier handles physics automatically
	 * Position reads come FROM Rapier, not to it
	 */
	createCharacterBody(
		eid: number,
		x: number,
		y: number,
		hitboxWidth: number,
		hitboxHeight: number,
	): void {
		if (!this.world) {
			console.warn(
				'[RapierPhysicsSystem] Cannot create character body - not initialized',
			);
			return;
		}

		// Remove existing body if present
		if (this.characterBodies.has(eid)) {
			this.removeCharacterBody(eid);
		}

		// Create a DYNAMIC rigid body - Rapier will apply gravity and handle collisions
		const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
			.setTranslation(x, y)
			.setLinearDamping(0) // No air resistance
			.setAngularDamping(1000) // Prevent rotation
			.lockRotations(); // Lock rotation completely

		const rigidBody = this.world.createRigidBody(bodyDesc);

		// Create cuboid collider with collision groups
		// Characters only collide with platforms, not with each other (ghosting)
		const colliderDesc = RAPIER.ColliderDesc.cuboid(
			hitboxWidth / 2,
			hitboxHeight / 2,
		)
			.setFriction(0.0) // No friction - we control horizontal movement directly
			.setRestitution(0.0) // No bounce
			.setCollisionGroups(CHARACTER_COLLISION_GROUPS); // Only collide with platforms

		const collider = this.world.createCollider(colliderDesc, rigidBody);

		this.characterBodies.set(eid, {
			rigidBody,
			collider,
			width: hitboxWidth,
			height: hitboxHeight,
		});

		console.log(
			'[RapierPhysicsSystem] Dynamic character body created for eid:',
			eid,
			'at',
			x,
			y,
			'with ghosting enabled',
		);
	}

	/**
	 * Remove a character body
	 */
	removeCharacterBody(eid: number): void {
		const body = this.characterBodies.get(eid);
		if (body && this.world) {
			this.world.removeRigidBody(body.rigidBody);
			this.characterBodies.delete(eid);
		}
	}

	/**
	 * Check if a character body exists for an entity
	 */
	hasCharacterBody(eid: number): boolean {
		return this.characterBodies.has(eid);
	}

	/**
	 * Update character collider size.
	 * When height changes (e.g., crouching), adjust body position to keep feet at same Y.
	 * This prevents jitter from collision resolution pushing character around.
	 */
	updateCharacterCollider(
		eid: number,
		hitboxWidth: number,
		hitboxHeight: number,
	): void {
		if (!this.world) return;

		const body = this.characterBodies.get(eid);
		if (!body) return;

		// Check if dimensions changed
		if (body.width === hitboxWidth && body.height === hitboxHeight) {
			return;
		}

		// Calculate height difference to adjust position
		// When crouching (smaller height), we need to move body DOWN to keep feet at same Y
		// Body position is at center, so feet are at (pos.y + height/2)
		// To keep feet at same Y: newPos.y + newHeight/2 = oldPos.y + oldHeight/2
		// newPos.y = oldPos.y + (oldHeight - newHeight) / 2
		const heightDiff = body.height - hitboxHeight;
		const pos = body.rigidBody.translation();

		// Remove old collider
		this.world.removeCollider(body.collider, false);

		// Create new cuboid with updated dimensions and collision groups
		const colliderDesc = RAPIER.ColliderDesc.cuboid(
			hitboxWidth / 2,
			hitboxHeight / 2,
		)
			.setFriction(0.0)
			.setRestitution(0.0)
			.setCollisionGroups(CHARACTER_COLLISION_GROUPS);
		body.collider = this.world.createCollider(colliderDesc, body.rigidBody);

		// Adjust body position to keep feet at same Y position
		// This prevents the character from "popping" when crouching/standing
		if (Math.abs(heightDiff) > 1) {
			body.rigidBody.setTranslation(
				{ x: pos.x, y: pos.y + heightDiff / 2 },
				true,
			);
		}

		body.width = hitboxWidth;
		body.height = hitboxHeight;
	}

	// ============================================================================
	// Ground Setup (legacy stubs)
	// ============================================================================

	createGround(_groundY: number, _groundBreakX: number): void {
		// Ground tiles are Platform entities synced via syncPlatformsFromECS()
	}

	updateGroundBreak(_groundBreakX: number): void {
		// Ground tiles are synced via syncPlatformsFromECS()
	}

	// ============================================================================
	// Platform Sync
	// ============================================================================

	syncPlatformsFromECS(): void {
		if (!this.world) return;

		const { Position, Platform } = getComponents(this.gameWorld);
		const platforms = getPlatforms(this.gameWorld);

		const seenPlatforms = new Set<number>();

		for (const eid of platforms) {
			seenPlatforms.add(eid);

			const x = Position.x[eid];
			const y = Position.y[eid];
			const width = Platform.width[eid];
			const height = Platform.height[eid];

			const existing = this.platformBodies.get(eid);

			if (existing) {
				// Update position if platform moved
				const translation = existing.rigidBody.translation();
				if (
					Math.abs(translation.x - x) > 0.1 ||
					Math.abs(translation.y - y) > 0.1
				) {
					existing.rigidBody.setTranslation({ x, y }, true);
				}
			} else {
				// Create new FIXED collider for platform with collision groups
				const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(
					x,
					y,
				);

				const rigidBody = this.world.createRigidBody(bodyDesc);
				const colliderDesc = RAPIER.ColliderDesc.cuboid(
					width / 2,
					height / 2,
				)
					.setFriction(0.5) // Some friction on platforms
					.setCollisionGroups(PLATFORM_COLLISION_GROUPS); // Collide with characters

				const collider = this.world.createCollider(
					colliderDesc,
					rigidBody,
				);

				this.platformBodies.set(eid, { eid, rigidBody, collider });
			}
		}

		// Remove platforms that no longer exist
		for (const [eid, platformBody] of this.platformBodies) {
			if (!seenPlatforms.has(eid)) {
				this.world.removeRigidBody(platformBody.rigidBody);
				this.platformBodies.delete(eid);
			}
		}
	}

	// ============================================================================
	// Character Control - Apply forces/impulses, read position FROM Rapier
	// ============================================================================

	/**
	 * Apply movement input to character. Rapier handles collisions.
	 * Returns the NEW position from Rapier (source of truth).
	 */
	applyCharacterMovement(
		eid: number,
		inputVelocityX: number,
		wantsToJump: boolean,
		jumpImpulse: number,
	): { x: number; y: number; collision: CollisionResult } {
		const body = this.characterBodies.get(eid);

		const defaultCollision: CollisionResult = {
			isGrounded: false,
			hitWallLeft: false,
			hitWallRight: false,
			hitCeiling: false,
			wallNormal: null,
			groundNormal: null,
			groundY: null,
			canLedgeGrab: false,
			ledgeY: null,
		};

		if (!this.world || !body) {
			return { x: 0, y: 0, collision: defaultCollision };
		}

		const rigidBody = body.rigidBody;
		const currentVel = rigidBody.linvel();
		const pos = rigidBody.translation();

		// Check if grounded using a short raycast downward
		const collision = this.checkCollisions(eid);

		// Apply horizontal velocity directly (no momentum/acceleration)
		// Keep vertical velocity from Rapier (gravity)
		let newVelY = currentVel.y;
		let newVelX = inputVelocityX;

		// Cap fall speed
		if (newVelY > MAX_FALL_SPEED) {
			newVelY = MAX_FALL_SPEED;
		}

		// Handle jumping
		if (wantsToJump && collision.isGrounded) {
			newVelY = -jumpImpulse; // Negative = up in screen coords
		}

		// Handle ledge grab - stop all movement and disable gravity
		if (collision.canLedgeGrab && !collision.isGrounded) {
			newVelY = 0;
			newVelX = 0;
			// Disable gravity while hanging by setting gravity scale to 0
			rigidBody.setGravityScale(0, true);
		} else {
			// Re-enable gravity when not hanging
			rigidBody.setGravityScale(1, true);
		}

		// Set velocity - horizontal is input-controlled, vertical is physics-controlled
		rigidBody.setLinvel({ x: newVelX, y: newVelY }, true);

		return {
			x: pos.x,
			y: pos.y,
			collision,
		};
	}

	/**
	 * Check collision state for a character using raycasts
	 */
	private checkCollisions(eid: number): CollisionResult {
		const body = this.characterBodies.get(eid);
		const result: CollisionResult = {
			isGrounded: false,
			hitWallLeft: false,
			hitWallRight: false,
			hitCeiling: false,
			wallNormal: null,
			groundNormal: null,
			groundY: null,
			canLedgeGrab: false,
			ledgeY: null,
		};

		if (!this.world || !body) return result;

		const pos = body.rigidBody.translation();
		const halfWidth = body.width / 2;
		const halfHeight = body.height / 2;

		// Ground check - raycast from bottom center
		const groundRay = new RAPIER.Ray(
			{ x: pos.x, y: pos.y + halfHeight },
			{ x: 0, y: 1 },
		);

		const groundHit = this.world.castRay(
			groundRay,
			4, // Check 4 pixels down
			true, // Solid only
			undefined,
			undefined,
			body.collider, // Exclude self
		);

		if (groundHit) {
			result.isGrounded = true;
			result.groundNormal = { x: 0, y: -1 };
			result.groundY = pos.y + halfHeight + groundHit.timeOfImpact;
		}

		// Ceiling check - do this regardless of grounded state
		const ceilingRay = new RAPIER.Ray(
			{ x: pos.x, y: pos.y - halfHeight },
			{ x: 0, y: -1 },
		);
		const ceilingHit = this.world.castRay(
			ceilingRay,
			2,
			true,
			undefined,
			undefined,
			body.collider,
		);
		if (ceilingHit) {
			result.hitCeiling = true;
		}

		// Wall and ledge detection
		// IMPORTANT: Only check for walls/ledges when NOT grounded
		// If grounded, the character is standing on something and shouldn't trigger wall states
		if (result.isGrounded) {
			// Skip wall detection entirely when grounded - you can't wall slide or ledge grab
			// while standing on something
			return result;
		}

		// ========================================================================
		// 8-DIRECTIONAL RAYCAST SYSTEM
		// ========================================================================
		// Uses 8 directions (cardinal + diagonal) from multiple origin points
		// to get a complete picture of nearby geometry for better edge case handling.
		//
		// Directions (normalized):
		//   0: Right      (1, 0)
		//   1: Down-Right (0.707, 0.707)
		//   2: Down       (0, 1)
		//   3: Down-Left  (-0.707, 0.707)
		//   4: Left       (-1, 0)
		//   5: Up-Left    (-0.707, -0.707)
		//   6: Up         (0, -1)
		//   7: Up-Right   (0.707, -0.707)
		//
		// Origin points are at key positions around the character hitbox:
		// - Top center, top-left corner, top-right corner
		// - Middle-left, middle-right
		// - Bottom center, bottom-left corner, bottom-right corner

		const SQRT2_INV = 0.7071067811865476; // 1 / sqrt(2)
		const rayDistance = 12; // Detection distance

		// 8 normalized direction vectors
		const directions = [
			{ x: 1, y: 0 }, // 0: Right
			{ x: SQRT2_INV, y: SQRT2_INV }, // 1: Down-Right
			{ x: 0, y: 1 }, // 2: Down
			{ x: -SQRT2_INV, y: SQRT2_INV }, // 3: Down-Left
			{ x: -1, y: 0 }, // 4: Left
			{ x: -SQRT2_INV, y: -SQRT2_INV }, // 5: Up-Left
			{ x: 0, y: -1 }, // 6: Up
			{ x: SQRT2_INV, y: -SQRT2_INV }, // 7: Up-Right
		];

		// Define origin points around the character bounding box
		const origins = {
			topCenter: { x: pos.x, y: pos.y - halfHeight },
			topLeft: { x: pos.x - halfWidth, y: pos.y - halfHeight },
			topRight: { x: pos.x + halfWidth, y: pos.y - halfHeight },
			middleLeft: { x: pos.x - halfWidth, y: pos.y },
			middleRight: { x: pos.x + halfWidth, y: pos.y },
			bottomCenter: { x: pos.x, y: pos.y + halfHeight },
			bottomLeft: { x: pos.x - halfWidth, y: pos.y + halfHeight },
			bottomRight: { x: pos.x + halfWidth, y: pos.y + halfHeight },
			// Additional points for better ledge detection
			upperLeft: { x: pos.x - halfWidth, y: pos.y - halfHeight * 0.5 },
			upperRight: { x: pos.x + halfWidth, y: pos.y - halfHeight * 0.5 },
			lowerLeft: { x: pos.x - halfWidth, y: pos.y + halfHeight * 0.5 },
			lowerRight: { x: pos.x + halfWidth, y: pos.y + halfHeight * 0.5 },
		};

		// Helper to cast ray and return hit distance (null if no hit)
		const castRay = (
			origin: { x: number; y: number },
			dir: { x: number; y: number },
		): number | null => {
			const ray = new RAPIER.Ray(origin, dir);
			const hit = this.world!.castRay(
				ray,
				rayDistance,
				true,
				undefined,
				undefined,
				body.collider,
			);
			return hit !== null ? hit.timeOfImpact : null;
		};

		// Helper to check if ray hits within distance
		const hitsWithin = (
			origin: { x: number; y: number },
			dir: { x: number; y: number },
			maxDist: number = rayDistance,
		): boolean => {
			const dist = castRay(origin, dir);
			return dist !== null && dist < maxDist;
		};

		// ========================================================================
		// WALL DETECTION
		// ========================================================================
		// Cast horizontal rays from multiple vertical positions on each side

		const wallDetectDist = 8;

		// Left wall detection - cast rays from left edge going left
		const leftWallHits = {
			top: hitsWithin(origins.topLeft, directions[4], wallDetectDist),
			upper: hitsWithin(origins.upperLeft, directions[4], wallDetectDist),
			middle: hitsWithin(
				origins.middleLeft,
				directions[4],
				wallDetectDist,
			),
			lower: hitsWithin(origins.lowerLeft, directions[4], wallDetectDist),
			bottom: hitsWithin(
				origins.bottomLeft,
				directions[4],
				wallDetectDist,
			),
		};

		// Right wall detection - cast rays from right edge going right
		const rightWallHits = {
			top: hitsWithin(origins.topRight, directions[0], wallDetectDist),
			upper: hitsWithin(
				origins.upperRight,
				directions[0],
				wallDetectDist,
			),
			middle: hitsWithin(
				origins.middleRight,
				directions[0],
				wallDetectDist,
			),
			lower: hitsWithin(
				origins.lowerRight,
				directions[0],
				wallDetectDist,
			),
			bottom: hitsWithin(
				origins.bottomRight,
				directions[0],
				wallDetectDist,
			),
		};

		// ========================================================================
		// DIAGONAL DETECTION FOR LEDGE CORNERS
		// ========================================================================
		// Use diagonal rays to detect platform corners and ledge surfaces

		// From top corners, cast diagonals outward to detect nearby platform surfaces
		const diagonalHits = {
			// Top-left corner checks
			topLeftUp: hitsWithin(origins.topLeft, directions[6], rayDistance), // Up
			topLeftUpOut: hitsWithin(
				origins.topLeft,
				directions[5],
				rayDistance,
			), // Up-Left diagonal
			topLeftOut: hitsWithin(
				origins.topLeft,
				directions[4],
				wallDetectDist,
			), // Left
			topLeftDown: hitsWithin(
				origins.topLeft,
				directions[3],
				rayDistance,
			), // Down-Left diagonal

			// Top-right corner checks
			topRightUp: hitsWithin(
				origins.topRight,
				directions[6],
				rayDistance,
			), // Up
			topRightUpOut: hitsWithin(
				origins.topRight,
				directions[7],
				rayDistance,
			), // Up-Right diagonal
			topRightOut: hitsWithin(
				origins.topRight,
				directions[0],
				wallDetectDist,
			), // Right
			topRightDown: hitsWithin(
				origins.topRight,
				directions[1],
				rayDistance,
			), // Down-Right diagonal

			// Upper body diagonal checks (for detecting ledge surfaces)
			upperLeftUpOut: hitsWithin(
				origins.upperLeft,
				directions[5],
				rayDistance,
			), // Up-Left diagonal
			upperRightUpOut: hitsWithin(
				origins.upperRight,
				directions[7],
				rayDistance,
			), // Up-Right diagonal

			// Bottom corner checks (to detect ground vs floating platform)
			bottomLeftDown: hitsWithin(origins.bottomLeft, directions[2], 6), // Down from left foot
			bottomRightDown: hitsWithin(origins.bottomRight, directions[2], 6), // Down from right foot
			bottomLeftOut: hitsWithin(
				origins.bottomLeft,
				directions[3],
				rayDistance,
			), // Down-Left
			bottomRightOut: hitsWithin(
				origins.bottomRight,
				directions[1],
				rayDistance,
			), // Down-Right
		};

		// ========================================================================
		// ANALYZE RESULTS
		// ========================================================================

		// Count left wall hits (middle or lower body contact = wall)
		const leftWallContactCount = [
			leftWallHits.upper,
			leftWallHits.middle,
			leftWallHits.lower,
		].filter((h) => h).length;
		const leftHasBodyContact = leftWallContactCount >= 1;
		const leftHasTopSpace =
			!leftWallHits.top &&
			!diagonalHits.topLeftUp &&
			!diagonalHits.topLeftUpOut;
		const leftHasGroundBelow =
			leftWallHits.bottom ||
			diagonalHits.bottomLeftDown ||
			diagonalHits.bottomLeftOut;

		// Count right wall hits
		const rightWallContactCount = [
			rightWallHits.upper,
			rightWallHits.middle,
			rightWallHits.lower,
		].filter((h) => h).length;
		const rightHasBodyContact = rightWallContactCount >= 1;
		const rightHasTopSpace =
			!rightWallHits.top &&
			!diagonalHits.topRightUp &&
			!diagonalHits.topRightUpOut;
		const rightHasGroundBelow =
			rightWallHits.bottom ||
			diagonalHits.bottomRightDown ||
			diagonalHits.bottomRightOut;

		// ========================================================================
		// DETERMINE WALL STATES
		// ========================================================================

		// Helper to find ledge surface Y by binary searching where the wall ends vertically
		const findLedgeSurfaceY = (
			wallSide: 'left' | 'right',
			wallHits: typeof leftWallHits,
		): number => {
			// The ledge surface is between the highest ray that hits and the lowest ray that doesn't hit
			// We know: top didn't hit (hasTopSpace), but upper/middle did hit (hasBodyContact)

			const dirX = wallSide === 'left' ? -1 : 1;
			const startX =
				wallSide === 'left' ? pos.x - halfWidth : pos.x + halfWidth;

			// Find the transition point by doing a binary search between top (no hit) and upper (hit)
			// topLeft is at pos.y - halfHeight
			// upperLeft is at pos.y - halfHeight * 0.5

			let highY = pos.y - halfHeight; // Top of hitbox (didn't hit)
			let lowY = pos.y - halfHeight * 0.5; // Upper body (did hit)

			// If upper didn't hit but middle did, adjust the search range
			if (!wallHits.upper && wallHits.middle) {
				highY = pos.y - halfHeight * 0.5; // Upper (didn't hit)
				lowY = pos.y; // Middle (did hit)
			}

			// Binary search for the exact ledge Y (5 iterations should be precise enough)
			for (let i = 0; i < 5; i++) {
				const midY = (highY + lowY) / 2;
				const ray = new RAPIER.Ray(
					{ x: startX, y: midY },
					{ x: dirX, y: 0 },
				);
				const hit = this.world!.castRay(
					ray,
					wallDetectDist,
					true,
					undefined,
					undefined,
					body.collider,
				);

				if (hit) {
					// Hit wall at this Y, ledge is above
					lowY = midY;
				} else {
					// No wall at this Y, ledge is below
					highY = midY;
				}
			}

			// The ledge surface is approximately at highY (the lowest point with no wall)
			return highY;
		};

		// Left side analysis
		if (leftHasBodyContact) {
			result.hitWallLeft = true;
			result.wallNormal = { x: 1, y: 0 };

			// Ledge grab conditions:
			// 1. Wall contact at body level (middle/lower)
			// 2. NO wall above head (space to grab)
			// 3. NO ground directly below (floating platform)
			// 4. Upper diagonal detects potential ledge surface
			const isLedgeGrab =
				leftHasTopSpace &&
				!leftHasGroundBelow &&
				(leftWallHits.middle || leftWallHits.upper);

			if (isLedgeGrab) {
				result.canLedgeGrab = true;
				// Find the actual ledge surface Y by raycasting down from above
				const surfaceY = findLedgeSurfaceY('left', leftWallHits);
				result.ledgeY = surfaceY;
			}
		}

		// Right side analysis (only if left isn't already a ledge grab)
		if (rightHasBodyContact) {
			result.hitWallRight = true;
			if (!result.canLedgeGrab) {
				result.wallNormal = { x: -1, y: 0 };
			}

			const isLedgeGrab =
				rightHasTopSpace &&
				!rightHasGroundBelow &&
				(rightWallHits.middle || rightWallHits.upper);

			if (isLedgeGrab && !result.canLedgeGrab) {
				result.canLedgeGrab = true;
				// Find the actual ledge surface Y by raycasting down from above
				const surfaceY = findLedgeSurfaceY('right', rightWallHits);
				result.ledgeY = surfaceY;
			}
		}

		return result;
	}

	/**
	 * Get current position from Rapier (source of truth)
	 */
	getCharacterPosition(eid: number): { x: number; y: number } | null {
		const body = this.characterBodies.get(eid);
		if (!body) return null;

		const pos = body.rigidBody.translation();
		return { x: pos.x, y: pos.y };
	}

	/**
	 * Get current velocity from Rapier
	 */
	getCharacterVelocity(eid: number): { x: number; y: number } | null {
		const body = this.characterBodies.get(eid);
		if (!body) return null;

		const vel = body.rigidBody.linvel();
		return { x: vel.x, y: vel.y };
	}

	/**
	 * Force set position (for teleporting, respawning, etc.)
	 */
	setCharacterPosition(eid: number, x: number, y: number): void {
		const body = this.characterBodies.get(eid);
		if (!body) return;

		body.rigidBody.setTranslation({ x, y }, true);
		body.rigidBody.setLinvel({ x: 0, y: 0 }, true); // Reset velocity on teleport
	}

	/**
	 * Set character position without resetting velocity (for snapping while hanging)
	 */
	snapCharacterPosition(eid: number, x: number, y: number): void {
		const body = this.characterBodies.get(eid);
		if (!body) return;

		body.rigidBody.setTranslation({ x, y }, true);
		// Don't reset velocity - let the caller control that
	}

	/**
	 * Enable or disable gravity for a character (for wall hanging)
	 */
	setCharacterGravityEnabled(eid: number, enabled: boolean): void {
		const body = this.characterBodies.get(eid);
		if (!body) return;

		body.rigidBody.setGravityScale(enabled ? 1 : 0, true);
	}

	/**
	 * Completely freeze a character in place (for wall hanging)
	 * Sets velocity to zero and disables gravity
	 */
	freezeCharacter(eid: number, x: number, y: number): void {
		const body = this.characterBodies.get(eid);
		if (!body) return;

		// Set position
		body.rigidBody.setTranslation({ x, y }, true);
		// Zero out all velocity
		body.rigidBody.setLinvel({ x: 0, y: 0 }, true);
		// Disable gravity
		body.rigidBody.setGravityScale(0, true);
	}

	/**
	 * Unfreeze a character (when exiting wall hang)
	 * Optionally set initial velocity for the unfreeze
	 */
	unfreezeCharacter(
		eid: number,
		velocityX?: number,
		velocityY?: number,
	): void {
		const body = this.characterBodies.get(eid);
		if (!body) return;

		// Re-enable gravity
		body.rigidBody.setGravityScale(1, true);

		// Set velocity if provided
		if (velocityX !== undefined || velocityY !== undefined) {
			const currentVel = body.rigidBody.linvel();
			body.rigidBody.setLinvel(
				{
					x: velocityX ?? currentVel.x,
					y: velocityY ?? currentVel.y,
				},
				true,
			);
		}
	}

	// ============================================================================
	// Legacy moveCharacter - redirects to new API
	// ============================================================================

	moveCharacter(
		eid: number,
		_currentX: number,
		_currentY: number,
		desiredVelocityX: number,
		desiredVelocityY: number,
		_deltaTime: number,
	): { newX: number; newY: number; collision: CollisionResult } {
		// Determine if we want to jump based on negative Y velocity (up)
		const wantsToJump = desiredVelocityY < -100;
		const jumpImpulse = wantsToJump ? Math.abs(desiredVelocityY) : 0;

		const result = this.applyCharacterMovement(
			eid,
			desiredVelocityX,
			wantsToJump,
			jumpImpulse,
		);

		return {
			newX: result.x,
			newY: result.y,
			collision: result.collision,
		};
	}

	// ============================================================================
	// Query Methods
	// ============================================================================

	isInitialized(): boolean {
		return this.initialized;
	}

	// ============================================================================
	// Debug
	// ============================================================================

	enableDebug(enabled: boolean): void {
		if (this.rapierPhysics) {
			this.rapierPhysics.debugger(enabled);
		}
	}

	// ============================================================================
	// Cleanup
	// ============================================================================

	destroy(): void {
		if (this.world) {
			for (const [, platformBody] of this.platformBodies) {
				this.world.removeRigidBody(platformBody.rigidBody);
			}
			this.platformBodies.clear();

			for (const [, body] of this.characterBodies) {
				this.world.removeRigidBody(body.rigidBody);
			}
			this.characterBodies.clear();
		}

		if (this.rapierPhysics) {
			this.rapierPhysics.free();
			this.rapierPhysics = null;
		}

		this.world = null;
		this.initialized = false;
		console.log('[RapierPhysicsSystem] Destroyed');
	}
}
