import { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { PartSet } from './armor';
import { BODY_BASE, hiddenSlotsFor, setsFor, useEquippedArmor } from './armor';
import { attachPartSet } from './partsLoader';

export function useCharacterParts(
	scene: THREE.Object3D,
	override?: Set<string>,
	hide?: Set<string>,
	bodySet?: Exclude<PartSet, 'KNGT'>,
): void {
	const global = useEquippedArmor();
	const equipped = override ?? global;
	const [attached, setAttached] = useState(0);
	useEffect(() => {
		const sets = setsFor(equipped);
		if (bodySet) sets.push(bodySet);
		if (!sets.length) return;
		let live = true;
		Promise.all(sets.map((s) => attachPartSet(scene, s))).then(() => {
			if (live) setAttached((n) => n + 1);
		});
		return () => {
			live = false;
		};
	}, [scene, equipped, bodySet]);
	useEffect(() => {
		const hidden = hiddenSlotsFor(equipped);
		if (bodySet) for (const n of BODY_BASE) hidden.add(n);
		scene.traverse((o) => {
			if (o.name === 'SKIN_WRAP' && !bodySet) return;
			if ((o as THREE.Mesh).isMesh)
				o.visible = !hidden.has(o.name) && !hide?.has(o.name);
		});
	}, [scene, equipped, attached, hide, bodySet]);
}
