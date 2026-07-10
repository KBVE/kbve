import * as THREE from 'three';

/**
 * Procedural bone overrides applied AFTER mixer.update each frame. Ordering is
 * the contract: base clip → these overrides. Calling mixer.update afterward
 * would overwrite them.
 */
export class ProceduralPose {
	private head: THREE.Bone | null;
	private target = new THREE.Vector3();
	private active = false;
	private weight = 0;
	private readonly desired = new THREE.Quaternion();
	private readonly local = new THREE.Quaternion();
	private readonly parentInv = new THREE.Quaternion();
	private readonly m = new THREE.Matrix4();
	private readonly up = new THREE.Vector3(0, 1, 0);
	private readonly headWorld = new THREE.Vector3();

	constructor(
		root: THREE.Object3D,
		headBone = 'head',
		private maxWeight = 0.6,
		private lerp = 8,
	) {
		this.head = (root.getObjectByName(headBone) as THREE.Bone) ?? null;
	}

	lookAt(worldTarget: THREE.Vector3 | null): void {
		if (worldTarget) {
			this.target.copy(worldTarget);
			this.active = true;
		} else {
			this.active = false;
		}
	}

	update(dt: number): void {
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
		this.m.lookAt(this.headWorld, this.target, this.up);
		this.desired.setFromRotationMatrix(this.m);
		this.head.parent.getWorldQuaternion(this.parentInv).invert();
		this.local.copy(this.parentInv).multiply(this.desired);
		this.head.quaternion.slerp(this.local, this.weight);
	}
}
