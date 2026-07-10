import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ARM_IK } from './config';

function norm(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface Bones {
	bicep: THREE.Bone;
	forearm: THREE.Bone;
	wrist: THREE.Bone;
}

function makeLabel(
	letter: string,
	dir: [number, number, number],
): THREE.Sprite {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = 'rgba(0,0,0,0.75)';
	ctx.beginPath();
	ctx.arc(64, 64, 60, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#39ff14';
	ctx.font = 'bold 88px monospace';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(letter, 64, 70);
	const tex = new THREE.CanvasTexture(c);
	const mat = new THREE.SpriteMaterial({
		map: tex,
		depthTest: false,
		depthWrite: false,
		transparent: true,
	});
	const sp = new THREE.Sprite(mat);
	sp.position.set(dir[0] * 1.8, dir[1] * 1.8, dir[2] * 1.8);
	sp.scale.setScalar(1.1);
	sp.renderOrder = 1002;
	sp.raycast = () => undefined;
	return sp;
}

const LABELS: Array<[string, [number, number, number]]> = [
	['A', [1, 0, 0]],
	['B', [-1, 0, 0]],
	['C', [0, 1, 0]],
	['D', [0, -1, 0]],
	['E', [0, 0, 1]],
	['F', [0, 0, -1]],
];

function findBones(root: THREE.Object3D): Bones | null {
	const want = {
		bicep: norm(ARM_IK.bicep),
		forearm: norm(ARM_IK.forearm),
		wrist: norm(ARM_IK.wrist),
	};
	const found: Partial<Bones> = {};
	root.traverse((o) => {
		if (!(o as THREE.Bone).isBone) return;
		const n = norm(o.name);
		if (n === want.bicep) found.bicep = o as THREE.Bone;
		else if (n === want.forearm) found.forearm = o as THREE.Bone;
		else if (n === want.wrist) found.wrist = o as THREE.Bone;
	});
	if (found.bicep && found.forearm && found.wrist) return found as Bones;
	return null;
}

const clamp = THREE.MathUtils.clamp;

export function useArmIk(
	group: React.RefObject<THREE.Object3D | null>,
	sceneRoot: React.RefObject<THREE.Object3D | null>,
) {
	const camera = useThree((s) => s.camera);
	const scene = useThree((s) => s.scene);

	const bonesRef = useRef<Bones | null>(null);
	const restQ = useRef<{
		bicep: THREE.Quaternion;
		forearm: THREE.Quaternion;
		wrist: THREE.Quaternion;
	} | null>(null);
	const weight = useRef(0);
	const missClock = useRef(0);
	const hasTarget = useRef(false);
	const heldWeight = useRef(0);
	const reachHeld = useRef(false);
	const engaged = useRef(false);

	useEffect(() => {
		const down = (e: MouseEvent) => {
			if (e.button === 2) reachHeld.current = true;
		};
		const up = (e: MouseEvent) => {
			if (e.button === 2) reachHeld.current = false;
		};
		const kd = (e: KeyboardEvent) => {
			if (e.code === 'KeyE') reachHeld.current = true;
		};
		const ku = (e: KeyboardEvent) => {
			if (e.code === 'KeyE') reachHeld.current = false;
		};
		window.addEventListener('mousedown', down);
		window.addEventListener('mouseup', up);
		window.addEventListener('keydown', kd);
		window.addEventListener('keyup', ku);
		return () => {
			window.removeEventListener('mousedown', down);
			window.removeEventListener('mouseup', up);
			window.removeEventListener('keydown', kd);
			window.removeEventListener('keyup', ku);
		};
	}, []);
	const logT = useRef(0);
	const prevAxis = useRef(new THREE.Vector3());
	const prevAxisSet = useRef(false);
	const prevTarget = useRef(new THREE.Vector3());
	const prevWrist = useRef(new THREE.Vector3());
	const prevWristSet = useRef(false);

	const s = useMemo(
		() => ({
			ray: new THREE.Raycaster(),
			dir: new THREE.Vector3(),
			hit: new THREE.Vector3(),
			target: new THREE.Vector3(),
			normal: new THREE.Vector3(),
			rawN: new THREE.Vector3(),
			anchor: new THREE.Vector3(),
			anchorN: new THREE.Vector3(),
			B: new THREE.Vector3(),
			F: new THREE.Vector3(),
			E: new THREE.Vector3(),
			d: new THREE.Vector3(),
			dHat: new THREE.Vector3(),
			axis: new THREE.Vector3(),
			bicepDir: new THREE.Vector3(),
			curB: new THREE.Vector3(),
			curF: new THREE.Vector3(),
			wantF: new THREE.Vector3(),
			pole: new THREE.Vector3(...ARM_IK.poleHint).normalize(),
			fingerL: new THREE.Vector3(...ARM_IK.fingerLocal).normalize(),
			palmL: new THREE.Vector3(...ARM_IK.palmLocal).normalize(),
			nIn: new THREE.Vector3(),
			up: new THREE.Vector3(),
			thirdW: new THREE.Vector3(),
			thirdL: new THREE.Vector3(),
			mW: new THREE.Matrix4(),
			mL: new THREE.Matrix4(),
			mR: new THREE.Matrix4(),
			rQuat: new THREE.Quaternion(),
			q: new THREE.Quaternion(),
			swing: new THREE.Quaternion(),
			curWorld: new THREE.Quaternion(),
			parentWorld: new THREE.Quaternion(),
			desired: new THREE.Quaternion(),
			local: new THREE.Quaternion(),
		}),
		[],
	);

	useEffect(() => {
		bonesRef.current = null;
	}, [group]);

	function swingBone(bone: THREE.Bone, w: number) {
		bone.getWorldQuaternion(s.curWorld);
		s.desired.copy(s.swing).multiply(s.curWorld);
		if (bone.parent) bone.parent.getWorldQuaternion(s.parentWorld);
		else s.parentWorld.identity();
		s.local.copy(s.parentWorld).invert().multiply(s.desired);
		bone.quaternion.slerp(s.local, w);
		bone.updateMatrixWorld(true);
	}

	useFrame((_, dtRaw) => {
		if (!ARM_IK.enabled) return;
		const g = group.current;
		if (!g) return;

		if (!bonesRef.current) {
			bonesRef.current = findBones(g);
			if (!bonesRef.current) return;
			restQ.current = {
				bicep: bonesRef.current.bicep.quaternion.clone(),
				forearm: bonesRef.current.forearm.quaternion.clone(),
				wrist: bonesRef.current.wrist.quaternion.clone(),
			};
			if (ARM_IK.debugAxes) {
				for (const b of [
					bonesRef.current.wrist,
					bonesRef.current.forearm,
				]) {
					const ax = new THREE.AxesHelper(1.6);
					const mat = ax.material as THREE.Material;
					mat.depthTest = false;
					mat.depthWrite = false;
					ax.renderOrder = 1001;
					ax.raycast = () => undefined;
					b.add(ax);
				}
				for (const [letter, dir] of LABELS) {
					bonesRef.current.wrist.add(makeLabel(letter, dir));
				}
			}
		}
		const { bicep, forearm, wrist } = bonesRef.current;
		const dt = Math.min(dtRaw, 0.05);

		g.updateWorldMatrix(true, true);
		bicep.getWorldPosition(s.B);
		forearm.getWorldPosition(s.F);
		wrist.getWorldPosition(s.E);
		const l1 = s.F.distanceTo(s.B);
		const l2 = s.E.distanceTo(s.F);
		const reach = (l1 + l2) * ARM_IK.reachFactor;

		camera.getWorldDirection(s.dir);
		s.ray.set(camera.position, s.dir);
		s.ray.camera = camera;
		s.ray.far = reach * 1.6;
		const hits = s.ray.intersectObject(sceneRoot.current ?? scene, true);
		const hit = hits.find((h) => h.face);
		let hitName = 'none';
		let rawDist = -1;
		if (hit) {
			hitName =
				(hit.object.parent?.userData?.kind as string) ??
				hit.object.name ??
				'?';
			rawDist = hit.point.distanceTo(s.B);
		}
		const active = !ARM_IK.holdToReach || reachHeld.current;

		// follow the crosshair hit within reach, smoothed. clamp target inside
		// physical reach so the arm never over-extends (that was the wobble).
		const inEngage = !!hit && rawDist < reach * ARM_IK.engageFrac;
		const inHold = !!hit && rawDist < reach * ARM_IK.releaseFrac;
		const acquire =
			active && !!hit && (engaged.current ? inHold : inEngage);

		let targetWeight = 0;
		if (acquire) {
			engaged.current = true;
			missClock.current = 0;
			targetWeight = 1;

			s.rawN.set(0, 0, 1);
			if (hit!.face && hit!.object) {
				s.rawN
					.copy(hit!.face.normal)
					.transformDirection(hit!.object.matrixWorld);
			}
			s.hit.copy(hit!.point).addScaledVector(s.rawN, ARM_IK.palmOut);
			// clamp into reach sphere around the shoulder
			s.d.subVectors(s.hit, s.B);
			const len = s.d.length();
			if (len > reach) s.hit.copy(s.B).addScaledVector(s.d, reach / len);

			const k = 1 - Math.exp(-ARM_IK.targetLerp * dt);
			if (hasTarget.current) {
				s.target.lerp(s.hit, k);
				s.normal.lerp(s.rawN, k).normalize();
			} else {
				s.target.copy(s.hit);
				s.normal.copy(s.rawN);
				hasTarget.current = true;
			}
		} else if (engaged.current && missClock.current < ARM_IK.missGrace) {
			missClock.current += dt;
			targetWeight = 1;
		} else {
			engaged.current = false;
			hasTarget.current = false;
		}
		const lambda =
			targetWeight > weight.current
				? ARM_IK.engageLerp
				: ARM_IK.releaseLerp;
		weight.current = THREE.MathUtils.damp(
			weight.current,
			targetWeight,
			lambda,
			dt,
		);
		const w = weight.current;
		if (w < 0.001) return;

		s.d.subVectors(s.target, s.B);
		let dist = s.d.length();
		if (dist < 1e-4) return;
		s.dHat.copy(s.d).multiplyScalar(1 / dist);
		dist = clamp(dist, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);

		const cosA = clamp(
			(l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist),
			-1,
			1,
		);
		const a = Math.acos(cosA) * ARM_IK.poleSign;

		s.axis.crossVectors(s.dHat, s.pole);
		const axisDegen = s.axis.lengthSq() < 1e-6;
		if (axisDegen) s.axis.set(1, 0, 0);
		s.axis.normalize();
		if (ARM_IK.debugLog) {
			if (prevAxisSet.current) {
				const d = s.axis.dot(prevAxis.current);
				if (d < 0)
					console.info(
						'[ik] AXIS FLIP dot',
						d.toFixed(2),
						'degen',
						axisDegen,
						'hit',
						hitName,
						'dist',
						rawDist.toFixed(3),
						'w',
						w.toFixed(2),
					);
			}
			prevAxis.current.copy(s.axis);
			prevAxisSet.current = true;
			const jump = s.target.distanceTo(prevTarget.current);
			if (jump > 0.08)
				console.info(
					'[ik] TARGET JUMP',
					jump.toFixed(3),
					'hit',
					hitName,
					'dist',
					rawDist.toFixed(3),
					'w',
					w.toFixed(2),
				);
			prevTarget.current.copy(s.target);
			logT.current += dt;
			if (logT.current > 0.25) {
				logT.current = 0;
				console.info(
					'[ik]',
					'w',
					w.toFixed(2),
					'tw',
					targetWeight.toFixed(2),
					'hit',
					hitName,
					'dist',
					rawDist.toFixed(3),
					'reach',
					reach.toFixed(3),
				);
			}
		}
		s.q.setFromAxisAngle(s.axis, a);
		s.bicepDir.copy(s.dHat).applyQuaternion(s.q).normalize();

		const rq = restQ.current!;
		bicep.quaternion.copy(rq.bicep);
		forearm.quaternion.copy(rq.forearm);
		wrist.quaternion.copy(rq.wrist);
		bicep.updateMatrixWorld(true);
		bicep.getWorldPosition(s.B);
		forearm.getWorldPosition(s.F);
		s.curB.subVectors(s.F, s.B).normalize();
		s.swing.setFromUnitVectors(s.curB, s.bicepDir);
		swingBone(bicep, w);

		forearm.getWorldPosition(s.F);
		wrist.getWorldPosition(s.E);
		s.curF.subVectors(s.E, s.F).normalize();
		s.wantF.subVectors(s.target, s.F).normalize();
		s.swing.setFromUnitVectors(s.curF, s.wantF);
		swingBone(forearm, w);

		if (ARM_IK.wristAlign) {
			// minimal-rotation swing: bring the palm onto the wall without
			// forcing a finger-up basis (that was cranking the wrist).
			s.nIn.copy(s.normal).multiplyScalar(-1);
			wrist.getWorldQuaternion(s.curWorld);
			s.up.copy(s.palmL).applyQuaternion(s.curWorld).normalize();
			s.swing.setFromUnitVectors(s.up, s.nIn);
			s.desired.copy(s.swing).multiply(s.curWorld);
			if (wrist.parent) wrist.parent.getWorldQuaternion(s.parentWorld);
			else s.parentWorld.identity();
			s.local.copy(s.parentWorld).invert().multiply(s.desired);
			wrist.quaternion.slerp(s.local, w);
			wrist.updateMatrixWorld(true);
		}

		if (ARM_IK.debugLog) {
			wrist.getWorldPosition(s.E);
			const v3 = (v: THREE.Vector3) =>
				`${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
			if (prevWristSet.current) {
				const wj = s.E.distanceTo(prevWrist.current);
				if (wj > 0.03)
					console.info(
						'[ik] WRIST JUMP',
						wj.toFixed(4),
						'w',
						w.toFixed(3),
						'| wrist',
						v3(s.E),
						'anchor',
						v3(s.anchor),
						'wErr',
						s.E.distanceTo(s.anchor).toFixed(3),
						'B',
						v3(s.B),
						'distA',
						s.B.distanceTo(s.anchor).toFixed(3),
						'maxreach',
						(l1 + l2).toFixed(3),
					);
			}
			prevWrist.current.copy(s.E);
			prevWristSet.current = true;
		}
	});
}
