import * as THREE from 'three';

export interface MotorConfig {
	walkSpeed: number;
	runSpeed: number;
	accel: number;
	turnLerp: number;
	gravity: number;
	jumpSpeed: number;
}

export const DEFAULT_MOTOR: MotorConfig = {
	walkSpeed: 1.8,
	runSpeed: 4.5,
	accel: 12,
	turnLerp: 10,
	gravity: 22,
	jumpSpeed: 6,
};

export type Gait = 'idle' | 'walk' | 'run';

/**
 * Authoritative planar movement. Game code sets a desired velocity; the motor
 * integrates position, faces travel direction, and reports the gait + a
 * walk↔run blend factor for the animator to visualize. Movement drives
 * animation, never the reverse.
 */
export class CharacterMotor {
	readonly position = new THREE.Vector3();
	readonly velocity = new THREE.Vector3();
	yaw = 0;
	/** Combat stance: when set, facing tracks this yaw instead of travel direction. */
	yawLock: number | null = null;
	vy = 0;
	grounded = true;
	/** Optional collision resolver; mutates pos by (dx,dz) honoring walls. */
	mover: ((pos: THREE.Vector3, dx: number, dz: number) => void) | null = null;
	private readonly desired = new THREE.Vector3();

	constructor(private cfg: MotorConfig = DEFAULT_MOTOR) {}

	/** Launch upward if standing on the ground; no double-jump. */
	jump(): void {
		if (!this.grounded) return;
		this.vy = this.cfg.jumpSpeed;
		this.grounded = false;
	}

	get airborne(): boolean {
		return !this.grounded;
	}

	setDesiredVelocity(x: number, z: number): void {
		this.desired.set(x, 0, z);
	}

	get speed(): number {
		return this.velocity.length();
	}

	get gait(): Gait {
		const s = this.speed;
		if (s < 0.1) return 'idle';
		return s < (this.cfg.walkSpeed + this.cfg.runSpeed) * 0.5
			? 'walk'
			: 'run';
	}

	/** 0 at walk speed, 1 at run speed — for animator.blend('Walk','Jog', x). */
	get runBlend(): number {
		return THREE.MathUtils.clamp(
			(this.speed - this.cfg.walkSpeed) /
				Math.max(0.01, this.cfg.runSpeed - this.cfg.walkSpeed),
			0,
			1,
		);
	}

	update(dt: number): void {
		const k = 1 - Math.exp(-this.cfg.accel * dt);
		this.velocity.lerp(this.desired, k);
		const dx = this.velocity.x * dt;
		const dz = this.velocity.z * dt;
		if (this.mover) this.mover(this.position, dx, dz);
		else {
			this.position.x += dx;
			this.position.z += dz;
		}
		if (this.yawLock !== null) {
			const tk = 1 - Math.exp(-this.cfg.turnLerp * dt);
			this.yaw = lerpAngle(this.yaw, this.yawLock, tk);
		} else if (this.speed > 0.15) {
			const targetYaw = Math.atan2(this.velocity.x, this.velocity.z);
			const tk = 1 - Math.exp(-this.cfg.turnLerp * dt);
			this.yaw = lerpAngle(this.yaw, targetYaw, tk);
		}
		if (!this.grounded || this.vy !== 0) {
			this.vy -= this.cfg.gravity * dt;
			this.position.y += this.vy * dt;
			if (this.position.y <= 0) {
				this.position.y = 0;
				this.vy = 0;
				this.grounded = true;
			}
		}
	}
}

function lerpAngle(a: number, b: number, t: number): number {
	let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
	if (d < -Math.PI) d += Math.PI * 2;
	return a + d * t;
}
