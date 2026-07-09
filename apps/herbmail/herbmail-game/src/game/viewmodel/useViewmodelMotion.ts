import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { MOTION, type ViewmodelRest } from './config';
import type { Impulse } from './equipment';

function damp(cur: number, target: number, lambda: number, dt: number) {
	return THREE.MathUtils.damp(cur, target, lambda, dt);
}

export interface MotionApi {
	trigger: (imp: Impulse) => void;
}

export function useViewmodelMotion(
	group: React.RefObject<THREE.Object3D | null>,
	restRef: React.RefObject<ViewmodelRest>,
): MotionApi {
	const camera = useThree((s) => s.camera);

	const t = useRef(0);
	const prevPos = useRef(new THREE.Vector3());
	const prevYaw = useRef(0);
	const prevPitch = useRef(0);
	const seeded = useRef(false);

	const walk = useRef(0);
	const walkPhase = useRef(0);
	const swayX = useRef(0);
	const swayY = useRef(0);

	const recoil = useRef({ back: 0, kick: 0, roll: 0, push: 0 });

	const tmpPos = useRef(new THREE.Vector3());
	const tmpEuler = useRef(new THREE.Euler());
	const tmpQuat = useRef(new THREE.Quaternion());
	const dbg = useRef(0);

	useFrame((_, dtRaw) => {
		const g = group.current;
		const rest = restRef.current;
		if (!g || !rest) return;
		const dt = Math.min(dtRaw, 0.05);
		t.current += dt;

		const euler = new THREE.Euler().setFromQuaternion(
			camera.quaternion,
			'YXZ',
		);
		if (!seeded.current) {
			prevPos.current.copy(camera.position);
			prevYaw.current = euler.y;
			prevPitch.current = euler.x;
			seeded.current = true;
		}

		const speed =
			camera.position.distanceTo(prevPos.current) / Math.max(dt, 1e-4);
		prevPos.current.copy(camera.position);
		const targetWalk = THREE.MathUtils.clamp(speed / 3.2, 0, 1);
		walk.current = damp(walk.current, targetWalk, MOTION.walkLerp, dt);

		const dYaw = euler.y - prevYaw.current;
		const dPitch = euler.x - prevPitch.current;
		prevYaw.current = euler.y;
		prevPitch.current = euler.x;
		swayX.current = damp(
			swayX.current,
			THREE.MathUtils.clamp(-dYaw / dt / 12, -1, 1),
			MOTION.swayLerp,
			dt,
		);
		swayY.current = damp(
			swayY.current,
			THREE.MathUtils.clamp(-dPitch / dt / 12, -1, 1),
			MOTION.swayLerp,
			dt,
		);

		walkPhase.current += dt * MOTION.walkBobFreq * (0.4 + walk.current);

		const idle = 1 - walk.current;
		const idleBob =
			Math.sin(t.current * MOTION.idleBobFreq) * MOTION.idleBobAmp;
		const idleSway =
			Math.sin(t.current * MOTION.idleBobFreq * 0.5) * MOTION.idleSwayAmp;
		const walkBobY =
			Math.sin(walkPhase.current * 2) * MOTION.walkBobAmp * walk.current;
		const walkBobX =
			Math.cos(walkPhase.current) * MOTION.walkBobAmp * walk.current;

		const r = recoil.current;
		r.back = damp(r.back, 0, MOTION.springBack, dt);
		r.kick = damp(r.kick, 0, MOTION.springBack, dt);
		r.roll = damp(r.roll, 0, MOTION.springBack, dt);
		r.push = damp(r.push, 0, MOTION.springBack, dt);

		const localPos = tmpPos.current.set(
			rest.px +
				swayX.current * MOTION.swayPos +
				walkBobX +
				idleSway * idle,
			rest.py +
				swayY.current * MOTION.swayPos +
				walkBobY +
				idleBob * idle +
				r.kick * MOTION.recoilKick,
			rest.pz + r.back * MOTION.recoilBack - r.push * MOTION.reachPush,
		);
		const localQuat = tmpQuat.current.setFromEuler(
			tmpEuler.current.set(
				rest.rx + swayY.current * MOTION.swayRot,
				rest.ry + swayX.current * MOTION.swayRot,
				rest.rz + r.roll * MOTION.recoilRoll,
			),
		);

		g.quaternion.copy(camera.quaternion).multiply(localQuat);
		g.position
			.copy(camera.position)
			.add(localPos.applyQuaternion(camera.quaternion));
		g.scale.setScalar(rest.scale);

		dbg.current += dt;
		if (dbg.current > 1) {
			dbg.current = 0;
			console.info(
				'[vm]',
				'gpos',
				g.position.toArray().map((n) => +n.toFixed(2)),
				'cam',
				camera.position.toArray().map((n) => +n.toFixed(2)),
				'children',
				g.children.length,
				'inScene',
				!!g.parent,
				'scale',
				+rest.scale.toFixed(3),
			);
		}
	});

	return {
		trigger: (imp: Impulse) => {
			const r = recoil.current;
			r.back = Math.max(r.back, imp.back);
			r.kick = Math.max(r.kick, imp.kick);
			r.roll = imp.roll;
			r.push = Math.max(r.push, imp.push);
		},
	};
}
