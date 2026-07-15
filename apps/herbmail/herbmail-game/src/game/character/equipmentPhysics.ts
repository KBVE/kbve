import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { ARMOR_PIECES } from './armor';

const DEFAULT_EQUIPPED = new Set(ARMOR_PIECES.map((p) => p.id));

type Vec3 = [number, number, number];

export interface ColliderCfg {
	legRoot: string;
	legTip: string;
	gain: number;

	directional?: boolean;

	deadzone?: number;

	clampSign?: -1 | 1;
}

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

	minAngle?: number;

	hinge?: Vec3;
	colliders?: ColliderCfg[];
	proximity?: ProximityCfg[];
	motionGain?: number;

	restBias?: number;

	restBiasByPiece?: Record<string, number>;

	gravity?: number;

	pitchStandoff?: number;

	flexDeadzone?: number;

	driver?: string;
	accelGain?: number;
	maxAccel?: number;

	armHand?: string;
	pivotBone?: string;
	abductAxis?: Vec3;
	radius?: number;
	gain?: number;
	responsiveness?: number;
}

export const EQUIPMENT_PARTS: PartCfg[] = [
	{
		bone: 'hipAttachFront',
		hinge: [1, 0, 0],
		stiffness: 55,
		damping: 9,
		maxAngle: 1.4,
		minAngle: 0,
		motionGain: 0.12,
		flexDeadzone: 0.25,
		colliders: [
			{ legRoot: 'thigh_l', legTip: 'calf_l', gain: 1.9 },
			{ legRoot: 'thigh_r', legTip: 'calf_r', gain: 1.9 },
		],
	},
	{
		bone: 'hipAttachBack',
		hinge: [1, 0, 0],
		stiffness: 18,
		damping: 3.5,
		maxAngle: 1.4,
		minAngle: -1.4,
		restBias: 0.02,
		restBiasByPiece: { 'vanguard-tassets': 0.06 },
		motionGain: 0.5,
		gravity: 0.9,
		pitchStandoff: 0.6,
		colliders: [
			{
				legRoot: 'thigh_l',
				legTip: 'calf_l',
				gain: 1.6,
				directional: true,
				clampSign: -1,
			},
			{
				legRoot: 'thigh_r',
				legTip: 'calf_r',
				gain: 1.6,
				directional: true,
				clampSign: -1,
			},
		],
	},
	{
		bone: 'hipAttach_l',
		hinge: [0, 0, 1],
		stiffness: 55,
		damping: 8,
		maxAngle: 0.55,
		minAngle: 0,
		restBias: 0.05,
		restBiasByPiece: { 'vanguard-tassets': 0.1 },
		motionGain: 0.06,
		flexDeadzone: 0.5,
		colliders: [
			{ legRoot: 'thigh_l', legTip: 'calf_l', gain: 1.1 },
			{
				legRoot: 'pelvis',
				legTip: 'spine_01',
				gain: 0.9,
				deadzone: 0.15,
			},
		],
	},
	{
		bone: 'hipAttach_r',
		hinge: [0, 0, -1],
		stiffness: 55,
		damping: 8,
		maxAngle: 0.55,
		minAngle: 0,
		restBias: 0.05,
		restBiasByPiece: { 'vanguard-tassets': 0.1 },
		motionGain: 0.06,
		flexDeadzone: 0.5,
		colliders: [
			{ legRoot: 'thigh_r', legTip: 'calf_r', gain: 1.1 },
			{
				legRoot: 'pelvis',
				legTip: 'spine_01',
				gain: 0.9,
				deadzone: 0.15,
			},
		],
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
	directional: boolean;
	deadzone?: number;
	clampSign?: -1 | 1;
}

interface Part {
	kind: 'fauld' | 'plume' | 'arm';
	bone: THREE.Object3D;
	cfg: PartCfg;
	rest: THREE.Quaternion;
	bindRest: THREE.Quaternion;
	hinge?: THREE.Vector3;
	swingDrive?: THREE.Vector3;
	parentRest?: THREE.Quaternion;
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
const _c = new THREE.Vector3();
const _pq = new THREE.Quaternion();
const _pqi = new THREE.Quaternion();
const _qr = new THREE.Quaternion();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

function applyRestBias(part: Part, equipped: Set<string>): void {
	if (!part.hinge) return;
	let bias = part.cfg.restBias ?? 0;
	const byPiece = part.cfg.restBiasByPiece;
	if (byPiece)
		for (const id of equipped) if (byPiece[id]) bias += byPiece[id];
	part.rest.copy(part.bindRest);
	if (bias) part.rest.premultiply(_q.setFromAxisAngle(part.hinge, bias));
}

function build(scene: THREE.Object3D, equipped: Set<string>): Part[] {
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
			bindRest: bone.quaternion.clone(),
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
			const worldHinge = new THREE.Vector3(...cfg.hinge).normalize();
			const worldSwing = new THREE.Vector3()
				.crossVectors(worldHinge, UP)
				.normalize();
			const parentQ0 = (bone.parent ?? bone).getWorldQuaternion(
				new THREE.Quaternion(),
			);
			part.parentRest = parentQ0.clone();
			const inv0 = parentQ0.invert();
			part.hinge = worldHinge.clone().applyQuaternion(inv0).normalize();
			part.swingDrive = worldSwing
				.clone()
				.applyQuaternion(inv0)
				.normalize();
			applyRestBias(part, equipped);
			part.colliders = [];
			for (const c of cfg.colliders ?? []) {
				const root = scene.getObjectByName(c.legRoot);
				const tip = scene.getObjectByName(c.legTip);
				if (!root || !tip) continue;
				part.colliders.push({
					root,
					tip,
					gain: c.gain,
					directional: c.directional ?? false,
					deadzone: c.deadzone,
					clampSign: c.clampSign,
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

	s.bone.parent?.getWorldQuaternion(_pq);
	_pqi.copy(_pq).invert();

	_c.copy(s.swingDrive!).applyQuaternion(_pq);

	let target = 0;
	const dead = s.cfg.flexDeadzone ?? 0;
	for (const c of s.colliders ?? []) {
		_dir.subVectors(
			c.tip.getWorldPosition(_a),
			c.root.getWorldPosition(_b),
		);
		if (c.directional) {
			let contrib = c.gain * _dir.dot(_c);
			if (c.clampSign === -1) contrib = Math.min(0, contrib);
			else if (c.clampSign === 1) contrib = Math.max(0, contrib);
			target += contrib;
		} else {
			_dir.normalize();
			const flex = Math.acos(clamp(_dir.dot(c.restDir), -1, 1));
			target += c.gain * Math.max(0, flex - (c.deadzone ?? dead));
		}
	}

	for (const px of s.proximity ?? []) {
		px.obj.getWorldPosition(_a);
		const d = Math.hypot(_a.x - _p.x, _a.z - _p.z);
		target += px.gain * Math.max(0, px.radius - d);
	}

	if ((s.cfg.gravity || s.cfg.pitchStandoff) && s.parentRest) {
		_qr.copy(s.parentRest).invert().multiply(_pq);
		const d = _qr.x * s.hinge!.x + _qr.y * s.hinge!.y + _qr.z * s.hinge!.z;
		const twist = 2 * Math.atan2(d, _qr.w);
		if (s.cfg.gravity) target += -twist * s.cfg.gravity;

		if (s.cfg.pitchStandoff)
			target += Math.abs(twist) * s.cfg.pitchStandoff;
	}

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

	s.pivotObj.getWorldPosition(_p);
	s.hand.getWorldPosition(_a);
	const d = Math.hypot(_a.x - _p.x, _a.z - _p.z);
	const pen = Math.max(0, (s.cfg.radius ?? 0.2) - d);
	const targetAbduct = Math.min(s.cfg.maxAngle, (s.cfg.gain ?? 3) * pen);

	const k = Math.min(1, dt * (s.cfg.responsiveness ?? 12));
	s.theta += (targetAbduct - s.theta) * k;
	if (s.theta < 1e-4) return;

	s.bone.parent?.getWorldQuaternion(_pq);
	_pqi.copy(_pq).invert();
	_dir.copy(s.abductAxis!).applyQuaternion(_pqi);
	_q.setFromAxisAngle(_dir, s.theta);
	s.bone.quaternion.premultiply(_q);
}

export class EquipmentPhysics {
	private parts: Part[];
	constructor(
		scene: THREE.Object3D,
		equipped: Set<string> = DEFAULT_EQUIPPED,
	) {
		this.parts = build(scene, equipped);
	}

	setEquipped(equipped: Set<string>): void {
		for (const p of this.parts) applyRestBias(p, equipped);
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

export function useEquipmentPhysics(
	scene: THREE.Object3D,
	equipped?: Set<string>,
): void {
	const ref = useRef<EquipmentPhysics | null>(null);
	useEffect(() => {
		ref.current = new EquipmentPhysics(scene, equipped ?? DEFAULT_EQUIPPED);
	}, [scene]);
	useEffect(() => {
		if (equipped) ref.current?.setEquipped(equipped);
	}, [equipped]);
	useFrame((_, dt) => {
		ref.current?.update(Math.min(dt, 1 / 30));
	});
}
