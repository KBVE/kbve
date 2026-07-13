import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export interface ColliderCfg {
	legRoot: string;
	legTip: string;
	gain: number;
}

export interface DynBoneCfg {
	bone: string;
	hinge: [number, number, number];
	stiffness: number;
	damping: number;
	motionGain: number;
	clamp: [number, number];
	colliders?: ColliderCfg[];
}

// Dangly equipment that pivots at an attach bone. Faulds are rigid metal plates
// hinged at the belt; the plume hangs off the helmet. Collider rows push a plate
// outward as a leg swings toward it so the leg can't punch through. All numbers
// are tuned live — hinge axes and clamp signs are per-bone local space.
export const PHYSICS_BONES: DynBoneCfg[] = [
	{
		bone: 'hipAttachFront',
		hinge: [1, 0, 0],
		stiffness: 60,
		damping: 9,
		motionGain: 0.12,
		clamp: [-0.15, 1.0],
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
		motionGain: 0.12,
		clamp: [-1.0, 0.15],
		colliders: [
			{ legRoot: 'thigh_l', legTip: 'calf_l', gain: -1.1 },
			{ legRoot: 'thigh_r', legTip: 'calf_r', gain: -1.1 },
		],
	},
	{
		bone: 'hipAttach_l',
		hinge: [0, 0, 1],
		stiffness: 60,
		damping: 9,
		motionGain: 0.12,
		clamp: [-0.15, 1.0],
		colliders: [{ legRoot: 'thigh_l', legTip: 'calf_l', gain: 1.1 }],
	},
	{
		bone: 'hipAttach_r',
		hinge: [0, 0, 1],
		stiffness: 60,
		damping: 9,
		motionGain: 0.12,
		clamp: [-1.0, 0.15],
		colliders: [{ legRoot: 'thigh_r', legTip: 'calf_r', gain: 1.1 }],
	},
	{
		bone: 'plume',
		hinge: [1, 0, 0],
		stiffness: 45,
		damping: 6,
		motionGain: 0.35,
		clamp: [-0.7, 0.7],
	},
];

interface ColliderState {
	root: THREE.Object3D;
	tip: THREE.Object3D;
	restDir: THREE.Vector3;
	gain: number;
}

interface BoneState {
	bone: THREE.Object3D;
	cfg: DynBoneCfg;
	qRest: THREE.Quaternion;
	hinge: THREE.Vector3;
	swingDrive: THREE.Vector3;
	theta: number;
	omega: number;
	pivotPrev: THREE.Vector3;
	colliders: ColliderState[];
}

const UP = new THREE.Vector3(0, 1, 0);

function buildStates(scene: THREE.Object3D): BoneState[] {
	const states: BoneState[] = [];
	for (const cfg of PHYSICS_BONES) {
		const bone = scene.getObjectByName(cfg.bone);
		if (!bone) continue;
		const hinge = new THREE.Vector3(...cfg.hinge).normalize();
		const swingDrive = new THREE.Vector3()
			.crossVectors(hinge, UP)
			.normalize();
		const colliders: ColliderState[] = [];
		for (const c of cfg.colliders ?? []) {
			const root = scene.getObjectByName(c.legRoot);
			const tip = scene.getObjectByName(c.legTip);
			if (!root || !tip) continue;
			scene.updateWorldMatrix(true, true);
			const restDir = tip
				.getWorldPosition(new THREE.Vector3())
				.sub(root.getWorldPosition(new THREE.Vector3()))
				.normalize();
			colliders.push({ root, tip, restDir, gain: c.gain });
		}
		states.push({
			bone,
			cfg,
			qRest: bone.quaternion.clone(),
			hinge,
			swingDrive,
			theta: 0,
			omega: 0,
			pivotPrev: bone.getWorldPosition(new THREE.Vector3()),
			colliders,
		});
	}
	return states;
}

const _pivot = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _localVel = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _parentQ = new THREE.Quaternion();
const _parentInv = new THREE.Quaternion();
const _q = new THREE.Quaternion();

/**
 * Spring-bone physics for dangly equipment (faulds, plume). Runs after the
 * animation mixer each frame — call it AFTER the mixer's useFrame so it reads
 * the posed skeleton and adds swing + a collision push on top.
 */
export function useEquipmentPhysics(
	scene: THREE.Object3D,
	enabled = true,
): void {
	const ref = useRef<BoneState[]>([]);
	useEffect(() => {
		ref.current = buildStates(scene);
	}, [scene]);

	useFrame((_, dtRaw) => {
		if (!enabled) return;
		const dt = Math.min(dtRaw, 1 / 30);
		for (const s of ref.current) {
			s.bone.getWorldPosition(_pivot);
			_vel.subVectors(_pivot, s.pivotPrev);
			if (dt > 0) _vel.multiplyScalar(1 / dt);
			s.pivotPrev.copy(_pivot);

			let target = 0;
			for (const c of s.colliders) {
				_dir.subVectors(
					c.tip.getWorldPosition(new THREE.Vector3()),
					c.root.getWorldPosition(new THREE.Vector3()),
				).normalize();
				const flex = Math.acos(
					THREE.MathUtils.clamp(_dir.dot(c.restDir), -1, 1),
				);
				target += c.gain * flex;
			}

			s.bone.parent?.getWorldQuaternion(_parentQ);
			_parentInv.copy(_parentQ).invert();
			_localVel.copy(_vel).applyQuaternion(_parentInv);
			const motion = _localVel.dot(s.swingDrive) * s.cfg.motionGain;

			const accel =
				s.cfg.stiffness * (target - s.theta) -
				s.cfg.damping * s.omega +
				motion;
			s.omega += accel * dt;
			s.theta += s.omega * dt;
			s.theta = THREE.MathUtils.clamp(
				s.theta,
				s.cfg.clamp[0],
				s.cfg.clamp[1],
			);

			_q.setFromAxisAngle(s.hinge, s.theta);
			s.bone.quaternion.copy(s.qRest).multiply(_q);
		}
	});
}
