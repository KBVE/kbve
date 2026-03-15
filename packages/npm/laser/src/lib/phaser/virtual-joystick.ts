import Phaser from 'phaser';

export type GridDirection =
	| 'up'
	| 'down'
	| 'left'
	| 'right'
	| 'up-left'
	| 'up-right'
	| 'down-left'
	| 'down-right'
	| null;

export interface VirtualJoystickConfig {
	x?: number;
	y?: number;
	radius?: number;
	baseColor?: number;
	thumbColor?: number;
	baseAlpha?: number;
	thumbAlpha?: number;
	deadZone?: number;
	fixed?: boolean;
}

export class VirtualJoystick {
	private scene: Phaser.Scene;
	private base: Phaser.GameObjects.Arc;
	private thumb: Phaser.GameObjects.Arc;
	private radius: number;
	private deadZone: number;
	private _direction: GridDirection = null;
	private _isActive = false;
	private fixed: boolean;
	private activePointer: Phaser.Input.Pointer | null = null;

	constructor(scene: Phaser.Scene, config?: VirtualJoystickConfig) {
		this.scene = scene;
		this.radius = config?.radius ?? 60;
		this.deadZone = config?.deadZone ?? 0.25;
		this.fixed = config?.fixed ?? true;

		const x = config?.x ?? 120;
		const y = config?.y ?? scene.scale.height - 120;

		this.base = scene.add
			.circle(
				x,
				y,
				this.radius,
				config?.baseColor ?? 0x888888,
				config?.baseAlpha ?? 0.35,
			)
			.setDepth(100)
			.setScrollFactor(0);

		this.thumb = scene.add
			.circle(
				x,
				y,
				this.radius * 0.4,
				config?.thumbColor ?? 0xffffff,
				config?.thumbAlpha ?? 0.5,
			)
			.setDepth(101)
			.setScrollFactor(0);

		this.setupInput();
	}

	private setupInput(): void {
		this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
			if (this.activePointer) return;

			const dx = pointer.x - this.base.x;
			const dy = pointer.y - this.base.y;
			const dist = Math.sqrt(dx * dx + dy * dy);

			if (this.fixed && dist > this.radius * 2) return;

			if (!this.fixed) {
				this.base.setPosition(pointer.x, pointer.y);
				this.thumb.setPosition(pointer.x, pointer.y);
			}

			this.activePointer = pointer;
			this._isActive = true;
		});

		this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
			if (pointer !== this.activePointer) return;
			this.updateThumb(pointer.x, pointer.y);
		});

		this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
			if (pointer !== this.activePointer) return;
			this.resetThumb();
		});
	}

	private updateThumb(px: number, py: number): void {
		const dx = px - this.base.x;
		const dy = py - this.base.y;
		const dist = Math.sqrt(dx * dx + dy * dy);

		const clampedDist = Math.min(dist, this.radius);
		const angle = Math.atan2(dy, dx);

		this.thumb.setPosition(
			this.base.x + Math.cos(angle) * clampedDist,
			this.base.y + Math.sin(angle) * clampedDist,
		);

		const normalizedDist = clampedDist / this.radius;
		if (normalizedDist < this.deadZone) {
			this._direction = null;
			return;
		}

		this._direction = this.angleToDirection(angle);
	}

	private angleToDirection(angle: number): GridDirection {
		// Convert to degrees [0, 360)
		let deg = (angle * 180) / Math.PI;
		if (deg < 0) deg += 360;

		// 8-way direction mapping with 45-degree sectors
		if (deg >= 337.5 || deg < 22.5) return 'right';
		if (deg >= 22.5 && deg < 67.5) return 'down-right';
		if (deg >= 67.5 && deg < 112.5) return 'down';
		if (deg >= 112.5 && deg < 157.5) return 'down-left';
		if (deg >= 157.5 && deg < 202.5) return 'left';
		if (deg >= 202.5 && deg < 247.5) return 'up-left';
		if (deg >= 247.5 && deg < 292.5) return 'up';
		return 'up-right'; // 292.5 to 337.5
	}

	private resetThumb(): void {
		this.thumb.setPosition(this.base.x, this.base.y);
		this._direction = null;
		this._isActive = false;
		this.activePointer = null;
	}

	get direction(): GridDirection {
		return this._direction;
	}

	get isActive(): boolean {
		return this._isActive;
	}

	setVisible(visible: boolean): this {
		this.base.setVisible(visible);
		this.thumb.setVisible(visible);
		return this;
	}

	destroy(): void {
		this.base.destroy();
		this.thumb.destroy();
	}
}
