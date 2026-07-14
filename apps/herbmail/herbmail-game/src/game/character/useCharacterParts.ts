import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { hiddenSlotsFor, setsFor, useEquippedArmor } from './armor';
import { attachPartSet } from './partsLoader';

/**
 * Toggles SIDEKICK slot meshes by equipped state. Each part is its own named
 * SkinnedMesh sharing the rig, so hiding a piece is a pure visibility flip —
 * no re-rig, no clip change. Pieces from lazy part sets are fetched and bound
 * onto the rig on first equip, then re-toggled like the baked-in knight. Pass
 * `override` to drive visibility from an explicit loadout (codex presets)
 * instead of the shared gameplay store.
 */
export function useCharacterParts(
	scene: THREE.Object3D,
	override?: Set<string>,
	hide?: Set<string>,
): void {
	const global = useEquippedArmor();
	const equipped = override ?? global;
	const [attached, setAttached] = useState(0);
	useEffect(() => {
		const sets = setsFor(equipped);
		if (!sets.length) return;
		let live = true;
		Promise.all(sets.map((s) => attachPartSet(scene, s))).then(() => {
			if (live) setAttached((n) => n + 1);
		});
		return () => {
			live = false;
		};
	}, [scene, equipped]);
	useEffect(() => {
		const hidden = hiddenSlotsFor(equipped);
		scene.traverse((o) => {
			// SKIN_WRAP (the bra) is owned by the body-morph gate, not armor.
			if (o.name === 'SKIN_WRAP') return;
			if ((o as THREE.Mesh).isMesh)
				o.visible = !hidden.has(o.name) && !hide?.has(o.name);
		});
	}, [scene, equipped, attached, hide]);
}
