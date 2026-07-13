import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

type Vec3 = [number, number, number];

export interface ColliderCfg {
	legRoot: string;
	legTip: string;
	gain: number;
}

// Point collider: push the plate out when this bone (e.g. the swinging hand)
// comes within `radius` of the plate's pivot in the horizontal plane — catches
// the mid-stride case where the arm angle is minimal but the hand still crosses
// the plate. gain is radians pushed per metre of penetration.
export interface ProximityCfg {
	bone: string;
	radius: number;
	gain: number;
}

export interface PartCfg {
	bone: string;
	stiffness: number;
	damping: number;
	maxAngle: number;
	// Inward clamp (default -maxAngle). Faulds set this to ~0 so a fast roll
	// can't whip the plate through the body — they only ever swing outward.
	minAngle?: number;
	// Fauld style: a rigid plate hinged at an attach bone, pushed outward by a
	// swinging leg so the leg can't clip through it.
	hinge?: Vec3;
	colliders?: ColliderCfg[];
	proximity?: ProximityCfg[];
	motionGain?: number;
	// Permanent outward flare (radians) baked into rest, so the plate hangs just
	// outside the glove's swing path — the gloves pass inboard of it instead of
	// clipping, and the plate still sways naturally around this flared rest.
	restBias?: number;
	// Ignore thigh flex below this (radians) before pushing — so ordinary
	// walking steps don't shove side plates out into the swinging hands; only a
	// real high knee raise clears them.
	flexDeadzone?: number;
	// Plume style: 2-DOF crest driven by its driver bone's world acceleration.
	driver?: string;
	accelGain?: number;
	maxAccel?: number;
	// Arm-clearance style: the faulds are rigid metal and must NOT move, so
	// instead abduct this arm outward when its hand nears a fauld pivot — the
	// gauntlet swings AROUND the plate. `bone` is the upperarm; abductAxis is the
	// world axis to rotate about (outward), radius/gain the proximity trigger.
	armHand?: string;
	pivotBone?: string;
	abductAxis?: Vec3;
	radius?: number;
	gain?: number;
	responsiveness?: number;
}

// Dangly equipment that pivots at a purpose-built attach bone. Numbers tuned
// live; hinge axes and clamp signs are per-bone local space.
export const EQUIPMENT_PARTS: PartCfg[] = [
	{
		bone: 'hipAttachFront',
		hinge: [1, 0, 0],
		stiffness: 60,
		damping: 9,
		maxAngle: 1.0,
		motionGain: 0.12,
		colliders: [
			{ legRoot: 'thigh_l', legTip: 'calf_l', gain: 1.1 },
			{ legRoot: 'thigh_r', legTip: 'calf_r', gain: 1.1 },
		],
	},
	{
		bone: 'hipAttachBack',
		hinge: [1, 0, 0],
		stiffness: 60,
		damping: 9,
		maxAngle: 1.0,
		motionGain: 0.12,
		colliders: [
			{ legRoot: 'thigh_l', legTip: 'calf_l', gain: -1.1 },
			{ legRoot: 'thigh_r', legTip: 'calf_r', gain: -1.1 },
		],
	},
	{
		bone: 'hipAttach_l',
		hinge: [0, 0, 1],
		stiffness: 55,
		damping: 8,
		maxAngle: 0.55,
		minAngle: 0,
		restBias: 0.15,
		motionGain: 0.06,
		flexDeadzone: 0.5,
		colliders: [{ legRoot: 'thigh_l', legTip: 'calf_l', gain: 1.1 }],
	},
	{
		bone: 'hipAttach_r',
		hinge: [0, 0, -1],
		stiffness: 55,
		damping: 8,
		maxAngle: 0.55,
		minAngle: 0,
		restBias: 0.15,
		motionGain: 0.06,
		flexDeadzone: 0.5,
		colliders: [{ legRoot: 'thigh_r', legTip: 'calf_r', gain: 1.1 }],
	},
	{
		bone: 'upperarm_l',
		armHand: 'hand_l',
		pivotBone: 'hipAttach_l',
		abductAxis: [0, 0, 1],
		radius: 0.2,
		gain: 3.0,
		maxAngle: 0.4,
		responsiveness: 12,
		stiffness: 0,
		damping: 0,
	},
	{
		bone: 'upperarm_r',
		armHand: 'hand_r',
		pivotBone: 'hipAttach_r',
		abductAxis: [0, 0, -1],
		radius: 0.2,
		gain: 3.0,
		maxAngle: 0.4,
		responsiveness: 12,
		stiffness: 0,
		damping: 0,
	},
	{
		bone: 'plume',
		driver: 'headAttach',
		stiffness: 130,
		damping: 9,
		accelGain: 0.14,
		maxAccel: 120,
		maxAngle: 0.7,
	},
];

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;

interface ColliderState {
	root: THREE.Object3D;
	tip: THREE.Object3D;
	restDir: THREE.Vector3;
	gain: number;
}

interface Part {
	kind: 'fauld' | 'plume' | 'arm';
	bone: THREE.Object3D;
	cfg: PartCfg;
	rest: THREE.Quaternion;
	hinge?: THREE.Vector3;
	swingDrive?: THREE.Vector3;
	colliders?: ColliderState[];
	proximity?: { obj: THREE.Object3D; radius: number; gain: number }[];
	hand?: THREE.Object3D | null;
	pivotObj?: THREE.Object3D | null;
	abductAxis?: THREE.Vector3;
	theta: number;
	omega: number;
	pivotPrev: THREE.Vector3;
	driver?: THREE.Object3D | null;
	prevPos: THREE.Vector3;
	prevVel: THREE.Vector3;
	pitch: number;
	pitchV: number;
	roll: number;
	rollV: number;
	started: boolean;
}

const _p = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _acc = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _pq = new THREE.Quaternion();
const _pqi = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function build(scene: THREE.Object3D): Part[] {
	scene.updateWorldMatrix(true, true);
	const parts: Part[] = [];
	for (const cfg of EQUIPMENT_PARTS) {
		const bone = scene.getObjectByName(cfg.bone);
		if (!bone) continue;
		const part: Part = {
			kind: cfg.armHand ? 'arm' : cfg.hinge ? 'fauld' : 'plume',
			bone,
			cfg,
			rest: bone.quaternion.clone(),
			theta: 0,
			omega: 0,
			pivotPrev: bone.getWorldPosition(new THREE.Vector3()),
			prevPos: new THREE.Vector3(),
			prevVel: new THREE.Vector3(),
			pitch: 0,
			pitchV: 0,
			roll: 0,
			rollV: 0,
			started: false,
		};
		if (cfg.hinge) {
			// Bake the upright world hinge into the pelvis's local frame ONCE.
			// Swinging about this body-relative axis keeps "outward" pointing
			// away from the body through rolls/flips — a fixed world axis would
			// shove the plate into the body once the pelvis is no longer upright.
			const worldHinge = new THREE.Vector3(...cfg.hinge).normalize();
			const worldSwing = new THREE.Vector3()
				.crossVectors(worldHinge, UP)
				.normalize();
			const parentQ0 = (bone.parent ?? bone).getWorldQuaternion(
				new THREE.Quaternion(),
			);
			const inv0 = parentQ0.invert();
			part.hinge = worldHinge.clone().applyQuaternion(inv0).normalize();
			part.swingDrive = worldSwing
				.clone()
				.applyQuaternion(inv0)
				.normalize();
			if (cfg.restBias) {
				part.rest.premultiply(
					_q.setFromAxisAngle(part.hinge, cfg.restBias),
				);
			}
			part.colliders = [];
			for (const c of cfg.colliders ?? []) {
				const root = scene.getObjectByName(c.legRoot);
				const tip = scene.getObjectByName(c.legTip);
				if (!root || !tip) continue;
				part.colliders.push({
					root,
					tip,
					gain: c.gain,
					restDir: tip
						.getWorldPosition(new THREE.Vector3())
						.sub(root.getWorldPosition(new THREE.Vector3()))
						.normalize(),
				});
			}
			part.proximity = [];
			for (const px of cfg.proximity ?? []) {
				const obj = scene.getObjectByName(px.bone);
				if (obj)
					part.proximity.push({
						obj,
						radius: px.radius,
						gain: px.gain,
					});
			}
		} else if (cfg.armHand) {
			part.hand = scene.getObjectByName(cfg.armHand) ?? null;
			part.pivotObj = scene.getObjectByName(cfg.pivotBone ?? '') ?? null;
			part.abductAxis = new THREE.Vector3(
				...(cfg.abductAxis ?? [0, 0, 1]),
			).normalize();
		} else {
			part.driver =
				scene.getObjectByName(cfg.driver ?? '') ?? bone.parent ?? null;
		}
		parts.push(part);
	}
	return parts;
}

function updateFauld(s: Part, dt: number): void {
	s.bone.getWorldPosition(_p);
	_vel.subVectors(_p, s.pivotPrev).multiplyScalar(1 / dt);
	s.pivotPrev.copy(_p);

	let target = 0;
	const dead = s.cfg.flexDeadzone ?? 0;
	for (const c of s.colliders ?? []) {
		_dir.subVectors(
			c.tip.getWorldPosition(_a),
			c.root.getWorldPosition(_b),
		).normalize();
		const flex = Math.acos(clamp(_dir.dot(c.restDir), -1, 1));
		target += c.gain * Math.max(0, flex - dead);
	}

	// Proximity push: a hand (or other bone) crossing the plate horizontally
	// shoves it outward regardless of the arm's angle — fixes the mid-stride
	// clip where arm flex is minimal but the hand is right at the plate.
	for (const px of s.proximity ?? []) {
		px.obj.getWorldPosition(_a);
		const d = Math.hypot(_a.x - _p.x, _a.z - _p.z);
		target += px.gain * Math.max(0, px.radius - d);
	}

	// Motion torque from pivot velocity, taken in the pelvis's local frame so
	// the swing stays body-relative through rolls.
	s.bone.parent?.getWorldQuaternion(_pq);
	_pqi.copy(_pq).invert();
	_dir.copy(_vel).applyQuaternion(_pqi);
	const motion = _dir.dot(s.swingDrive!) * (s.cfg.motionGain ?? 0);

	const accel =
		s.cfg.stiffness * (target - s.theta) - s.cfg.damping * s.omega + motion;
	s.omega += accel * dt;
	s.theta = clamp(
		s.theta + s.omega * dt,
		s.cfg.minAngle ?? -s.cfg.maxAngle,
		s.cfg.maxAngle,
	);

	// Hinge is already in the pelvis (parent) frame; pre-multiply rest so the
	// plate swings about it — follows the body through any orientation.
	_q.setFromAxisAngle(s.hinge!, s.theta);
	s.bone.quaternion.copy(s.rest).premultiply(_q);
}

function updatePlume(s: Part, dt: number): void {
	if (!s.driver) return;
	s.driver.getWorldPosition(_p);
	if (!s.started) {
		s.prevPos.copy(_p);
		s.started = true;
		return;
	}
	_vel.subVectors(_p, s.prevPos).divideScalar(dt);
	_acc.subVectors(_vel, s.prevVel).divideScalar(dt);
	s.prevPos.copy(_p);
	s.prevVel.copy(_vel);

	const m = s.cfg.maxAccel ?? 120;
	const g = s.cfg.accelGain ?? 0.14;
	const driveP = -clamp(_acc.y, -m, m) * g;
	const driveR = -clamp(_acc.x, -m, m) * g;

	s.pitchV +=
		(-s.cfg.stiffness * s.pitch - s.cfg.damping * s.pitchV + driveP) * dt;
	s.pitch = clamp(s.pitch + s.pitchV * dt, -s.cfg.maxAngle, s.cfg.maxAngle);
	s.rollV +=
		(-s.cfg.stiffness * s.roll - s.cfg.damping * s.rollV + driveR) * dt;
	s.roll = clamp(s.roll + s.rollV * dt, -s.cfg.maxAngle, s.cfg.maxAngle);

	_e.set(s.pitch, 0, s.roll);
	_q.setFromEuler(_e);
	s.bone.quaternion.copy(s.rest).multiply(_q);
}

function updateArm(s: Part, dt: number): void {
	if (!s.hand || !s.pivotObj) return;
	// How far the gauntlet has penetrated the fauld's horizontal keep-out radius.
	s.pivotObj.getWorldPosition(_p);
	s.hand.getWorldPosition(_a);
	const d = Math.hypot(_a.x - _p.x, _a.z - _p.z);
	const pen = Math.max(0, (s.cfg.radius ?? 0.2) - d);
	const targetAbduct = Math.min(s.cfg.maxAngle, (s.cfg.gain ?? 3) * pen);
	// Smooth toward target so the arm eases out/in instead of snapping.
	const k = Math.min(1, dt * (s.cfg.responsiveness ?? 12));
	s.theta += (targetAbduct - s.theta) * k;
	if (s.theta < 1e-4) return;

	// Abduct about the world axis, converted into the upperarm's parent frame,
	// added ON TOP of the live animated pose (mixer reset it this frame).
	s.bone.parent?.getWorldQuaternion(_pq);
	_pqi.copy(_pq).invert();
	_dir.copy(s.abductAxis!).applyQuaternion(_pqi);
	_q.setFromAxisAngle(_dir, s.theta);
	s.bone.quaternion.premultiply(_q);
}

/**
 * Spring-bone physics for dangly equipment (faulds + helmet plume). Runs AFTER
 * the animation mixer each frame; the clips don't key these attach bones, so
 * each part adds swing (and a leg-collision push, for faulds) on top of rest.
 */
export class EquipmentPhysics {
	private parts: Part[];
	constructor(scene: THREE.Object3D) {
		this.parts = build(scene);
	}
	update(dt: number): void {
		if (dt <= 0) return;
		for (const s of this.parts) {
			if (s.kind === 'fauld') updateFauld(s, dt);
			else if (s.kind === 'arm') updateArm(s, dt);
			else updatePlume(s, dt);
		}
	}
}

/** R3F hook wrapper — registers a useFrame that runs after the caller's mixer
 *  update (call this hook AFTER the mixer's useFrame). */
export function useEquipmentPhysics(scene: THREE.Object3D): void {
	const ref = useRef<EquipmentPhysics | null>(null);
	useEffect(() => {
		ref.current = new EquipmentPhysics(scene);
	}, [scene]);
	useFrame((_, dt) => {
		ref.current?.update(Math.min(dt, 1 / 30));
	});
}
