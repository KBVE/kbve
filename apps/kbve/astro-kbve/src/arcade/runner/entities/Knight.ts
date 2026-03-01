import Phaser from 'phaser';
import {
	KNIGHT_HITBOX,
	KNIGHT_CROUCH_HITBOX,
	KNIGHT_HANG_HITBOX,
	KNIGHT_FEET_OFFSET,
	KNIGHT_ANIMATIONS,
} from '../sprites';
import { GAME_CONFIG } from '../config';
import { getComponents, type GameWorld } from '../ecs';

// ============================================================================
// Bitwise State Flags
// ============================================================================

export const KnightState = {
	NONE: 0,
	GROUNDED: 1 << 0, // 1
	CROUCHING: 1 << 1, // 2
	ATTACKING: 1 << 2, // 4
	TURNING: 1 << 3, // 8
	SWINGING: 1 << 4, // 16
	DEAD: 1 << 5, // 32
	INVULNERABLE: 1 << 6, // 64
	FACING_RIGHT: 1 << 7, // 128
	ROLLING: 1 << 12, // 4096 - Using bit 12 to avoid collision with anim bits (8-11)
	WALL_SLIDING: 1 << 13, // 8192 - Sliding down a wall
	WALL_LEFT: 1 << 14, // 16384 - Wall is on the left side
	WALL_HANGING: 1 << 15, // 32768 - Hanging on wall edge (can climb or jump)
} as const;

// Animation state encoded in upper bits (8-11) - only one active at a time
export const KnightAnim = {
	IDLE: 0 << 8,
	RUN: 1 << 8,
	JUMP: 2 << 8,
	JUMP_FALL_TRANSITION: 3 << 8,
	FALL: 4 << 8,
	SWING: 5 << 8,
	CROUCH: 6 << 8,
	CROUCH_WALK: 7 << 8,
	ATTACK: 8 << 8,
	TURN: 9 << 8,
	ROLL: 10 << 8,
	DEATH: 11 << 8,
	WALL_SLIDE: 12 << 8,
	WALL_CLIMB: 13 << 8,
	WALL_HANG: 14 << 8,
	MASK: 0xf << 8, // Mask for animation bits (4 bits = 16 states)
} as const;

export type KnightStateFlags = number;

// ============================================================================
// Knight Commands (input abstraction for player/AI)
// ============================================================================

export interface KnightCommands {
	moveLeft: boolean;
	moveRight: boolean;
	jump: boolean; // Edge-triggered: true only on first frame of press
	holdingUp: boolean; // Continuous: true while W/Up is held
	crouch: boolean;
	attack: boolean;
	roll: boolean;
	grapple: boolean;
	grappleTarget: { x: number; y: number; platformEid: number } | null;
}

export const emptyCommands: KnightCommands = {
	moveLeft: false,
	moveRight: false,
	jump: false,
	holdingUp: false,
	crouch: false,
	attack: false,
	roll: false,
	grapple: false,
	grappleTarget: null,
};

// ============================================================================
// Grapple State
// ============================================================================

export interface GrappleState {
	active: boolean;
	targetX: number;
	targetY: number;
	targetPlatformEid: number | null;
	ropeLength: number;
	angle: number;
	angularVelocity: number;
}

const createGrappleState = (): GrappleState => ({
	active: false,
	targetX: 0,
	targetY: 0,
	targetPlatformEid: null,
	ropeLength: 0,
	angle: 0,
	angularVelocity: 0,
});

// ============================================================================
// Knight Entity Class
// ============================================================================

export class Knight {
	// ECS entity ID
	public eid: number;

	// Bitwise state flags
	private _state: KnightStateFlags = KnightState.FACING_RIGHT;

	// Visual components (managed by scene)
	public sprite: Phaser.GameObjects.Sprite | null = null;
	public hitboxDebug: Phaser.GameObjects.Rectangle | null = null;

	// Grapple mechanics
	public grapple: GrappleState = createGrappleState();

	// Visual smoothing
	public visualX: number = 0;
	public visualY: number = 0;

	// Attack timeout (safety fallback if animation callback doesn't fire)
	private attackStartTime: number = 0;
	private static readonly ATTACK_DURATION = 400; // ms

	// Roll timing
	private rollStartTime: number = 0;
	private static readonly ROLL_DURATION = 700; // ms (12 frames at 17fps = ~700ms)
	private static readonly ROLL_SPEED = 500; // Horizontal speed during roll

	// Wall climb cooldown (prevent immediate re-grab)
	private climbStartTime: number = 0;
	private dropStartTime: number = 0;

	// Wall hang tracking - stores the Y position of the surface we're hanging on
	public hangSurfaceY: number = 0;

	// Gap hysteresis - remember which platform we selected when in a gap to prevent jitter
	public lastGapPlatformEid: number = -1;
	public lastGapSelectionTime: number = 0;

	// Reference to game world
	private world: GameWorld;

	// Whether this is player-controlled or AI
	public isPlayer: boolean;

	constructor(world: GameWorld, eid: number, isPlayer: boolean = false) {
		this.world = world;
		this.eid = eid;
		this.isPlayer = isPlayer;

		// Initialize visual position from entity
		const { Position } = getComponents(world);
		this.visualX = Position.x[eid];
		this.visualY = Position.y[eid];
	}

	// ============================================================================
	// State Flag Helpers
	// ============================================================================

	hasState(flag: number): boolean {
		return (this._state & flag) !== 0;
	}

	setState(flag: number): void {
		this._state |= flag;
	}

	clearState(flag: number): void {
		this._state &= ~flag;
	}

	toggleState(flag: number): void {
		this._state ^= flag;
	}

	get state(): KnightStateFlags {
		return this._state;
	}

	// Convenience getters
	get isGrounded(): boolean {
		return this.hasState(KnightState.GROUNDED);
	}

	get isCrouching(): boolean {
		return this.hasState(KnightState.CROUCHING);
	}

	get isAttacking(): boolean {
		return this.hasState(KnightState.ATTACKING);
	}

	get isTurning(): boolean {
		return this.hasState(KnightState.TURNING);
	}

	get isSwinging(): boolean {
		return this.hasState(KnightState.SWINGING);
	}

	get isDead(): boolean {
		return this.hasState(KnightState.DEAD);
	}

	get isRolling(): boolean {
		return this.hasState(KnightState.ROLLING);
	}

	get isWallSliding(): boolean {
		return this.hasState(KnightState.WALL_SLIDING);
	}

	get isWallHanging(): boolean {
		return this.hasState(KnightState.WALL_HANGING);
	}

	get wallOnLeft(): boolean {
		return this.hasState(KnightState.WALL_LEFT);
	}

	get facingRight(): boolean {
		return this.hasState(KnightState.FACING_RIGHT);
	}

	// ============================================================================
	// Animation State (encoded in upper bits)
	// ============================================================================

	get currentAnim(): number {
		return this._state & KnightAnim.MASK;
	}

	setAnim(anim: number): boolean {
		const current = this._state & KnightAnim.MASK;
		if (current === anim) return false; // No change
		this._state = (this._state & ~KnightAnim.MASK) | anim;
		return true; // Changed
	}

	// ============================================================================
	// Hitbox
	// ============================================================================

	get currentHitbox() {
		if (this.isWallHanging) return KNIGHT_HANG_HITBOX;
		if (this.isCrouching) return KNIGHT_CROUCH_HITBOX;
		return KNIGHT_HITBOX;
	}

	get hitboxYOffset(): number {
		return (KNIGHT_HITBOX.height - this.currentHitbox.height) / 2;
	}

	// ============================================================================
	// Position/Velocity Access
	// ============================================================================

	get x(): number {
		const { Position } = getComponents(this.world);
		return Position.x[this.eid];
	}

	set x(value: number) {
		const { Position } = getComponents(this.world);
		Position.x[this.eid] = value;
	}

	get y(): number {
		const { Position } = getComponents(this.world);
		return Position.y[this.eid];
	}

	set y(value: number) {
		const { Position } = getComponents(this.world);
		Position.y[this.eid] = value;
	}

	get vx(): number {
		const { Velocity } = getComponents(this.world);
		return Velocity.x[this.eid];
	}

	set vx(value: number) {
		const { Velocity } = getComponents(this.world);
		Velocity.x[this.eid] = value;
	}

	get vy(): number {
		const { Velocity } = getComponents(this.world);
		return Velocity.y[this.eid];
	}

	set vy(value: number) {
		const { Velocity } = getComponents(this.world);
		Velocity.y[this.eid] = value;
	}

	// ============================================================================
	// Commands Processing
	// ============================================================================

	processCommands(commands: KnightCommands, dt: number): void {
		if (this.isDead) return;
		if (this.grapple.active) return;

		// If rolling, don't process other commands (roll overrides everything)
		if (this.isRolling) return;

		// Wall hang state handling - can climb up or jump off
		// Controls while hanging:
		// - W/Up + toward platform direction = climb up onto platform
		// - Press away from platform (without W) = wall jump off
		// - S/Down = drop down
		if (this.isWallHanging) {
			// Pressing toward platform direction
			// wallOnLeft means the WALL is on the left side of the knight (platform is to the left)
			// So if wallOnLeft=true, platform is LEFT, press LEFT (A) toward it
			// If wallOnLeft=false, platform is RIGHT, press RIGHT (D) toward it
			const pressingTowardPlatform =
				(this.wallOnLeft && commands.moveLeft) ||
				(!this.wallOnLeft && commands.moveRight);

			// Pressing away from platform
			const pressingAwayFromPlatform =
				(this.wallOnLeft && commands.moveRight) ||
				(!this.wallOnLeft && commands.moveLeft);

			// Check if holding W/Up (continuous, not edge-triggered)
			const holdingUp = commands.holdingUp;

			// Climb: W/Up + toward platform direction (both must be held)
			if (holdingUp && pressingTowardPlatform) {
				this.wallClimb();
				return;
			} else if (holdingUp && pressingAwayFromPlatform) {
				// W/Up + away from platform = wall jump (up and away)
				this.wallJump();
				return;
			} else if (pressingAwayFromPlatform && !holdingUp) {
				// Just pressing away (no up) = wall jump sideways
				this.wallJump();
				return;
			} else if (commands.crouch) {
				// S/Down = drop down
				this.dropFromHang();
				return;
			}
			// If not pressing anything, stay hanging (no gravity applied in updatePhysics)
			return;
		}

		// Wall slide state handling - can jump off
		if (this.isWallSliding) {
			if (commands.jump) {
				this.wallJump();
				return;
			}
			// Continue sliding, movement handled by physics
		}

		// Update crouch state based on commands
		if (commands.crouch && this.isGrounded) {
			this.setState(KnightState.CROUCHING);
		} else {
			this.clearState(KnightState.CROUCHING);
		}

		// Roll - can only roll when grounded and not attacking
		if (commands.roll && this.isGrounded && !this.isAttacking) {
			this.roll();
			return; // Don't process other commands when starting roll
		}

		// Movement
		this.processMovement(commands, dt);

		// Jump
		if (commands.jump && this.isGrounded && !this.isAttacking) {
			this.jump();
		}

		// Attack - can attack both on ground and in air
		if (commands.attack && !this.isAttacking) {
			this.attack();
		}
	}

	private processMovement(commands: KnightCommands, dt: number): void {
		const crouchSpeedMultiplier = 0.4;
		const attackSpeedMultiplier = 0.3; // Slow down significantly while attacking

		let speedMultiplier = 1.0;
		if (this.isAttacking) {
			speedMultiplier = attackSpeedMultiplier;
		} else if (this.isCrouching) {
			speedMultiplier = crouchSpeedMultiplier;
		}

		const acceleration = GAME_CONFIG.acceleration * speedMultiplier;
		const deceleration = GAME_CONFIG.deceleration;
		const maxSpeed = GAME_CONFIG.maxSpeed * speedMultiplier;

		let vx = this.vx;

		if (commands.moveLeft && !commands.moveRight) {
			// Check for turn around (skip if rolling just finished - velocity might be high)
			if (
				this.facingRight &&
				this.isGrounded &&
				Math.abs(vx) > 100 &&
				!this.isTurning &&
				!this.isAttacking &&
				!this.isRolling
			) {
				this.startTurnAround(false);
			} else if (!this.isTurning) {
				this.clearState(KnightState.FACING_RIGHT);
			}
			vx -= acceleration * dt;
		} else if (commands.moveRight && !commands.moveLeft) {
			// Check for turn around (skip if rolling just finished - velocity might be high)
			if (
				!this.facingRight &&
				this.isGrounded &&
				Math.abs(vx) > 100 &&
				!this.isTurning &&
				!this.isAttacking &&
				!this.isRolling
			) {
				this.startTurnAround(true);
			} else if (!this.isTurning) {
				this.setState(KnightState.FACING_RIGHT);
			}
			vx += acceleration * dt;
		} else {
			// Apply friction/deceleration
			if (this.isGrounded) {
				if (vx > 0) {
					vx = Math.max(0, vx - deceleration * dt);
				} else if (vx < 0) {
					vx = Math.min(0, vx + deceleration * dt);
				}
			} else {
				// Less friction in air
				if (vx > 0) {
					vx = Math.max(0, vx - deceleration * 0.3 * dt);
				} else if (vx < 0) {
					vx = Math.min(0, vx + deceleration * 0.3 * dt);
				}
			}
		}

		// Clamp to max speed
		vx = Phaser.Math.Clamp(vx, -maxSpeed, maxSpeed);
		this.vx = vx;
	}

	private jump(): void {
		this.vy = GAME_CONFIG.jumpForce;
		this.clearState(KnightState.GROUNDED);
		this.playAnim(KnightAnim.JUMP);
	}

	wallJump(): void {
		// Wall jump: jump away from the wall
		const wallJumpForce = GAME_CONFIG.jumpForce * 0.9; // Slightly weaker than normal jump
		const wallKickForce = 350; // Horizontal push away from wall

		this.vy = wallJumpForce;

		// Push away from wall
		if (this.wallOnLeft) {
			// Wall is on left, push right
			this.vx = wallKickForce;
			this.setState(KnightState.FACING_RIGHT);
		} else {
			// Wall is on right, push left
			this.vx = -wallKickForce;
			this.clearState(KnightState.FACING_RIGHT);
		}

		// Clear all wall states
		this.clearState(KnightState.WALL_SLIDING);
		this.clearState(KnightState.WALL_HANGING);
		this.clearState(KnightState.WALL_LEFT);
		this.playAnim(KnightAnim.JUMP);
	}

	// Drop from wall hang - let go and fall
	dropFromHang(): void {
		// Mark drop start time for cooldown (prevent immediate re-grab)
		this.dropStartTime = Date.now();

		// Clear wall states
		this.clearState(KnightState.WALL_HANGING);
		this.clearState(KnightState.WALL_SLIDING);
		this.clearState(KnightState.WALL_LEFT);

		// Give a small downward velocity to start falling
		this.vy = 50;

		// Small push away from the wall so we don't immediately re-grab
		if (this.wallOnLeft) {
			this.vx = 30; // Push right (away from left wall)
		} else {
			this.vx = -30; // Push left (away from right wall)
		}

		this.playAnim(KnightAnim.FALL);
	}

	// Climb up onto the platform from a wall hang
	wallClimb(): void {
		// Move up and over onto the platform - need enough velocity to clear the edge
		const climbUpForce = -300; // Strong upward boost
		const climbForwardForce = 200; // Strong forward push to get onto platform

		this.vy = climbUpForce;

		// Move forward onto platform (toward the wall/platform)
		if (this.wallOnLeft) {
			// Wall on left means platform is to the left - move left
			this.vx = -climbForwardForce;
			this.clearState(KnightState.FACING_RIGHT);
		} else {
			// Wall on right means platform is to the right - move right
			this.vx = climbForwardForce;
			this.setState(KnightState.FACING_RIGHT);
		}

		// Immediately move knight up a bit to help clear the edge
		this.y -= 20;

		// Clear wall states
		this.clearState(KnightState.WALL_SLIDING);
		this.clearState(KnightState.WALL_HANGING);
		this.clearState(KnightState.WALL_LEFT);
		this.playAnim(KnightAnim.WALL_CLIMB);

		// Mark climb start time for cooldown
		this.climbStartTime = Date.now();
	}

	// Check if recently climbed (to prevent re-grabbing wall immediately)
	isRecentlyClimbed(): boolean {
		return Date.now() - this.climbStartTime < 300; // 300ms cooldown
	}

	// Check if recently dropped (to prevent immediate re-grab after dropping)
	isRecentlyDropped(): boolean {
		return Date.now() - this.dropStartTime < 400; // 400ms cooldown
	}

	private attack(): void {
		this.setState(KnightState.ATTACKING);
		this.attackStartTime = Date.now();
		this.playAnim(KnightAnim.ATTACK);
	}

	private roll(): void {
		this.setState(KnightState.ROLLING);
		this.setState(KnightState.INVULNERABLE); // Invincible during roll
		this.rollStartTime = Date.now();
		// Set velocity in facing direction
		this.vx = this.facingRight ? Knight.ROLL_SPEED : -Knight.ROLL_SPEED;
		this.playAnim(KnightAnim.ROLL);
	}

	private startTurnAround(facingRight: boolean): void {
		this.setState(KnightState.TURNING);
		this.playAnim(KnightAnim.TURN);
		// Store the target facing direction - will be applied when animation completes
		if (facingRight) {
			this.setState(KnightState.FACING_RIGHT);
		} else {
			this.clearState(KnightState.FACING_RIGHT);
		}
	}

	// Called when attack animation completes
	onAttackComplete(): void {
		this.clearState(KnightState.ATTACKING);
		// Force immediate transition to idle - updateAnimation will pick the right one next frame
		this.playAnim(KnightAnim.IDLE, true);
	}

	// Called when roll animation completes
	onRollComplete(): void {
		this.clearState(KnightState.ROLLING);
		this.clearState(KnightState.INVULNERABLE);
		this.clearState(KnightState.TURNING); // Ensure turning is cleared too
		// Reduce roll momentum for smoother transition
		// Using half of max speed gives a nice flow into run or idle
		const transitionSpeed = GAME_CONFIG.maxSpeed * 0.5;
		if (this.vx > transitionSpeed) {
			this.vx = transitionSpeed;
		} else if (this.vx < -transitionSpeed) {
			this.vx = -transitionSpeed;
		}
		// Force immediate transition to idle - updateAnimation will pick the right one next frame
		this.playAnim(KnightAnim.IDLE, true);
	}

	// Called when turn animation completes
	onTurnComplete(): void {
		this.clearState(KnightState.TURNING);
	}

	// ============================================================================
	// Grapple Mechanics
	// ============================================================================

	startGrapple(
		targetX: number,
		targetY: number,
		platformEid: number | null,
	): boolean {
		const dx = targetX - this.x;
		const dy = targetY - this.y;
		const distance = Math.sqrt(dx * dx + dy * dy);

		if (distance > GAME_CONFIG.grappleMaxDistance) {
			return false;
		}

		const angle = Math.atan2(this.y - targetY, this.x - targetX);
		const tangentVel =
			-this.vx * Math.sin(angle) + this.vy * Math.cos(angle);
		const angularVel = tangentVel / distance;

		this.grapple = {
			active: true,
			targetX,
			targetY,
			targetPlatformEid: platformEid,
			ropeLength: distance,
			angle,
			angularVelocity: angularVel,
		};

		this.clearState(KnightState.GROUNDED);
		this.setState(KnightState.SWINGING);
		this.playAnim(KnightAnim.SWING);

		return true;
	}

	releaseGrapple(): void {
		if (!this.grapple.active) return;

		const tangentSpeed =
			this.grapple.angularVelocity * this.grapple.ropeLength;
		const vx = -tangentSpeed * Math.sin(this.grapple.angle);
		const vy = tangentSpeed * Math.cos(this.grapple.angle);

		const boostMultiplier = 1.3;
		this.vx = vx * boostMultiplier;

		if (vy < 0) {
			this.vy = vy * boostMultiplier - 100;
		} else {
			this.vy = vy;
		}

		this.grapple.active = false;
		this.grapple.targetPlatformEid = null;
		this.clearState(KnightState.SWINGING);
	}

	updateGrapplePhysics(dt: number, groundY: number): void {
		if (!this.grapple.active) return;

		const gravity = GAME_CONFIG.gravity;
		const gravityAccel =
			(gravity / this.grapple.ropeLength) * Math.cos(this.grapple.angle);

		this.grapple.angularVelocity += gravityAccel * dt;
		this.grapple.angularVelocity *= 0.995;
		this.grapple.angle += this.grapple.angularVelocity * dt;

		const newX =
			this.grapple.targetX +
			Math.cos(this.grapple.angle) * this.grapple.ropeLength;
		const newY =
			this.grapple.targetY +
			Math.sin(this.grapple.angle) * this.grapple.ropeLength;

		this.x = newX;
		this.y = newY;

		// Update facing based on swing direction
		if (this.grapple.angularVelocity < 0) {
			this.clearState(KnightState.FACING_RIGHT);
		} else {
			this.setState(KnightState.FACING_RIGHT);
		}

		// Ground collision while swinging
		const groundLevel = groundY - KNIGHT_HITBOX.height / 2;
		if (this.y >= groundLevel) {
			this.y = groundLevel;
			this.setState(KnightState.GROUNDED);
			this.releaseGrapple();
		}
	}

	// ============================================================================
	// Physics
	// ============================================================================

	// Apply gravity and movement only - no ground collision here
	// Ground/platform collision is handled by the scene's unified collision system
	updatePhysics(dt: number): void {
		if (this.grapple.active) return;

		// Wall hanging = no gravity, stay in place
		if (this.isWallHanging) {
			this.vx = 0;
			this.vy = 0;
			return;
		}

		// Only apply gravity if not grounded
		if (!this.isGrounded) {
			this.vy += GAME_CONFIG.gravity * dt;
		}

		// Update position
		this.x += this.vx * dt;
		this.y += this.vy * dt;

		// Ceiling collision
		const hitboxHeight = this.currentHitbox.height;
		if (this.y < hitboxHeight / 2) {
			this.y = hitboxHeight / 2;
			this.vy = 0;
		}
	}

	// ============================================================================
	// Animation
	// ============================================================================

	playAnim(anim: number, force: boolean = false): void {
		if (!force && !this.setAnim(anim)) return; // No change, skip (unless forced)
		if (!this.sprite) return;

		// Update state if forced
		if (force) {
			this._state = (this._state & ~KnightAnim.MASK) | anim;
		}

		// Get the animation key for this anim state
		let animKey: string | undefined;
		switch (anim) {
			case KnightAnim.IDLE:
				animKey = KNIGHT_ANIMATIONS.idle.key;
				break;
			case KnightAnim.RUN:
				animKey = KNIGHT_ANIMATIONS.run.key;
				break;
			case KnightAnim.JUMP:
				animKey = KNIGHT_ANIMATIONS.jump.key;
				break;
			case KnightAnim.JUMP_FALL_TRANSITION:
				animKey = KNIGHT_ANIMATIONS.jumpFallTransition.key;
				break;
			case KnightAnim.FALL:
				animKey = KNIGHT_ANIMATIONS.fall.key;
				break;
			case KnightAnim.SWING:
				animKey = KNIGHT_ANIMATIONS.wallSlide.key;
				break;
			case KnightAnim.CROUCH:
				animKey = KNIGHT_ANIMATIONS.crouch.key;
				break;
			case KnightAnim.CROUCH_WALK:
				animKey = KNIGHT_ANIMATIONS.crouchWalk.key;
				break;
			case KnightAnim.ATTACK:
				animKey = KNIGHT_ANIMATIONS.attack1.key;
				break;
			case KnightAnim.TURN:
				animKey = KNIGHT_ANIMATIONS.turnAround.key;
				break;
			case KnightAnim.ROLL:
				animKey = KNIGHT_ANIMATIONS.roll.key;
				break;
			case KnightAnim.DEATH:
				animKey = KNIGHT_ANIMATIONS.death.key;
				break;
			case KnightAnim.WALL_SLIDE:
				animKey = KNIGHT_ANIMATIONS.wallSlide.key;
				break;
			case KnightAnim.WALL_CLIMB:
				animKey = KNIGHT_ANIMATIONS.wallClimb.key;
				break;
			case KnightAnim.WALL_HANG:
				animKey = KNIGHT_ANIMATIONS.wallHang.key;
				break;
		}

		// Only play if animation key exists and is different from current
		if (animKey && this.sprite.anims.currentAnim?.key !== animKey) {
			this.sprite.play(animKey);
		}
	}

	updateAnimation(): void {
		if (this.isDead) return;
		if (this.grapple.active) return;

		// Always update sprite flip (even during attack/turn/roll)
		if (this.sprite) {
			this.sprite.setFlipX(!this.facingRight);
		}

		// Safety timeout for roll animation
		if (this.isRolling) {
			if (Date.now() - this.rollStartTime > Knight.ROLL_DURATION) {
				// Use the same handler as animation complete
				this.onRollComplete();
				// Fall through to pick the right animation below
			} else {
				return; // Don't change animation while rolling
			}
		}

		// Safety timeout for attack animation
		if (this.isAttacking) {
			if (Date.now() - this.attackStartTime > Knight.ATTACK_DURATION) {
				// Use the same handler as animation complete
				this.onAttackComplete();
				// Fall through to pick the right animation below
			} else {
				return;
			}
		}

		// Safety: Clear turning state if airborne (can't turn in air)
		if (this.isTurning && !this.isGrounded) {
			this.clearState(KnightState.TURNING);
		}

		if (this.isTurning) return;

		if (this.isGrounded) {
			if (this.isCrouching) {
				// Use hysteresis for crouch walk: need > 30 to start, < 10 to stop
				const isCurrentlyCrouchWalking =
					this.currentAnim === KnightAnim.CROUCH_WALK;
				const shouldCrouchWalk = isCurrentlyCrouchWalking
					? Math.abs(this.vx) > 10 // Keep walking until below 10
					: Math.abs(this.vx) > 30; // Need above 30 to start walking
				if (shouldCrouchWalk) {
					this.playAnim(KnightAnim.CROUCH_WALK);
				} else {
					this.playAnim(KnightAnim.CROUCH);
				}
			} else {
				// Use hysteresis for run/idle: need > 30 to start running, < 10 to stop
				const isCurrentlyRunning = this.currentAnim === KnightAnim.RUN;
				const shouldRun = isCurrentlyRunning
					? Math.abs(this.vx) > 10 // Keep running until below 10
					: Math.abs(this.vx) > 30; // Need above 30 to start running
				if (shouldRun) {
					this.playAnim(KnightAnim.RUN);
				} else {
					this.playAnim(KnightAnim.IDLE);
				}
			}
		} else if (this.isWallHanging) {
			// Wall hanging - face toward the platform/ledge, play wall hang animation
			this.playAnim(KnightAnim.WALL_HANG);
			if (this.sprite) {
				// Knight should face TOWARD the platform they're hanging on
				// wallOnLeft=true: platform is on left, knight should face LEFT = setFlipX(true)
				// wallOnLeft=false: platform is on right, knight should face RIGHT = setFlipX(false)
				// Default sprite faces right, setFlipX(true) makes it face left
				this.sprite.setFlipX(this.wallOnLeft);
			}
		} else if (this.isWallSliding) {
			// Wall sliding - face away from wall, play wall slide animation
			this.playAnim(KnightAnim.WALL_SLIDE);
			// When wall sliding, sprite faces AWAY from the wall
			if (this.sprite) {
				// wallOnLeft=true: wall on left, face RIGHT (away) = setFlipX(false)
				// wallOnLeft=false: wall on right, face LEFT (away) = setFlipX(true)
				this.sprite.setFlipX(!this.wallOnLeft);
			}
		} else {
			// Airborne animation states
			if (this.vy < -50) {
				// Moving upward fast - jump animation
				this.playAnim(KnightAnim.JUMP);
			} else if (this.vy >= -50 && this.vy <= 50) {
				// Near apex of jump - transition animation
				this.playAnim(KnightAnim.JUMP_FALL_TRANSITION);
			} else if (this.vy > 50) {
				// Falling - fall animation
				this.playAnim(KnightAnim.FALL);
			}
		}
	}

	// ============================================================================
	// Visual Sync
	// ============================================================================

	syncVisuals(smoothing: number = 0.85): void {
		// Smooth visual interpolation
		this.visualX = Phaser.Math.Linear(this.visualX, this.x, smoothing);
		this.visualY = Phaser.Math.Linear(this.visualY, this.y, smoothing);

		const hitbox = this.currentHitbox;
		const hitboxYOffset = this.hitboxYOffset;

		// Sprite positioning
		const spriteY =
			this.visualY +
			hitboxYOffset -
			(KNIGHT_FEET_OFFSET - hitbox.height / 2);
		const xOffset = this.facingRight ? 4 : -4;

		if (this.sprite) {
			this.sprite.setPosition(this.visualX + xOffset, spriteY);
		}

		// Debug hitbox
		if (this.hitboxDebug) {
			this.hitboxDebug.setPosition(this.x, this.y + hitboxYOffset);
			this.hitboxDebug.setSize(hitbox.width, hitbox.height);
		}
	}

	// ============================================================================
	// Lifecycle
	// ============================================================================

	die(): void {
		this.setState(KnightState.DEAD);
		this.releaseGrapple();
		this.playAnim(KnightAnim.DEATH);
	}

	reset(x: number, y: number): void {
		this._state =
			KnightState.GROUNDED | KnightState.FACING_RIGHT | KnightAnim.IDLE;
		this.x = x;
		this.y = y;
		this.vx = 0;
		this.vy = 0;
		this.visualX = x;
		this.visualY = y;
		this.grapple = createGrappleState();
		if (this.sprite) {
			this.sprite.play(KNIGHT_ANIMATIONS.idle.key);
		}
	}

	destroy(): void {
		if (this.sprite) {
			this.sprite.destroy();
			this.sprite = null;
		}
		if (this.hitboxDebug) {
			this.hitboxDebug.destroy();
			this.hitboxDebug = null;
		}
	}
}
