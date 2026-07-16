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
export type MotorMode = 'ground' | 'swim' | 'climb';

export class CharacterMotor {
	readonly position = new THREE.Vector3();
	readonly velocity = new THREE.Vector3();
	yaw = 0;

	yawLock: number | null = null;
	vy = 0;
	grounded = true;
	mode: MotorMode = 'ground';
	swimY = 0;
	swimFloor = 0;
	swimPitch = 0;

	mover: ((pos: THREE.Vector3, dx: number, dz: number) => void) | null = null;
	floorAt: ((x: number, z: number) => number) | null = null;
	private readonly desired = new THREE.Vector3();

	constructor(private cfg: MotorConfig = DEFAULT_MOTOR) {}

	jump(): void {
		if (!this.grounded || this.mode !== 'ground') return;
		this.vy = this.cfg.jumpSpeed;
		this.grounded = false;
	}

	get airborne(): boolean {
		return !this.grounded;
	}

	setDesiredVelocity(x: number, z: number, y = 0): void {
		this.desired.set(x, y, z);
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

	get runBlend(): number {
		return THREE.MathUtils.clamp(
			(this.speed - this.cfg.walkSpeed) /
				Math.max(0.01, this.cfg.runSpeed - this.cfg.walkSpeed),
			0,
			1,
		);
	}

	update(dt: number): void {
		if (this.mode === 'climb') return;
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
		if (this.mode === 'swim') {
			this.vy = 0;
			this.grounded = false;
			if (Math.abs(this.velocity.y) > 0.05) {
				this.position.y += this.velocity.y * dt;
			} else if (this.position.y < this.swimY) {
				const sk = 1 - Math.exp(-1.6 * dt);
				this.position.y += (this.swimY - this.position.y) * sk;
			} else {
				const sk = 1 - Math.exp(-8 * dt);
				this.position.y += (this.swimY - this.position.y) * sk;
			}
			this.position.y = THREE.MathUtils.clamp(
				this.position.y,
				this.swimFloor,
				this.swimY,
			);
			return;
		}
		const floorY = this.floorAt
			? this.floorAt(this.position.x, this.position.z)
			: 0;
		if (this.grounded && this.position.y > floorY + 1e-3)
			this.grounded = false;
		if (!this.grounded || this.vy !== 0) {
			this.vy -= this.cfg.gravity * dt;
			this.position.y += this.vy * dt;
			if (this.position.y <= floorY) {
				this.position.y = floorY;
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
