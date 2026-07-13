import { useEffect } from 'react';
import * as THREE from 'three';
import { hiddenSlots, useEquippedArmor } from './armor';

/**
 * Toggles SIDEKICK slot meshes by equipped state. Each part is its own named
 * SkinnedMesh sharing the rig, so hiding a piece is a pure visibility flip —
 * no re-rig, no clip change.
 */
export function useCharacterParts(scene: THREE.Object3D): void {
	const equipped = useEquippedArmor();
	useEffect(() => {
		const hidden = hiddenSlots();
		scene.traverse((o) => {
			// SKIN_WRAP (the bra) is owned by the body-morph gate, not armor.
			if (o.name === 'SKIN_WRAP') return;
			if ((o as THREE.Mesh).isMesh) o.visible = !hidden.has(o.name);
		});
	}, [scene, equipped]);
}
