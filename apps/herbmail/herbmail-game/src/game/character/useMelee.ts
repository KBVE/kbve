import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { solidAt } from '../level';
import { SWING, emitContact, subscribeSwing } from './melee';

export function useMelee(): void {
	const scene = useThree((s) => s.scene);
	const swingT = useRef(-1);
	const hitDone = useRef(false);

	const s = useRef({
		base: new THREE.Vector3(),
		tip: new THREE.Vector3(),
		tipExt: new THREE.Vector3(),
		p: new THREE.Vector3(),
		box: new THREE.Box3(),
	});
	// resolved once per swing — no per-frame scene traversal (that hitched).
	const pivotRef = useRef<THREE.Object3D | null>(null);
	const targets = useRef<THREE.Object3D[]>([]);
	const boxes = useRef<THREE.Box3[]>([]);

	useEffect(
		() =>
			subscribeSwing(() => {
				swingT.current = 0;
				hitDone.current = false;
				resolve();
			}),
		[],
	);

	function resolve(): void {
		let pivot: THREE.Object3D | null = null;
		const found: THREE.Object3D[] = [];
		scene.traverse((o) => {
			if (o.name === 'weaponPivot') pivot = o;
			if (o.userData.hitbox) found.push(o);
		});
		pivotRef.current = pivot;
		targets.current = found;
		// static AABBs captured once (targets don't move mid-swing)
		boxes.current = found.map((o) => new THREE.Box3().setFromObject(o));
	}

	useFrame((_, dtRaw) => {
		if (swingT.current < 0) return;
		const dt = Math.min(dtRaw, 0.05);
		const t = swingT.current;
		swingT.current += dt;

		if (t < SWING.hotStart || t > SWING.hotEnd) {
			if (t > SWING.hotEnd + 0.1) swingT.current = -1;
			return;
		}
		if (hitDone.current) return;

		const pivot = pivotRef.current;
		const inner = pivot?.children[0];
		if (!pivot || !inner) return;

		const st = s.current;
		pivot.getWorldPosition(st.base); // grip / hand
		inner.localToWorld(st.tip.set(0, 0, 0)); // blade tip
		// extend past the visual tip so slightly-far targets still connect
		st.tipExt.subVectors(st.tip, st.base);
		const len = st.tipExt.length() || 1;
		st.tipExt.multiplyScalar((len + SWING.hitReach) / len).add(st.base);

		for (let i = 0; i <= SWING.samples; i++) {
			st.p.lerpVectors(st.base, st.tipExt, i / SWING.samples);
			if (solidAt(st.p.x, st.p.z)) {
				hitDone.current = true;
				emitContact({ point: [st.p.x, st.p.y, st.p.z], kind: 'wall' });
				return;
			}
			for (let j = 0; j < boxes.current.length; j++) {
				if (boxes.current[j].containsPoint(st.p)) {
					hitDone.current = true;
					emitContact({
						point: [st.p.x, st.p.y, st.p.z],
						kind: 'target',
						object: targets.current[j],
					});
					return;
				}
			}
		}
	});
}
