import * as THREE from 'three';
import type { PartSet } from './armor';
import { BODY_BASE, hiddenSlotsFor } from './armor';

// three's GLTFLoader invents 'mesh_0', 'mesh_1', ... for meshes the glTF left
// unnamed, so an absent slot name never reads as empty at runtime. Treat those
// generated names as missing and fall back to the wrapper node gltfpack parked
// the real slot name on.
const GENERATED_NAME = /^mesh_\d+$/;

export function slotNameOf(o: THREE.Object3D): string {
	if (o.name && !GENERATED_NAME.test(o.name)) return o.name;
	return o.parent?.name || o.name || '';
}

export function applyPartVisibility(
	scene: THREE.Object3D,
	equipped: Set<string>,
	hide?: Set<string>,
	bodySet?: Exclude<PartSet, 'KNGT'>,
): void {
	const hidden = hiddenSlotsFor(equipped);
	if (bodySet) for (const n of BODY_BASE) hidden.add(n);
	scene.traverse((o) => {
		if (!(o as THREE.Mesh).isMesh) return;
		const slot = slotNameOf(o);
		if (slot === 'SKIN_WRAP' && !bodySet) return;
		o.visible = !hidden.has(slot) && !hide?.has(slot);
	});
}
