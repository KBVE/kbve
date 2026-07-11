import * as THREE from 'three';

export interface Leg {
	hip: THREE.Object3D;
	knee: THREE.Object3D;
	ankle: THREE.Object3D;
	toe: THREE.Object3D;
	/** Foot world orientation in the flat idle pose (captured at yaw 0). */
	flat: THREE.Quaternion | null;
}

export interface GroundOptions {
	floorY: number;
	ankleHeight: number;
	/** Ankle height (above floor) at/below which the foot is fully grounded. */
	blendFull: number;
	/** Ankle height at/above which grounding fades out entirely (swing foot). */
	blendFade: number;
	/** World-space forward (horizontal) the character faces; knees bend toward it. */
	forward: THREE.Vector3;
	/** Character yaw; the flat foot orientation is rotated by this to face travel. */
	yaw?: number;
}

const _bw = new THREE.Vector3();
const _cur = new THREE.Vector3();
const _des = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _pq = new THREE.Quaternion();
const _H = new THREE.Vector3();
const _K = new THREE.Vector3();
const _A = new THREE.Vector3();
const _T = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _fq = new THREE.Quaternion();
const _ry = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

function setWorldQuat(bone: THREE.Object3D, q: THREE.Quaternion): void {
	if (bone.parent) bone.parent.getWorldQuaternion(_pq).invert();
	else _pq.identity();
	bone.quaternion.copy(_pq.multiply(q));
	bone.updateWorldMatrix(false, true);
}

/**
 * Record each foot's world orientation in the current (flat idle) pose, at the
 * character's current yaw of 0. Planted feet are later re-oriented to this
 * clean pose (rotated to face travel), discarding any twist a clip baked in.
 */
export function captureFlatFeet(legs: Leg[]): void {
	for (const leg of legs) {
		leg.flat = new THREE.Quaternion();
		leg.ankle.getWorldQuaternion(leg.flat);
	}
}

export function collectLegs(root: THREE.Object3D): Leg[] {
	const b: Record<string, THREE.Object3D> = {};
	root.traverse((o) => {
		b[o.name] = o;
	});
	const legs: Leg[] = [];
	for (const s of ['l', 'r']) {
		const hip = b[`thigh_${s}`];
		const knee = b[`calf_${s}`];
		const ankle = b[`foot_${s}`];
		const toe = b[`ball_${s}`];
		if (hip && knee && ankle && toe)
			legs.push({ hip, knee, ankle, toe, flat: null });
	}
	return legs;
}

export function lowestAnkleY(legs: Leg[]): number {
	let m = Infinity;
	for (const l of legs) {
		l.ankle.getWorldPosition(_tmp);
		if (_tmp.y < m) m = _tmp.y;
	}
	return m;
}

function aim(
	bone: THREE.Object3D,
	childWorld: THREE.Vector3,
	desiredWorld: THREE.Vector3,
): void {
	bone.getWorldPosition(_bw);
	_cur.copy(childWorld).sub(_bw);
	_des.copy(desiredWorld).sub(_bw);
	if (_cur.lengthSq() < 1e-10 || _des.lengthSq() < 1e-10) return;
	_cur.normalize();
	_des.normalize();
	_q.setFromUnitVectors(_cur, _des);
	bone.getWorldQuaternion(_wq);
	_q.multiply(_wq);
	if (bone.parent) bone.parent.getWorldQuaternion(_pq).invert();
	else _pq.identity();
	bone.quaternion.copy(_pq.multiply(_q));
	bone.updateWorldMatrix(false, true);
}

/**
 * Two-bone leg IK that plants a foot on the floor. The correction is weight-
 * faded by ankle height (`blendFull`→`blendFade`) so a planted foot grounds and
 * a swing foot releases smoothly (no cut-in/out). The knee bends toward
 * `forward` (not the clip's possibly-sideways bend), keeping the thigh in the
 * sagittal plane so it doesn't twist out of the leg armor. Bone lengths are
 * preserved and the toe is levelled so the sole lies flat.
 */
export function groundLeg(leg: Leg, opts: GroundOptions): void {
	const { floorY, ankleHeight, blendFull, blendFade, forward } = opts;
	leg.hip.getWorldPosition(_H);
	leg.knee.getWorldPosition(_K);
	leg.ankle.getWorldPosition(_A);

	const above = _A.y - floorY;
	let w = THREE.MathUtils.clamp(
		(blendFade - above) / (blendFade - blendFull),
		0,
		1,
	);
	w = w * w * (3 - 2 * w);
	if (w <= 1e-3) return;

	leg.ankle.getWorldQuaternion(_fq);

	const targetY = floorY + ankleHeight;
	_T.set(_A.x, _A.y + (targetY - _A.y) * w, _A.z);
	const l1 = _K.distanceTo(_H);
	const l2 = _A.distanceTo(_K);
	let d = _H.distanceTo(_T);
	d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, d));
	_dir.copy(_T).sub(_H).normalize();

	_pole.copy(forward);
	_pole.addScaledVector(_dir, -_pole.dot(_dir));
	if (_pole.lengthSq() < 1e-6) {
		_tmp.copy(_K).sub(_H);
		_pole.copy(_tmp).addScaledVector(_dir, -_tmp.dot(_dir));
	}
	if (_pole.lengthSq() < 1e-6) _pole.set(0, 0, 1);
	_pole.normalize();

	const ck = THREE.MathUtils.clamp(
		(l1 * l1 + d * d - l2 * l2) / (2 * l1 * d),
		-1,
		1,
	);
	const ang = Math.acos(ck);
	_tmp.copy(_H)
		.addScaledVector(_dir, Math.cos(ang) * l1)
		.addScaledVector(_pole, Math.sin(ang) * l1);
	aim(leg.hip, _K, _tmp);

	leg.knee.getWorldPosition(_K);
	leg.ankle.getWorldPosition(_A);
	aim(leg.knee, _A, _T);

	// Restore the foot's clip-authored world orientation (the calf re-aim above
	// dragged an incidental twist into it), then pitch-level the toe to flatten
	// the sole — heading/roll stay as authored, so no foot twist.
	setWorldQuat(leg.ankle, _fq);
	leg.ankle.getWorldPosition(_A);
	leg.toe.getWorldPosition(_tmp);
	_des.set(_tmp.x, _tmp.y + (_A.y - _tmp.y) * w, _tmp.z);
	aim(leg.ankle, _tmp, _des);
}
