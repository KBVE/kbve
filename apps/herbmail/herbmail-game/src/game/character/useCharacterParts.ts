import { useEffect } from 'react';
import * as THREE from 'three';
import { hiddenSlotsFor, useEquippedArmor } from './armor';

/**
 * Toggles SIDEKICK slot meshes by equipped state. Each part is its own named
 * SkinnedMesh sharing the rig, so hiding a piece is a pure visibility flip —
 * no re-rig, no clip change. Pass `override` to drive visibility from an
 * explicit loadout (codex presets) instead of the shared gameplay store.
 */
export function useCharacterParts(
	scene: THREE.Object3D,
	override?: Set<string>,
): void {
	const global = useEquippedArmor();
	const equipped = override ?? global;
	useEffect(() => {
		const hidden = hiddenSlotsFor(equipped);
		scene.traverse((o) => {
			// SKIN_WRAP (the bra) is owned by the body-morph gate, not armor.
			if (o.name === 'SKIN_WRAP') return;
			if ((o as THREE.Mesh).isMesh) o.visible = !hidden.has(o.name);
		});
	}, [scene, equipped]);
}
