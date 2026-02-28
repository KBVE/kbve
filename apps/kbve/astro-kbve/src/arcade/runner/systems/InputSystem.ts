import Phaser from 'phaser';
import { type KnightCommands, emptyCommands } from '../entities/Knight';

// ============================================================================
// Input System - Handles player input
// ============================================================================

export class InputSystem {
	private scene: Phaser.Scene;
	private cursors: Phaser.Types.Input.Keyboard.CursorKeys | null = null;
	private wasd: {
		W: Phaser.Input.Keyboard.Key;
		A: Phaser.Input.Keyboard.Key;
		S: Phaser.Input.Keyboard.Key;
		D: Phaser.Input.Keyboard.Key;
	} | null = null;
	private spaceKey: Phaser.Input.Keyboard.Key | null = null;
	private ctrlLeftKey: Phaser.Input.Keyboard.Key | null = null;
	private ctrlRightKey: Phaser.Input.Keyboard.Key | null = null;

	// Track previous key states for manual edge detection
	private prevSpaceDown: boolean = false;
	private prevUpDown: boolean = false;
	private prevWDown: boolean = false;
	private prevCtrlDown: boolean = false;

	// Pointer state for grapple
	private pointerDown: boolean = false;
	private pointerX: number = 0;
	private pointerY: number = 0;

	// Callbacks
	private onGrappleRelease: (() => void) | null = null;
	private onRestartAttempt: (() => void) | null = null;

	constructor(scene: Phaser.Scene) {
		this.scene = scene;
	}

	// ============================================================================
	// Setup
	// ============================================================================

	setup(): void {
		const keyboard = this.scene.input.keyboard;
		if (keyboard) {
			this.cursors = keyboard.createCursorKeys();
			this.wasd = {
				W: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
				A: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
				S: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
				D: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
			};
			this.spaceKey = keyboard.addKey(
				Phaser.Input.Keyboard.KeyCodes.SPACE,
			);
			this.ctrlLeftKey = keyboard.addKey(
				Phaser.Input.Keyboard.KeyCodes.CTRL,
			);
			this.ctrlRightKey = keyboard.addKey(
				Phaser.Input.Keyboard.KeyCodes.CTRL,
			);
		}

		// Pointer events
		this.scene.input.on('pointerdown', this.handlePointerDown, this);
		this.scene.input.on('pointerup', this.handlePointerUp, this);

		// Canvas setup for focus
		const canvas = this.scene.game.canvas;
		canvas.setAttribute('tabindex', '0');
		canvas.focus();

		// Touch events
		canvas.addEventListener(
			'touchstart',
			this.handleTouchStart.bind(this),
			{ passive: false },
		);
		canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), {
			passive: false,
		});
	}

	// ============================================================================
	// Callbacks
	// ============================================================================

	setGrappleCallback(onRelease: () => void): void {
		this.onGrappleRelease = onRelease;
	}

	setRestartCallback(onRestart: () => void): void {
		this.onRestartAttempt = onRestart;
	}

	// ============================================================================
	// Pointer Handlers
	// ============================================================================

	private handlePointerDown(pointer: Phaser.Input.Pointer): void {
		this.pointerDown = true;
		this.pointerX = pointer.worldX ?? pointer.x;
		this.pointerY = pointer.worldY ?? pointer.y;
	}

	private handlePointerUp(): void {
		this.pointerDown = false;
		if (this.onGrappleRelease) {
			this.onGrappleRelease();
		}
	}

	private handleTouchStart(e: TouchEvent): void {
		e.preventDefault();
		if (e.touches.length > 0) {
			const touch = e.touches[0];
			const canvas = this.scene.game.canvas;
			const rect = canvas.getBoundingClientRect();
			const scaleX = this.scene.scale.width / rect.width;
			const scaleY = this.scene.scale.height / rect.height;

			this.pointerDown = true;
			this.pointerX = (touch.clientX - rect.left) * scaleX;
			this.pointerY = (touch.clientY - rect.top) * scaleY;
		}
	}

	private handleTouchEnd(e: TouchEvent): void {
		e.preventDefault();
		this.pointerDown = false;
		if (this.onGrappleRelease) {
			this.onGrappleRelease();
		}
	}

	// ============================================================================
	// Command Generation
	// ============================================================================

	getCommands(): KnightCommands {
		const commands: KnightCommands = { ...emptyCommands };

		// Continuous actions - check isDown state
		commands.moveLeft =
			this.cursors?.left?.isDown || this.wasd?.A?.isDown || false;
		commands.moveRight =
			this.cursors?.right?.isDown || this.wasd?.D?.isDown || false;
		commands.crouch =
			this.cursors?.down?.isDown || this.wasd?.S?.isDown || false;

		// Get current key states
		const spaceDown = this.spaceKey?.isDown || false;
		const upDown = this.cursors?.up?.isDown || false;
		const wDown = this.wasd?.W?.isDown || false;
		const ctrlDown =
			this.ctrlLeftKey?.isDown || this.ctrlRightKey?.isDown || false;

		// Continuous up/W detection (for wall climb)
		commands.holdingUp = upDown || wDown;

		// Manual edge detection: trigger on transition from not-pressed to pressed
		commands.attack = spaceDown && !this.prevSpaceDown;
		commands.jump =
			(upDown && !this.prevUpDown) || (wDown && !this.prevWDown);
		commands.roll = ctrlDown && !this.prevCtrlDown;

		// Update previous states for next frame
		this.prevSpaceDown = spaceDown;
		this.prevUpDown = upDown;
		this.prevWDown = wDown;
		this.prevCtrlDown = ctrlDown;

		return commands;
	}

	// ============================================================================
	// Pointer Queries
	// ============================================================================

	isPointerDown(): boolean {
		return this.pointerDown;
	}

	getPointerPosition(): { x: number; y: number } {
		return { x: this.pointerX, y: this.pointerY };
	}

	// ============================================================================
	// Game Over State Handling
	// ============================================================================

	processGameOverInput(): boolean {
		const spaceDown = this.spaceKey?.isDown || false;
		const spaceJustPressed = spaceDown && !this.prevSpaceDown;
		const pointerClicked = this.pointerDown;

		// Update previous state
		this.prevSpaceDown = spaceDown;

		if (spaceJustPressed || pointerClicked) {
			this.pointerDown = false;
			if (this.onRestartAttempt) {
				this.onRestartAttempt();
			}
			return true;
		}
		return false;
	}

	// ============================================================================
	// Cleanup
	// ============================================================================

	destroy(): void {
		this.scene.input.off('pointerdown', this.handlePointerDown, this);
		this.scene.input.off('pointerup', this.handlePointerUp, this);

		const canvas = this.scene.game.canvas;
		canvas.removeEventListener(
			'touchstart',
			this.handleTouchStart.bind(this),
		);
		canvas.removeEventListener('touchend', this.handleTouchEnd.bind(this));

		this.onGrappleRelease = null;
		this.onRestartAttempt = null;
	}
}
