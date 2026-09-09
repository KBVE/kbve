import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { solidAt } from '../level';
import { SWING, emitContact, subscribeSwing, type SwingSource } from './melee';

export function useMelee(): void {
	const scene = useThree((s) => s.scene);
	const swingT = useRef(-1);
	const hitDone = useRef(false);
	const fist = useRef<string | null>(null);
	const fistReach = useRef(0.4);

	const s = useRef({
		base: new THREE.Vector3(),
		tip: new THREE.Vector3(),
		tipExt: new THREE.Vector3(),
		p: new THREE.Vector3(),
		box: new THREE.Box3(),
	});

	const pivotRef = useRef<THREE.Object3D | null>(null);
	const targets = useRef<THREE.Object3D[]>([]);
	const boxes = useRef<THREE.Box3[]>([]);

	useEffect(
		() =>
			subscribeSwing((src: SwingSource) => {
				swingT.current = 0;
				hitDone.current = false;
				fist.current = src.fistBone ?? null;
				fistReach.current = src.reach ?? 0.4;
				resolve();
			}),
		[],
	);

	function resolve(): void {
		let pivot: THREE.Object3D | null = null;
		const found: THREE.Object3D[] = [];
		scene.traverse((o) => {
			if (o.name === 'weaponPivot') pivot = o;
			if (fist.current && o.name === fist.current) pivot = o;
			if (o.userData.hitbox) found.push(o);
		});
		pivotRef.current = pivot;
		targets.current = found;

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
		if (!pivot) return;

		const st = s.current;

		if (fist.current) {
			pivot.getWorldPosition(st.base);
			if (solidAt(st.base.x, st.base.z)) {
				hitDone.current = true;
				emitContact({
					point: [st.base.x, st.base.y, st.base.z],
					kind: 'wall',
				});
				return;
			}
			for (let j = 0; j < boxes.current.length; j++) {
				if (
					boxes.current[j].distanceToPoint(st.base) <=
					fistReach.current
				) {
					hitDone.current = true;
					emitContact({
						point: [st.base.x, st.base.y, st.base.z],
						kind: 'target',
						object: targets.current[j],
					});
					return;
				}
			}
			return;
		}

		const inner = pivot.children[0];
		if (!inner) return;

		pivot.getWorldPosition(st.base);
		inner.localToWorld(st.tip.set(0, 0, 0));

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
