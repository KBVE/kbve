import Phaser from 'phaser';
import {
	createGameWorld,
	createPlayerEntity,
	createPlatformEntity,
	createEnemyEntity,
	destroyEntity,
	getPlatforms,
	getEnemies,
	getComponents,
	EnemyType,
	type GameWorld,
} from './ecs';
import { GAME_CONFIG, COLORS } from './config';
import {
	KNIGHT_FRAME,
	KNIGHT_HITBOX,
	KNIGHT_SWORD_HITBOX,
	KNIGHT_ANIMATIONS,
	KNIGHT_SCALE,
} from './sprites';
import { Knight, KnightState } from './entities/Knight';
import { InputSystem } from './systems/InputSystem';
import { AISystem, AIBehavior } from './systems/AISystem';
import { ParallaxBackground } from './systems/ParallaxBackground';
import { RapierPhysicsSystem } from './systems/RapierPhysicsSystem';

// Ground tile configuration
const GROUND_TILE_WIDTH = 80;
const GROUND_TILE_HEIGHT = 50;

export class RunnerScene extends Phaser.Scene {
	private world!: GameWorld;

	// Knight entities
	private playerKnight!: Knight;
	private allyKnights: Knight[] = [];

	// Systems
	private inputSystem!: InputSystem;
	private aiSystem!: AISystem;
	private parallax!: ParallaxBackground;
	private rapierPhysics!: RapierPhysicsSystem;

	// Sprite management
	private platformSprites: Map<number, Phaser.GameObjects.Rectangle> =
		new Map();
	private enemySprites: Map<number, Phaser.GameObjects.Rectangle> = new Map();

	// Timers
	private enemySpawnTimer!: Phaser.Time.TimerEvent;
	private allySpawnTimer!: Phaser.Time.TimerEvent;

	// Game state
	private score: number = 0;
	private scoreText!: Phaser.GameObjects.Text;
	private isGameOver: boolean = false;

	// Ground tiles now use the same ECS Platform component
	// Map from entity ID to visual sprite (same as platformSprites)
	private groundTileSprites: Map<number, Phaser.GameObjects.Rectangle> =
		new Map();

	// Grapple visuals
	private grappleLine!: Phaser.GameObjects.Line;

	// Debug visuals
	private debugGraphics!: Phaser.GameObjects.Graphics;
	private debugEnabled: boolean = true;

	// Ground break-off tracking
	private groundBreakX: number = 0;

	// World generation tracking
	private worldExtentX: number = 0;

	private get width(): number {
		return this.scale.width;
	}

	private get height(): number {
		return this.scale.height;
	}

	private get groundY(): number {
		return this.height - GAME_CONFIG.groundOffset;
	}

	constructor() {
		super({ key: 'RunnerScene' });
	}

	preload() {
		// Load knight animations
		Object.values(KNIGHT_ANIMATIONS).forEach((anim) => {
			this.load.spritesheet(anim.key, anim.path, {
				frameWidth: KNIGHT_FRAME.width,
				frameHeight: KNIGHT_FRAME.height,
			});
		});

		// Load parallax background images
		ParallaxBackground.preload(this);
	}

	async create() {
		// Reset maps that may persist between restarts
		this.groundTileSprites.clear();
		this.platformSprites.clear();
		this.enemySprites.clear();
		this.allyKnights = [];

		// Create parallax background first (behind everything)
		this.parallax = new ParallaxBackground(this);
		this.parallax.create();

		this.createAnimations();
		this.initWorld();
		this.createGround();
		this.createPlayer();
		this.createGrappleLine();
		this.createDebugGraphics();
		this.setupSystems();
		this.setupSpawners();
		this.createUI();
		this.setupCamera();

		// Initialize Rapier physics system
		await this.initializeRapierPhysics();

		this.scale.on('resize', this.handleResize, this);
	}

	private async initializeRapierPhysics(): Promise<void> {
		this.rapierPhysics = new RapierPhysicsSystem(this, this.world);
		await this.rapierPhysics.initialize();

		// IMPORTANT: Sync platforms/ground tiles to Rapier BEFORE creating character
		// Otherwise the character will fall through on spawn because no colliders exist yet
		this.rapierPhysics.syncPlatformsFromECS();

		// Create physics body for player knight
		const hitbox = this.playerKnight.currentHitbox;
		const hitboxYOffset = this.playerKnight.hitboxYOffset;
		this.rapierPhysics.createCharacterBody(
			this.playerKnight.eid,
			this.playerKnight.x,
			this.playerKnight.y + hitboxYOffset,
			hitbox.width,
			hitbox.height,
		);

		// Store ground Y for reference (legacy, ground tiles are now ECS entities)
		this.rapierPhysics.createGround(this.groundY, this.groundBreakX);

		console.log(
			'[RunnerScene] Rapier physics initialized with',
			this.groundTileSprites.size,
			'ground tiles',
		);
	}

	private setupCamera() {
		this.cameras.main.setBounds(0, 0, Number.MAX_SAFE_INTEGER, this.height);
		this.cameras.main.startFollow(
			this.playerKnight.sprite!,
			true,
			0.1,
			0.1,
		);
		this.cameras.main.setFollowOffset(-this.width * 0.3, 0);
	}

	private createAnimations() {
		Object.values(KNIGHT_ANIMATIONS).forEach((anim) => {
			if (!this.anims.exists(anim.key)) {
				this.anims.create({
					key: anim.key,
					frames: this.anims.generateFrameNumbers(anim.key, {
						start: 0,
						end: anim.frames - 1,
					}),
					frameRate: anim.frameRate,
					repeat: anim.repeat,
				});
			}
		});
	}

	private createGrappleLine() {
		this.grappleLine = this.add.line(0, 0, 0, 0, 0, 0, COLORS.grappleLine);
		this.grappleLine.setLineWidth(3);
		this.grappleLine.setVisible(false);
		this.grappleLine.setDepth(10);
	}

	private createDebugGraphics() {
		this.debugGraphics = this.add.graphics();
		this.debugGraphics.setDepth(1000); // On top of everything
	}

	private handleResize(gameSize: Phaser.Structs.Size) {
		const width = gameSize.width;
		const { Position } = getComponents(this.world);
		const newTileY = this.groundY + GROUND_TILE_HEIGHT / 2;

		// Resize parallax background
		this.parallax.resize();

		// Update ground tile positions (Y coordinate may have changed)
		for (const [eid, sprite] of this.groundTileSprites) {
			Position.y[eid] = newTileY;
			sprite.setPosition(sprite.x, newTileY);
		}

		// Ensure we have enough tiles for new width
		let rightmostX = 0;
		for (const [eid] of this.groundTileSprites) {
			const tileX = Position.x[eid];
			if (tileX > rightmostX) rightmostX = tileX;
		}

		const tilesNeeded = Math.ceil(width / GROUND_TILE_WIDTH) + 2;
		while (rightmostX < tilesNeeded * GROUND_TILE_WIDTH) {
			rightmostX += GROUND_TILE_WIDTH;
			this.spawnGroundTileAt(rightmostX);
		}

		this.scoreText.setPosition(16, 16);

		// Note: We no longer reset the knight's Y position on resize.
		// The collision system will handle proper positioning on the next frame.
		// This prevents teleporting the knight to ground level when they're on a platform.
	}

	private initWorld() {
		this.world = createGameWorld();
	}

	private createGround() {
		const tilesNeeded = Math.ceil(this.width / GROUND_TILE_WIDTH) + 2;

		for (let i = 0; i < tilesNeeded; i++) {
			this.spawnGroundTileAt(
				i * GROUND_TILE_WIDTH + GROUND_TILE_WIDTH / 2,
			);
		}
	}

	private spawnGroundTileAt(x: number) {
		// Ground tiles are Platform entities with isGround=true
		// The y position is the CENTER of the tile, collision uses top edge
		const tileY = this.groundY + GROUND_TILE_HEIGHT / 2;

		const eid = createPlatformEntity(
			this.world,
			x,
			tileY,
			GROUND_TILE_WIDTH,
			GROUND_TILE_HEIGHT,
			true, // isGround = true
		);

		const sprite = this.add.rectangle(
			x,
			tileY,
			GROUND_TILE_WIDTH - 2,
			GROUND_TILE_HEIGHT,
			COLORS.ground,
		);

		this.groundTileSprites.set(eid, sprite);
		return eid;
	}

	private createPlayer() {
		const playerGroundedY = this.groundY - KNIGHT_HITBOX.height / 2;
		const startX = this.width / 2;

		const eid = createPlayerEntity(
			this.world,
			startX,
			playerGroundedY,
			GAME_CONFIG.jumpForce,
		);

		this.playerKnight = new Knight(this.world, eid, true);
		this.playerKnight.setState(KnightState.GROUNDED);

		// Create sprite
		this.playerKnight.sprite = this.add.sprite(
			startX,
			playerGroundedY,
			KNIGHT_ANIMATIONS.idle.key,
		);
		this.playerKnight.sprite.setScale(KNIGHT_SCALE);
		this.playerKnight.sprite.setDepth(5);
		this.playerKnight.sprite.play(KNIGHT_ANIMATIONS.idle.key);
		this.playerKnight.sprite.setOrigin(0.5, 0.5);

		// Animation callbacks
		this.playerKnight.sprite.on(
			'animationcomplete',
			(anim: Phaser.Animations.Animation) => {
				if (anim.key === KNIGHT_ANIMATIONS.attack1.key) {
					this.playerKnight.onAttackComplete();
				} else if (anim.key === KNIGHT_ANIMATIONS.roll.key) {
					this.playerKnight.onRollComplete();
				} else if (anim.key === KNIGHT_ANIMATIONS.turnAround.key) {
					this.playerKnight.onTurnComplete();
				}
			},
		);

		// Debug hitbox (disabled)
		// this.playerKnight.hitboxDebug = this.add.rectangle(
		//   startX,
		//   playerGroundedY,
		//   KNIGHT_HITBOX.width,
		//   KNIGHT_HITBOX.height
		// );
		// this.playerKnight.hitboxDebug.setStrokeStyle(2, 0x00ff00);
		// this.playerKnight.hitboxDebug.setFillStyle(0x00ff00, 0.2);
		// this.playerKnight.hitboxDebug.setDepth(10);
	}

	private setupSystems() {
		// Input system
		this.inputSystem = new InputSystem(this);
		this.inputSystem.setup();

		this.inputSystem.setGrappleCallback(() => this.releaseGrapple());

		this.inputSystem.setRestartCallback(() => this.restartGame());

		// AI system
		this.aiSystem = new AISystem(this.world);
	}

	private setupSpawners() {
		this.worldExtentX = this.width;

		// Spawn initial platforms
		for (
			let x = this.width * 0.6;
			x < this.width + 400;
			x += Phaser.Math.Between(150, 300)
		) {
			this.spawnPlatformAt(x);
		}

		// Enemy spawner
		this.enemySpawnTimer = this.time.addEvent({
			delay: GAME_CONFIG.spawnInterval * 2,
			callback: this.spawnEnemy,
			callbackScope: this,
			loop: true,
		});

		// Spawn initial ally knight immediately
		this.spawnAllyKnight();

		// Ally knight spawner (every 20 seconds for additional allies)
		this.allySpawnTimer = this.time.addEvent({
			delay: 20000,
			callback: this.spawnAllyKnight,
			callbackScope: this,
			loop: true,
		});
	}

	private createUI() {
		this.scoreText = this.add
			.text(16, 16, 'Score: 0', {
				fontSize: '28px',
				color: COLORS.scoreText,
				fontStyle: 'bold',
			})
			.setScrollFactor(0)
			.setDepth(100);

		this.add
			.text(
				16,
				this.height - 35,
				'WASD/Arrows: Move | Click Platform: Grapple',
				{
					fontSize: '14px',
					color: COLORS.hintText,
				},
			)
			.setScrollFactor(0)
			.setDepth(100);
	}

	// ============================================================================
	// Grapple Mechanics
	// ============================================================================

	private tryGrapple(clickX: number, clickY: number): boolean {
		if (this.isGameOver) return false;

		const platformEid = this.findPlatformAtPoint(clickX, clickY);
		if (platformEid !== null) {
			const success = this.playerKnight.startGrapple(
				clickX,
				clickY,
				platformEid,
			);
			if (success) {
				this.grappleLine.setVisible(true);
				return true;
			}
		}

		// No platform found - try jump instead
		if (this.playerKnight.isGrounded && !this.playerKnight.isAttacking) {
			this.playerKnight.processCommands(
				{ ...this.inputSystem.getCommands(), jump: true },
				0,
			);
		}

		return false;
	}

	private releaseGrapple() {
		if (this.playerKnight.grapple.active) {
			this.playerKnight.releaseGrapple();
			this.grappleLine.setVisible(false);
		}
	}

	private findPlatformAtPoint(x: number, y: number): number | null {
		const { Position, Platform } = getComponents(this.world);
		const platforms = getPlatforms(this.world);

		for (const eid of platforms) {
			const platX = Position.x[eid];
			const platY = Position.y[eid];
			const platW = Platform.width[eid];
			const platH = Platform.height[eid];

			const padding = 20;
			if (
				x >= platX - platW / 2 - padding &&
				x <= platX + platW / 2 + padding &&
				y >= platY - platH / 2 - padding &&
				y <= platY + platH / 2 + padding
			) {
				return eid;
			}
		}
		return null;
	}

	// ============================================================================
	// Ally Knight Spawning
	// ============================================================================

	private spawnAllyKnight() {
		if (this.isGameOver) return;
		if (this.allyKnights.length >= 3) return; // Max 3 allies

		const playerGroundedY = this.groundY - KNIGHT_HITBOX.height / 2;
		const spawnX = this.playerKnight.x - 150; // Spawn behind player

		// Make sure spawn point is valid (not over broken ground)
		if (spawnX < this.groundBreakX + 50) return;

		const eid = createPlayerEntity(
			this.world,
			spawnX,
			playerGroundedY,
			GAME_CONFIG.jumpForce,
		);

		const ally = new Knight(this.world, eid, false);
		ally.setState(KnightState.GROUNDED);

		// Create sprite with slight color tint to distinguish from player
		ally.sprite = this.add.sprite(
			spawnX,
			playerGroundedY,
			KNIGHT_ANIMATIONS.idle.key,
		);
		ally.sprite.setScale(KNIGHT_SCALE);
		ally.sprite.setDepth(4); // Slightly behind player
		ally.sprite.play(KNIGHT_ANIMATIONS.idle.key);
		ally.sprite.setOrigin(0.5, 0.5);
		ally.sprite.setTint(0x88ccff); // Blue tint for allies

		// Animation callbacks
		ally.sprite.on(
			'animationcomplete',
			(anim: Phaser.Animations.Animation) => {
				if (anim.key === KNIGHT_ANIMATIONS.attack1.key) {
					ally.onAttackComplete();
				} else if (anim.key === KNIGHT_ANIMATIONS.roll.key) {
					ally.onRollComplete();
				} else if (anim.key === KNIGHT_ANIMATIONS.turnAround.key) {
					ally.onTurnComplete();
				}
			},
		);

		// Debug hitbox (disabled)
		// ally.hitboxDebug = this.add.rectangle(
		//   spawnX,
		//   playerGroundedY,
		//   KNIGHT_HITBOX.width,
		//   KNIGHT_HITBOX.height
		// );
		// ally.hitboxDebug.setStrokeStyle(2, 0x00aaff);
		// ally.hitboxDebug.setFillStyle(0x00aaff, 0.2);
		// ally.hitboxDebug.setDepth(10);

		// Register with AI system
		this.aiSystem.registerKnight(ally, {
			behavior: AIBehavior.FOLLOW_PLAYER,
			followDistance: 80 + this.allyKnights.length * 40, // Stagger distances
			attackRange: 120,
		});

		this.allyKnights.push(ally);
	}

	// ============================================================================
	// Spawners
	// ============================================================================

	private spawnPlatformAt(x: number) {
		if (this.isGameOver) return;

		const { Position } = getComponents(this.world);
		const width = Phaser.Math.Between(100, 200);
		const height = 24;
		const minY = this.height * 0.25;
		const maxY = this.groundY - 100;
		const y = Phaser.Math.Between(minY, maxY);

		const eid = createPlatformEntity(this.world, x, y, width, height);

		const sprite = this.add.rectangle(
			Position.x[eid],
			Position.y[eid],
			width,
			height,
			COLORS.platform,
		);
		sprite.setInteractive({ useHandCursor: true });
		this.platformSprites.set(eid, sprite);
	}

	private spawnEnemy() {
		if (this.isGameOver) return;

		const { Position } = getComponents(this.world);
		const playerX = this.playerKnight.x;

		const enemyType = Phaser.Math.Between(0, 2);
		let y: number;
		let color: number;
		const speed = GAME_CONFIG.platformSpeed + Phaser.Math.Between(20, 60);

		switch (enemyType) {
			case EnemyType.WALKER:
				y = this.groundY - 18;
				color = COLORS.enemyWalker;
				break;
			case EnemyType.FLYER:
				y = Phaser.Math.Between(this.height * 0.25, this.height * 0.5);
				color = COLORS.enemyFlyer;
				break;
			case EnemyType.SPIKER:
				y = this.groundY - 70;
				color = COLORS.enemySpiker;
				break;
			default:
				y = this.groundY - 18;
				color = COLORS.enemyWalker;
		}

		const spawnX = playerX + this.width + 100;
		const eid = createEnemyEntity(this.world, spawnX, y, enemyType, speed);

		const size = enemyType === EnemyType.FLYER ? 28 : 35;
		const sprite = this.add.rectangle(
			Position.x[eid],
			Position.y[eid],
			size,
			size,
		);
		sprite.setStrokeStyle(2, 0xff0000);
		sprite.setFillStyle(color, 0.5);
		sprite.setDepth(4);
		this.enemySprites.set(eid, sprite);
	}

	// ============================================================================
	// Update Loop
	// ============================================================================

	update(time: number, delta: number) {
		if (this.isGameOver) {
			this.inputSystem.processGameOverInput();
			return;
		}

		const dt = delta / 1000;

		// Update world elements first
		this.updateScore(delta);
		this.updateGround(dt);
		this.updatePlatforms(dt);
		this.updateEnemies(dt);
		this.updateGrappleAnchor();

		// Process pointer for grapple
		this.processPointerInput();

		// Update physics for all knights (applies gravity, movement)
		this.updateKnightPhysics(dt);

		// Check all collisions (unified ground + platforms, enemies)
		this.checkCollisions();

		// Now process commands with correct grounded state
		this.processKnightCommands(time, dt);

		// Update animations
		this.updateKnightAnimations();

		// Sync all visuals
		this.syncVisuals();

		// Draw debug collision visualization
		this.drawDebugCollisions();

		// Update parallax background based on camera position
		this.parallax.update(this.cameras.main.scrollX);
	}

	private processPointerInput() {
		if (this.inputSystem.isPointerDown()) {
			const pos = this.inputSystem.getPointerPosition();

			// Convert screen position to world position
			const worldX = pos.x + this.cameras.main.scrollX;
			const worldY = pos.y + this.cameras.main.scrollY;

			this.tryGrapple(worldX, worldY);
		}
	}

	private updateKnightPhysics(dt: number) {
		// Update player physics
		if (this.playerKnight.grapple.active) {
			this.playerKnight.updateGrapplePhysics(dt, this.groundY);
			this.updateGrappleLine();
		} else if (this.rapierPhysics?.isInitialized()) {
			// Rapier handles gravity - no manual gravity application needed
			// Position and velocity are read FROM Rapier in checkKnightCollisionsRapier
		} else {
			// Fallback: use manual physics
			this.playerKnight.updatePhysics(dt);
		}

		// Check player fall death
		if (this.playerKnight.y > this.height + 100) {
			this.gameOver();
			return;
		}

		// Update ally physics
		for (let i = this.allyKnights.length - 1; i >= 0; i--) {
			const ally = this.allyKnights[i];

			// Rapier handles gravity for allies too - no manual application needed

			// Check if ally fell off
			if (
				ally.y > this.height + 100 ||
				ally.x < this.groundBreakX - 100
			) {
				// Clean up Rapier body
				if (this.rapierPhysics?.isInitialized()) {
					this.rapierPhysics.removeCharacterBody(ally.eid);
				}
				this.aiSystem.unregisterKnight(ally);
				ally.destroy();
				this.allyKnights.splice(i, 1);
			}
		}
	}

	private processKnightCommands(time: number, dt: number) {
		// Update AI navigation with current ground state
		this.aiSystem.updateGroundState(this.groundY, this.groundBreakX);

		// Process player commands
		const commands = this.inputSystem.getCommands();
		this.playerKnight.processCommands(commands, dt);

		// Process ally commands
		for (const ally of this.allyKnights) {
			const aiCommands = this.aiSystem.getCommands(
				ally,
				this.playerKnight,
				time,
			);

			// Handle AI grapple command
			if (
				aiCommands.grapple &&
				aiCommands.grappleTarget &&
				!ally.grapple.active
			) {
				const target = aiCommands.grappleTarget;
				ally.startGrapple(target.x, target.y, target.platformEid);
			}

			ally.processCommands(aiCommands, dt);
		}
	}

	private updateKnightAnimations() {
		this.playerKnight.updateAnimation();

		for (const ally of this.allyKnights) {
			ally.updateAnimation();
		}
	}

	private updateGrappleLine() {
		if (this.playerKnight.grapple.active) {
			this.grappleLine.setTo(
				this.playerKnight.grapple.targetX,
				this.playerKnight.grapple.targetY,
				this.playerKnight.x,
				this.playerKnight.y,
			);
		}
	}

	private updateGrappleAnchor() {
		if (
			!this.playerKnight.grapple.active ||
			this.playerKnight.grapple.targetPlatformEid === null
		)
			return;

		const platforms = getPlatforms(this.world);
		if (!platforms.includes(this.playerKnight.grapple.targetPlatformEid)) {
			this.releaseGrapple();
		}
	}

	private updateScore(delta: number) {
		this.score += delta * 0.01;
		this.scoreText.setText(`Score: ${Math.floor(this.score)}`);
	}

	private updateGround(dt: number) {
		const breakSpeed = GAME_CONFIG.platformSpeed;
		this.groundBreakX += breakSpeed * dt;

		// Update Rapier ground break point
		if (this.rapierPhysics?.isInitialized()) {
			this.rapierPhysics.updateGroundBreak(this.groundBreakX);
		}

		const { Position, Platform } = getComponents(this.world);
		const playerX = Position.x[this.playerKnight.eid];

		// Find rightmost ground tile
		let rightmostX = this.groundBreakX;
		for (const [eid] of this.groundTileSprites) {
			const tileX = Position.x[eid];
			if (tileX > rightmostX) rightmostX = tileX;
		}

		// Spawn new ground tiles ahead
		const spawnAheadDistance = this.width + 400;
		while (rightmostX < playerX + spawnAheadDistance) {
			rightmostX += GROUND_TILE_WIDTH;
			this.spawnGroundTileAt(rightmostX);
		}

		// Remove ground tiles that have fallen behind the break point
		const toRemove: number[] = [];
		for (const [eid, sprite] of this.groundTileSprites) {
			const tileX = Position.x[eid];
			const tileW = Platform.width[eid];

			if (tileX + tileW / 2 < this.groundBreakX) {
				// Create breaking animation
				const breakingTile = this.add.rectangle(
					sprite.x,
					sprite.y,
					GROUND_TILE_WIDTH - 2,
					GROUND_TILE_HEIGHT,
					COLORS.ground,
				);

				this.tweens.add({
					targets: breakingTile,
					y: breakingTile.y + 150,
					x: breakingTile.x - 30,
					angle: -45,
					alpha: 0,
					scaleX: 0.5,
					scaleY: 0.5,
					duration: 400,
					ease: 'Quad.easeIn',
					onComplete: () => breakingTile.destroy(),
				});

				sprite.destroy();
				toRemove.push(eid);
			}
		}

		// Remove from map and destroy entities
		for (const eid of toRemove) {
			this.groundTileSprites.delete(eid);
			destroyEntity(this.world, eid);
		}
	}

	private updatePlatforms(_dt: number) {
		const { Position, Platform } = getComponents(this.world);
		const platforms = getPlatforms(this.world);
		const playerX = this.playerKnight.x;

		const spawnAheadDistance = this.width + 300;
		while (this.worldExtentX < playerX + spawnAheadDistance) {
			this.worldExtentX += Phaser.Math.Between(150, 300);
			this.spawnPlatformAt(this.worldExtentX);
		}

		for (const eid of platforms) {
			const platX = Position.x[eid];
			const platWidth = Platform.width[eid];

			if (platX + platWidth / 2 < this.groundBreakX) {
				if (
					this.playerKnight.grapple.active &&
					this.playerKnight.grapple.targetPlatformEid === eid
				) {
					this.releaseGrapple();
				}

				const sprite = this.platformSprites.get(eid);
				if (sprite) {
					const breakingPlatform = this.add.rectangle(
						sprite.x,
						sprite.y,
						platWidth,
						24,
						COLORS.platform,
					);

					this.tweens.add({
						targets: breakingPlatform,
						y: breakingPlatform.y + 150,
						x: breakingPlatform.x - 30,
						angle: -30,
						alpha: 0,
						scaleX: 0.5,
						scaleY: 0.5,
						duration: 400,
						ease: 'Quad.easeIn',
						onComplete: () => breakingPlatform.destroy(),
					});

					sprite.destroy();
					this.platformSprites.delete(eid);
				}
				destroyEntity(this.world, eid);
			}
		}
	}

	private updateEnemies(dt: number) {
		const { Position, Velocity, Enemy, Platform } = getComponents(
			this.world,
		);
		const enemies = getEnemies(this.world);
		const platforms = getPlatforms(this.world);

		for (const eid of enemies) {
			// Move enemy
			Position.x[eid] += Velocity.x[eid] * dt;

			// Get enemy size based on type
			const enemyType = Enemy.type[eid];
			const enemySize = enemyType === EnemyType.FLYER ? 28 : 35;
			const halfSize = enemySize / 2;

			// Enemy bounds
			const enemyLeft = Position.x[eid] - halfSize;
			const enemyRight = Position.x[eid] + halfSize;
			const enemyTop = Position.y[eid] - halfSize;
			const enemyBottom = Position.y[eid] + halfSize;

			// Check collision with platforms (not ground tiles - enemies can walk on ground)
			for (const platEid of platforms) {
				const isGround = Platform.isGround[platEid] === 1;
				if (isGround) continue; // Skip ground tiles

				const platX = Position.x[platEid];
				const platY = Position.y[platEid];
				const platW = Platform.width[platEid];
				const platH = Platform.height[platEid];

				const surfaceLeft = platX - platW / 2;
				const surfaceRight = platX + platW / 2;
				const surfaceTop = platY - platH / 2;
				const surfaceBottom = platY + platH / 2;

				// Check AABB overlap
				const horizontalOverlap =
					enemyRight > surfaceLeft && enemyLeft < surfaceRight;
				const verticalOverlap =
					enemyBottom > surfaceTop && enemyTop < surfaceBottom;

				if (horizontalOverlap && verticalOverlap) {
					// Calculate penetration depths
					const overlapLeft = enemyRight - surfaceLeft;
					const overlapRight = surfaceRight - enemyLeft;

					// Resolve horizontal collision (enemies move left, so they hit right side of platforms)
					if (overlapLeft < overlapRight && Velocity.x[eid] < 0) {
						// Enemy hit the right side of platform - push it back
						Position.x[eid] = surfaceRight + halfSize + 1;
					} else if (
						overlapRight < overlapLeft &&
						Velocity.x[eid] > 0
					) {
						// Enemy hit the left side of platform - push it back
						Position.x[eid] = surfaceLeft - halfSize - 1;
					}
				}
			}

			// Remove enemies that go off-screen
			if (Position.x[eid] < this.groundBreakX - 50) {
				const sprite = this.enemySprites.get(eid);
				if (sprite) {
					sprite.destroy();
					this.enemySprites.delete(eid);
				}
				destroyEntity(this.world, eid);
			}
		}
	}

	private syncVisuals() {
		// Sync player knight
		this.playerKnight.syncVisuals();

		// Sync ally knights
		for (const ally of this.allyKnights) {
			ally.syncVisuals();
		}

		// Sync platform sprites
		const { Position } = getComponents(this.world);
		const platforms = getPlatforms(this.world);
		for (const eid of platforms) {
			const sprite = this.platformSprites.get(eid);
			if (sprite) {
				sprite.setPosition(Position.x[eid], Position.y[eid]);
			}
		}

		// Sync enemy sprites
		const enemies = getEnemies(this.world);
		for (const eid of enemies) {
			const sprite = this.enemySprites.get(eid);
			if (sprite) {
				sprite.setPosition(Position.x[eid], Position.y[eid]);
			}
		}
	}

	// ============================================================================
	// Collisions
	// ============================================================================

	private checkCollisions() {
		// Sync platforms to Rapier physics
		if (this.rapierPhysics?.isInitialized()) {
			this.rapierPhysics.syncPlatformsFromECS();

			// Update colliders for all knights to match their current hitbox
			this.updateKnightCollider(this.playerKnight);
			for (const ally of this.allyKnights) {
				this.updateKnightCollider(ally);
			}
		}

		// All knights use Rapier for collisions
		if (!this.playerKnight.grapple.active) {
			this.checkKnightCollisionsRapier(this.playerKnight);
		}
		this.checkKnightEnemyCollisions(this.playerKnight);

		for (const ally of this.allyKnights) {
			this.checkKnightCollisionsRapier(ally);
			this.checkKnightEnemyCollisions(ally);
		}
	}

	/**
	 * Ensure knight has a Rapier body and update its collider size
	 */
	private updateKnightCollider(knight: Knight): void {
		if (!this.rapierPhysics?.isInitialized()) return;

		const hitbox = knight.currentHitbox;
		const hitboxYOffset = knight.hitboxYOffset;

		// Create body if it doesn't exist yet (for allies spawned after init)
		if (!this.rapierPhysics.hasCharacterBody(knight.eid)) {
			this.rapierPhysics.createCharacterBody(
				knight.eid,
				knight.x,
				knight.y + hitboxYOffset,
				hitbox.width,
				hitbox.height,
			);
		} else {
			// Update existing collider size
			this.rapierPhysics.updateCharacterCollider(
				knight.eid,
				hitbox.width,
				hitbox.height,
			);
		}
	}

	// Rapier-based collision for any knight entity
	// Rapier is source of truth - we read positions FROM it
	private checkKnightCollisionsRapier(knight: Knight) {
		if (!this.rapierPhysics?.isInitialized()) {
			return;
		}

		const hitboxYOffset = knight.hitboxYOffset;

		// ========================================================================
		// WALL HANGING - Completely bypass Rapier physics
		// ========================================================================
		// When wall hanging, we freeze the character in Rapier and control position manually.
		// This prevents any jitter from physics calculations.
		if (knight.isWallHanging) {
			// Keep the knight frozen at the hang position
			const ledgeY = knight.hangSurfaceY;
			const hitbox = knight.currentHitbox;
			const halfHeight = hitbox.height / 2;

			// Offset to position sprite so hands visually touch the ledge
			// Hands are above hitbox top, so we move hitbox DOWN from ledge
			// This makes the sprite appear to grab the edge properly
			const handsOffset = 10; // Pixels above hitbox top where hands appear
			const hangY = ledgeY + halfHeight + handsOffset; // Rapier body center Y

			// Freeze character in Rapier (sets position, zeroes velocity, disables gravity)
			this.rapierPhysics.freezeCharacter(knight.eid, knight.x, hangY);

			// Knight sprite position
			knight.y = ledgeY + halfHeight + handsOffset - hitboxYOffset;
			knight.vx = 0;
			knight.vy = 0;

			// Just return - state changes are handled in Knight.processCommands
			return;
		}

		// ========================================================================
		// CHECK IF WE JUST EXITED WALL HANG
		// ========================================================================
		// If knight was hanging but just exited (via drop or climb), we need to
		// transfer the knight's intended velocity to Rapier before running physics.
		// This is detected by checking if knight has non-zero velocity but Rapier is frozen.
		const rapierVel = this.rapierPhysics.getCharacterVelocity(knight.eid);
		if (
			rapierVel &&
			Math.abs(rapierVel.x) < 1 &&
			Math.abs(rapierVel.y) < 1
		) {
			// Rapier has near-zero velocity - if knight has velocity, transfer it
			if (Math.abs(knight.vx) > 1 || Math.abs(knight.vy) > 1) {
				// Unfreeze and transfer knight's velocity to Rapier
				this.rapierPhysics.unfreezeCharacter(
					knight.eid,
					knight.vx,
					knight.vy,
				);
			}
		}

		// ========================================================================
		// NORMAL PHYSICS - Let Rapier handle movement
		// ========================================================================

		// Determine if knight wants to jump
		// knight.vy < 0 indicates jump intent was set in processCommands
		const wantsToJump = knight.vy < -100;
		const jumpImpulse = wantsToJump
			? Math.abs(knight.vy)
			: GAME_CONFIG.jumpForce;

		// Apply movement to Rapier - it handles physics
		// Pass horizontal velocity (from input) and jump intent
		const result = this.rapierPhysics.applyCharacterMovement(
			knight.eid,
			knight.vx, // Horizontal velocity from input
			wantsToJump, // Jump intent
			jumpImpulse, // Jump force
		);

		// Update knight state based on collision result
		const collision = result.collision;

		// Determine if we should START wall hanging THIS frame
		const shouldStartHanging =
			!collision.isGrounded &&
			(collision.hitWallLeft || collision.hitWallRight) &&
			collision.canLedgeGrab &&
			!knight.isRecentlyClimbed() &&
			!knight.isRecentlyDropped();

		if (shouldStartHanging && collision.ledgeY !== null) {
			// Store ledge Y and calculate snap position
			knight.hangSurfaceY = collision.ledgeY;
			const hitbox = knight.currentHitbox;
			const halfHeight = hitbox.height / 2;

			// Offset to position sprite so hands visually touch the ledge
			const handsOffset = 10; // Pixels above hitbox top where hands appear
			const snapY =
				collision.ledgeY + halfHeight + handsOffset - hitboxYOffset;

			// Snap knight position
			knight.x = result.x;
			knight.y = snapY;
			knight.vx = 0;
			knight.vy = 0;

			// Freeze in Rapier
			this.rapierPhysics.freezeCharacter(
				knight.eid,
				knight.x,
				collision.ledgeY + halfHeight + handsOffset,
			);
		} else {
			// Normal physics - read position from Rapier
			knight.x = result.x;
			knight.y = result.y - hitboxYOffset;

			// Read velocity FROM Rapier and sync to knight
			const vel = this.rapierPhysics.getCharacterVelocity(knight.eid);
			if (vel) {
				knight.vx = vel.x;
				knight.vy = vel.y;
			}
		}

		if (collision.isGrounded) {
			knight.setState(KnightState.GROUNDED);
			knight.clearState(KnightState.WALL_SLIDING);
			knight.clearState(KnightState.WALL_HANGING);
			knight.clearState(KnightState.WALL_LEFT);

			// When grounded, apply friction to horizontal velocity
			if (Math.abs(knight.vx) < 10) {
				knight.vx = 0;
			}
		} else {
			knight.clearState(KnightState.GROUNDED);
		}

		// Handle wall collisions - distinguish between ledge grab and wall slide
		if (collision.hitWallLeft || collision.hitWallRight) {
			// Set wall side flag
			if (collision.hitWallLeft) {
				knight.setState(KnightState.WALL_LEFT);
				if (knight.vx < 0) knight.vx = 0;
			} else {
				knight.clearState(KnightState.WALL_LEFT);
				if (knight.vx > 0) knight.vx = 0;
			}

			// Only apply wall states when airborne
			if (!collision.isGrounded) {
				// Check if this is a ledge grab or wall slide
				if (shouldStartHanging) {
					// Ledge grab - character can hang and climb up
					knight.setState(KnightState.WALL_HANGING);
					knight.clearState(KnightState.WALL_SLIDING);
					// Position and Rapier freeze already handled above
				} else if (!collision.canLedgeGrab) {
					// Solid wall - wall slide
					knight.setState(KnightState.WALL_SLIDING);
					knight.clearState(KnightState.WALL_HANGING);

					// Unfreeze if we were hanging
					if (this.rapierPhysics?.isInitialized()) {
						this.rapierPhysics.unfreezeCharacter(knight.eid);
					}
				}
			} else {
				// Grounded - make sure character is unfrozen
				if (this.rapierPhysics?.isInitialized()) {
					this.rapierPhysics.unfreezeCharacter(knight.eid);
				}
			}
		} else {
			// No wall contact - clear all wall states
			const wasHanging = knight.isWallHanging;
			knight.clearState(KnightState.WALL_SLIDING);
			knight.clearState(KnightState.WALL_HANGING);
			knight.clearState(KnightState.WALL_LEFT);

			// Unfreeze if we were hanging
			if (wasHanging && this.rapierPhysics?.isInitialized()) {
				this.rapierPhysics.unfreezeCharacter(knight.eid);
			}
		}

		// Handle ceiling collision - Rapier handles the actual collision,
		// we just clear jump intent
		if (collision.hitCeiling) {
			// Knight hit ceiling, velocity already handled by Rapier
		}
	}

	// Debug drawing for collision visualization (simplified - Rapier has its own debug renderer)
	private drawDebugCollisions() {
		if (!this.debugEnabled) return;

		this.debugGraphics.clear();

		const knight = this.playerKnight;
		const hitbox = knight.currentHitbox;
		const hitboxYOffset = knight.hitboxYOffset;
		const collisionY = knight.y + hitboxYOffset;
		const knightFeet = collisionY + hitbox.height / 2;

		// Draw knight hitbox (green)
		this.debugGraphics.lineStyle(2, 0x00ff00, 1);
		this.debugGraphics.strokeRect(
			knight.x - hitbox.width / 2,
			collisionY - hitbox.height / 2,
			hitbox.width,
			hitbox.height,
		);

		// Draw knight feet line (yellow)
		this.debugGraphics.lineStyle(2, 0xffff00, 1);
		this.debugGraphics.lineBetween(
			knight.x - 30,
			knightFeet,
			knight.x + 30,
			knightFeet,
		);

		// Draw velocity arrow (white for vertical, blue for horizontal)
		if (Math.abs(knight.vy) > 1) {
			this.debugGraphics.lineStyle(2, 0xffffff, 1);
			const arrowLength = Math.min(Math.abs(knight.vy) * 0.3, 80);
			const arrowY = knight.vy > 0 ? arrowLength : -arrowLength;
			this.debugGraphics.lineBetween(
				knight.x,
				knight.y,
				knight.x,
				knight.y + arrowY,
			);
		}
		if (Math.abs(knight.vx) > 1) {
			this.debugGraphics.lineStyle(2, 0x0088ff, 1);
			const arrowLength = Math.min(Math.abs(knight.vx) * 0.3, 80);
			const arrowX = knight.vx > 0 ? arrowLength : -arrowLength;
			this.debugGraphics.lineBetween(
				knight.x,
				knight.y,
				knight.x + arrowX,
				knight.y,
			);
		}

		// Draw grounded indicator
		if (knight.isGrounded) {
			this.debugGraphics.lineStyle(3, 0x00ff00, 1);
			this.debugGraphics.strokeCircle(
				knight.x,
				knight.y - hitbox.height / 2 - 10,
				5,
			);
		}
	}

	private checkKnightEnemyCollisions(knight: Knight) {
		const { Position } = getComponents(this.world);
		const enemies = getEnemies(this.world);
		const hitbox = knight.currentHitbox;
		const hitboxYOffset = knight.hitboxYOffset;
		const collisionY = knight.y + hitboxYOffset;

		for (const enemyEid of enemies) {
			const ex = Position.x[enemyEid];
			const ey = Position.y[enemyEid];
			const enemySize = 35;

			// Check sword hitbox first if attacking
			if (knight.isAttacking) {
				const swordHit = this.checkSwordHit(knight, ex, ey, enemySize);
				if (swordHit) {
					const sprite = this.enemySprites.get(enemyEid);
					if (sprite) {
						sprite.destroy();
						this.enemySprites.delete(enemyEid);
					}
					destroyEntity(this.world, enemyEid);
					this.score += 50; // Bonus for killing enemy
					continue; // Enemy destroyed, check next
				}
			}

			// Check body collision (knight takes damage)
			const bodyCollides =
				knight.x + hitbox.width / 2 > ex - enemySize / 2 &&
				knight.x - hitbox.width / 2 < ex + enemySize / 2 &&
				collisionY + hitbox.height / 2 > ey - enemySize / 2 &&
				collisionY - hitbox.height / 2 < ey + enemySize / 2;

			if (bodyCollides) {
				if (knight.isPlayer) {
					// Player takes damage
					this.gameOver();
					return;
				} else {
					// Ally takes damage - remove ally
					knight.die();
				}
			}
		}
	}

	private checkSwordHit(
		knight: Knight,
		enemyX: number,
		enemyY: number,
		enemySize: number,
	): boolean {
		// Sword hitbox extends in the direction the knight is facing
		const direction = knight.facingRight ? 1 : -1;
		const swordCenterX =
			knight.x +
			(KNIGHT_SWORD_HITBOX.offsetX + KNIGHT_SWORD_HITBOX.width / 2) *
				direction;
		const swordCenterY = knight.y + KNIGHT_SWORD_HITBOX.offsetY;

		// Check if enemy overlaps with sword hitbox
		const swordLeft = swordCenterX - KNIGHT_SWORD_HITBOX.width / 2;
		const swordRight = swordCenterX + KNIGHT_SWORD_HITBOX.width / 2;
		const swordTop = swordCenterY - KNIGHT_SWORD_HITBOX.height / 2;
		const swordBottom = swordCenterY + KNIGHT_SWORD_HITBOX.height / 2;

		const enemyLeft = enemyX - enemySize / 2;
		const enemyRight = enemyX + enemySize / 2;
		const enemyTop = enemyY - enemySize / 2;
		const enemyBottom = enemyY + enemySize / 2;

		return (
			swordRight > enemyLeft &&
			swordLeft < enemyRight &&
			swordBottom > enemyTop &&
			swordTop < enemyBottom
		);
	}

	// ============================================================================
	// Game Over / Restart
	// ============================================================================

	private gameOver() {
		this.isGameOver = true;
		if (this.enemySpawnTimer) this.enemySpawnTimer.destroy();
		if (this.allySpawnTimer) this.allySpawnTimer.destroy();
		this.releaseGrapple();
		this.playerKnight.die();

		const centerX = this.width / 2;
		const centerY = this.height / 2;

		this.time.delayedCall(500, () => {
			this.add
				.text(centerX, centerY, 'GAME OVER', {
					fontSize: '56px',
					color: COLORS.gameOverText,
					fontStyle: 'bold',
				})
				.setOrigin(0.5)
				.setScrollFactor(0)
				.setDepth(100);

			this.add
				.text(
					centerX,
					centerY + 60,
					`Final Score: ${Math.floor(this.score)}`,
					{
						fontSize: '28px',
						color: COLORS.scoreText,
					},
				)
				.setOrigin(0.5)
				.setScrollFactor(0)
				.setDepth(100);

			this.add
				.text(centerX, centerY + 110, 'Tap or Press SPACE to Restart', {
					fontSize: '20px',
					color: COLORS.scoreText,
				})
				.setOrigin(0.5)
				.setScrollFactor(0)
				.setDepth(100);
		});
	}

	private restartGame() {
		// Cleanup
		this.inputSystem.destroy();
		this.aiSystem.destroy();

		// Cleanup Rapier physics
		if (this.rapierPhysics) {
			this.rapierPhysics.destroy();
		}

		for (const ally of this.allyKnights) {
			ally.destroy();
		}

		// Reset state
		this.score = 0;
		this.isGameOver = false;
		this.groundBreakX = 0;
		this.worldExtentX = 0;

		this.scene.restart();
	}
}
