import * as THREE from 'three';

/**
 * Secondary motion for the helmet crest. A spring-damper drives the `plume`
 * bone from the head's world acceleration, so launching/landing a jump (or a
 * hard turn) makes the crest lag then bounce back. Applied AFTER mixer.update,
 * like ProceduralPose — the clips don't touch the plume bone.
 */
export class ProceduralPlume {
	private readonly plume: THREE.Object3D | null;
	private readonly driver: THREE.Object3D | null;
	private readonly rest = new THREE.Quaternion();
	private readonly prevPos = new THREE.Vector3();
	private readonly prevVel = new THREE.Vector3();
	private readonly pos = new THREE.Vector3();
	private readonly vel = new THREE.Vector3();
	private readonly acc = new THREE.Vector3();
	private readonly e = new THREE.Euler();
	private readonly q = new THREE.Quaternion();
	private started = false;
	private pitch = 0;
	private pitchV = 0;
	private roll = 0;
	private rollV = 0;

	constructor(
		root: THREE.Object3D,
		private stiffness = 130,
		private damping = 9,
		private gain = 0.14,
		private maxAngle = 0.7,
		private maxAccel = 120,
	) {
		this.plume = root.getObjectByName('plume') ?? null;
		this.driver =
			root.getObjectByName('headAttach') ??
			root.getObjectByName('head') ??
			null;
		if (this.plume) this.rest.copy(this.plume.quaternion);
	}

	update(dt: number): void {
		if (!this.plume || !this.driver || dt <= 0) return;
		this.driver.getWorldPosition(this.pos);
		if (!this.started) {
			this.prevPos.copy(this.pos);
			this.started = true;
			return;
		}
		this.vel.subVectors(this.pos, this.prevPos).divideScalar(dt);
		this.acc.subVectors(this.vel, this.prevVel).divideScalar(dt);
		this.prevPos.copy(this.pos);
		this.prevVel.copy(this.vel);

		const clamp = THREE.MathUtils.clamp;
		const ay = clamp(this.acc.y, -this.maxAccel, this.maxAccel);
		const ax = clamp(this.acc.x, -this.maxAccel, this.maxAccel);
		// Upward launch nods the crest back; lateral accel sways it.
		const driveP = -ay * this.gain;
		const driveR = -ax * this.gain;

		this.pitchV +=
			(-this.stiffness * this.pitch -
				this.damping * this.pitchV +
				driveP) *
			dt;
		this.pitch = clamp(
			this.pitch + this.pitchV * dt,
			-this.maxAngle,
			this.maxAngle,
		);
		this.rollV +=
			(-this.stiffness * this.roll - this.damping * this.rollV + driveR) *
			dt;
		this.roll = clamp(
			this.roll + this.rollV * dt,
			-this.maxAngle,
			this.maxAngle,
		);

		this.e.set(this.pitch, 0, this.roll);
		this.q.setFromEuler(this.e);
		this.plume.quaternion.copy(this.rest).multiply(this.q);
	}
}
