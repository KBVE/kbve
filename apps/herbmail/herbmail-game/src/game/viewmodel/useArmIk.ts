import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ARM_IK, type ArmSide } from './config';
import { getEquippedId } from './store';
import { equipmentById } from './equipment';

function norm(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface Bones {
	shoulder: THREE.Bone;
	bicep: THREE.Bone;
	forearm: THREE.Bone;
	wrist: THREE.Bone;
}

function makeLabel(
	text: string,
	dir: [number, number, number],
	color = '#39ff14',
	scale = 0.7,
	distance = 1.15,
): THREE.Sprite {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = 'rgba(0,0,0,0.75)';
	ctx.beginPath();
	ctx.arc(64, 64, 60, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = color;
	const size = text.length > 1 ? 52 : 88;
	ctx.font = `bold ${size}px monospace`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(text, 64, 70);
	const tex = new THREE.CanvasTexture(c);
	const mat = new THREE.SpriteMaterial({
		map: tex,
		depthTest: false,
		depthWrite: false,
		transparent: true,
	});
	const sp = new THREE.Sprite(mat);
	sp.position.set(dir[0] * distance, dir[1] * distance, dir[2] * distance);
	sp.scale.setScalar(scale);
	sp.renderOrder = 1002;
	sp.raycast = () => undefined;
	return sp;
}

const DIRS: Array<[number, number, number]> = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1],
];

function findBones(root: THREE.Object3D, side: ArmSide): Bones | null {
	const want = {
		shoulder: norm(side.shoulder),
		bicep: norm(side.bicep),
		forearm: norm(side.forearm),
		wrist: norm(side.wrist),
	};
	const found: Partial<Bones> = {};
	root.traverse((o) => {
		if (!(o as THREE.Bone).isBone) return;
		const n = norm(o.name);
		if (n === want.shoulder) found.shoulder = o as THREE.Bone;
		else if (n === want.bicep) found.bicep = o as THREE.Bone;
		else if (n === want.forearm) found.forearm = o as THREE.Bone;
		else if (n === want.wrist) found.wrist = o as THREE.Bone;
	});
	if (found.shoulder && found.bicep && found.forearm && found.wrist)
		return found as Bones;
	return null;
}

const clamp = THREE.MathUtils.clamp;

export function useArmIk(
	group: React.RefObject<THREE.Object3D | null>,
	sceneRoot: React.RefObject<THREE.Object3D | null>,
	side: ArmSide,
) {
	const camera = useThree((s) => s.camera);
	const scene = useThree((s) => s.scene);

	const bonesRef = useRef<Bones | null>(null);
	const restQ = useRef<{
		shoulder: THREE.Quaternion;
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
	const prevS = useRef({ q: new THREE.Quaternion(), primed: false });
	const prevB = useRef({ q: new THREE.Quaternion(), primed: false });
	const prevF = useRef({ q: new THREE.Quaternion(), primed: false });
	const prevW = useRef({ q: new THREE.Quaternion(), primed: false });

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
			camRight: new THREE.Vector3(),
			fingerL: new THREE.Vector3(...ARM_IK.fingerLocal).normalize(),
			palmL: new THREE.Vector3(...side.palmLocal).normalize(),
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
			roll: new THREE.Quaternion(),
			curWorld: new THREE.Quaternion(),
			parentWorld: new THREE.Quaternion(),
			desired: new THREE.Quaternion(),
			local: new THREE.Quaternion(),
			idleS: new THREE.Quaternion(),
			idleB: new THREE.Quaternion(),
			idleF: new THREE.Quaternion(),
			idleW: new THREE.Quaternion(),
			sp: new THREE.Vector3(),
			curS: new THREE.Vector3(),
			aimS: new THREE.Vector3(),
		}),
		[],
	);

	useEffect(() => {
		bonesRef.current = null;
	}, [group]);

	function applyLocal(
		bone: THREE.Bone,
		target: THREE.Quaternion,
		prev: { q: THREE.Quaternion; primed: boolean },
		dt: number,
	) {
		if (ARM_IK.outputLerp > 0 && prev.primed) {
			const k = 1 - Math.exp(-ARM_IK.outputLerp * dt);
			bone.quaternion.copy(prev.q).slerp(target, k);
		} else {
			bone.quaternion.copy(target);
		}
		prev.q.copy(bone.quaternion);
		prev.primed = true;
		bone.updateMatrixWorld(true);
	}

	function swingBone(
		bone: THREE.Bone,
		w: number,
		idleBase: THREE.Quaternion,
		prev: { q: THREE.Quaternion; primed: boolean },
		dt: number,
	) {
		bone.getWorldQuaternion(s.curWorld);
		s.desired.copy(s.swing).multiply(s.curWorld);
		if (bone.parent) bone.parent.getWorldQuaternion(s.parentWorld);
		else s.parentWorld.identity();
		s.local.copy(s.parentWorld).invert().multiply(s.desired);
		s.desired.copy(idleBase).slerp(s.local, w);
		applyLocal(bone, s.desired, prev, dt);
	}

	useFrame((_, dtRaw) => {
		if (!ARM_IK.enabled) return;
		const g = group.current;
		if (!g) return;

		if (!bonesRef.current) {
			bonesRef.current = findBones(g, side);
			if (!bonesRef.current) return;
			restQ.current = {
				shoulder: bonesRef.current.shoulder.quaternion.clone(),
				bicep: bonesRef.current.bicep.quaternion.clone(),
				forearm: bonesRef.current.forearm.quaternion.clone(),
				wrist: bonesRef.current.wrist.quaternion.clone(),
			};
			if (ARM_IK.debugAxes && side.debug) {
				const joints: Array<keyof Bones> = [
					'shoulder',
					'bicep',
					'forearm',
					'wrist',
				];
				for (const key of joints) {
					const bone = bonesRef.current[key];
					const ax = new THREE.AxesHelper(1.2);
					const mat = ax.material as THREE.Material;
					mat.depthTest = false;
					mat.depthWrite = false;
					ax.renderOrder = 1001;
					ax.raycast = () => undefined;
					bone.add(ax);
					const letters = side.labels[key];
					for (let i = 0; i < DIRS.length; i++) {
						bone.add(makeLabel(letters[i], DIRS[i]));
					}
				}
			}
		}
		const { shoulder, bicep, forearm, wrist } = bonesRef.current;
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
		const held = equipmentById(getEquippedId()).kind !== 'empty';
		const gate = side.requiresHeld ? held : !held;
		const active = gate && (!ARM_IK.holdToReach || reachHeld.current);

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
		if (w < 0.001) {
			prevS.current.primed = false;
			prevB.current.primed = false;
			prevF.current.primed = false;
			prevW.current.primed = false;
			return;
		}

		// capture idle bases (release blends back to these, not the frozen ref)
		s.idleS.copy(shoulder.quaternion);
		s.idleB.copy(bicep.quaternion);
		s.idleF.copy(forearm.quaternion);
		s.idleW.copy(wrist.quaternion);

		// reset the arm to the frozen reference for a stable solve
		const rq = restQ.current;
		if (!rq) return;
		bicep.quaternion.copy(rq.bicep);
		forearm.quaternion.copy(rq.forearm);
		wrist.quaternion.copy(rq.wrist);

		// shoulder: optional partial aim toward target so the whole arm
		// participates (off at 0 -> clean 2-bone placement).
		if (ARM_IK.shoulderFrac > 0) {
			shoulder.quaternion.copy(rq.shoulder);
			shoulder.updateMatrixWorld(true);
			shoulder.getWorldPosition(s.sp);
			bicep.getWorldPosition(s.B);
			s.curS.subVectors(s.B, s.sp).normalize();
			s.aimS.subVectors(s.target, s.sp).normalize();
			s.swing.setFromUnitVectors(s.curS, s.aimS);
			s.q.identity().slerp(s.swing, ARM_IK.shoulderFrac);
			s.swing.copy(s.q);
			swingBone(shoulder, w, s.idleS, prevS.current, dt);
		} else {
			bicep.updateMatrixWorld(true);
		}

		// recompute reach geometry from the (possibly moved) bicep base
		bicep.getWorldPosition(s.B);
		forearm.getWorldPosition(s.F);
		wrist.getWorldPosition(s.E);
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

		// view-relative bend pole: elbow drops down + toward your right, so it
		// stays natural whatever direction you face (world-fixed pole did not).
		s.camRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
		s.pole
			.set(0, -1, 0)
			.addScaledVector(s.camRight, ARM_IK.poleOut * side.poleOutSign)
			.addScaledVector(s.dir, -ARM_IK.poleBack)
			.normalize();

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

		s.curB.subVectors(s.F, s.B).normalize();
		s.swing.setFromUnitVectors(s.curB, s.bicepDir);
		swingBone(bicep, w, s.idleB, prevB.current, dt);

		forearm.getWorldPosition(s.F);
		wrist.getWorldPosition(s.E);
		s.curF.subVectors(s.E, s.F).normalize();
		s.wantF.subVectors(s.target, s.F).normalize();
		s.swing.setFromUnitVectors(s.curF, s.wantF);
		swingBone(forearm, w, s.idleF, prevF.current, dt);

		if (ARM_IK.wristAlign) {
			// minimal-rotation swing: bring the palm onto the wall without
			// forcing a finger-up basis (that was cranking the wrist).
			s.nIn.copy(s.normal).multiplyScalar(-1);
			wrist.getWorldQuaternion(s.curWorld);
			s.up.copy(s.palmL).applyQuaternion(s.curWorld).normalize();
			s.swing.setFromUnitVectors(s.up, s.nIn);
			// joint limit: cap how far the palm can rotate off the forearm so
			// the wrist never bends/twists past a natural range (no break).
			const ang = 2 * Math.acos(clamp(Math.abs(s.swing.w), -1, 1));
			if (ang > ARM_IK.wristMax) {
				s.q.identity();
				s.swing.copy(s.q).slerp(s.swing, ARM_IK.wristMax / ang);
			}
			s.desired.copy(s.swing).multiply(s.curWorld);
			if (ARM_IK.wristRoll) {
				s.roll.setFromAxisAngle(s.nIn, ARM_IK.wristRoll);
				s.desired.premultiply(s.roll);
			}
			if (wrist.parent) wrist.parent.getWorldQuaternion(s.parentWorld);
			else s.parentWorld.identity();
			s.local.copy(s.parentWorld).invert().multiply(s.desired);
			s.desired.copy(s.idleW).slerp(s.local, w);
			applyLocal(wrist, s.desired, prevW.current, dt);
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
