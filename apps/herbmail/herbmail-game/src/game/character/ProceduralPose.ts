import * as THREE from 'three';

const IDENTITY = new THREE.Quaternion();

export class ProceduralPose {
	private head: THREE.Bone | null;
	private bindLocal = new THREE.Quaternion();
	private target = new THREE.Vector3();
	private active = false;
	private weight = 0;
	private readonly delta = new THREE.Quaternion();
	private readonly clampedDelta = new THREE.Quaternion();
	private readonly desired = new THREE.Quaternion();
	private readonly local = new THREE.Quaternion();
	private readonly parentWorld = new THREE.Quaternion();
	private readonly parentInv = new THREE.Quaternion();
	private readonly dir = new THREE.Vector3();
	private readonly headWorld = new THREE.Vector3();

	constructor(
		root: THREE.Object3D,
		headBone = 'head',
		private maxWeight = 0.6,
		private lerp = 8,
		private maxAngle = (75 * Math.PI) / 180,
	) {
		this.head = (root.getObjectByName(headBone) as THREE.Bone) ?? null;
		if (this.head) this.bindLocal.copy(this.head.quaternion);
	}

	setStrength(w: number): void {
		this.maxWeight = w;
	}

	lookAt(worldTarget: THREE.Vector3 | null): void {
		if (worldTarget) {
			this.target.copy(worldTarget);
			this.active = true;
		} else {
			this.active = false;
		}
	}

	update(dt: number, bodyFwd: THREE.Vector3): void {
		if (!this.head?.parent) return;
		const targetWeight = this.active ? this.maxWeight : 0;
		this.weight = THREE.MathUtils.damp(
			this.weight,
			targetWeight,
			this.lerp,
			dt,
		);
		if (this.weight < 0.001) return;

		this.head.getWorldPosition(this.headWorld);
		this.dir.copy(this.target).sub(this.headWorld);

		if (this.dir.lengthSq() < 1e-6) return;
		this.dir.normalize();

		this.delta.setFromUnitVectors(bodyFwd, this.dir);

		this.clampedDelta
			.copy(IDENTITY)
			.rotateTowards(this.delta, this.maxAngle);

		this.head.parent.getWorldQuaternion(this.parentWorld);
		this.desired
			.copy(this.clampedDelta)
			.multiply(this.parentWorld)
			.multiply(this.bindLocal);
		this.parentInv.copy(this.parentWorld).invert();
		this.local.copy(this.parentInv).multiply(this.desired);
		this.head.quaternion.slerp(this.local, this.weight);
	}
}
