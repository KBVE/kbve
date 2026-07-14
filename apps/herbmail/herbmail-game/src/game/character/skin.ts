import { useEffect, useSyncExternalStore } from 'react';
import * as THREE from 'three';

// Meshes that show bare skin: the SIDEKICK body panels plus the face parts that
// read as flesh. Eyes/teeth/tongue/hair keep their own materials so a goblin
// still has white eyes and red tongue.
const SKIN_TINT_MESHES = new Set([
	'SKIN_TORS',
	'SKIN_HIPS',
	'SKIN_LEGL',
	'SKIN_LEGR',
	'SKIN_HNDL',
	'SKIN_HNDR',
	'SKIN_FOTL',
	'SKIN_FOTR',
	'SKIN_AUPL',
	'SKIN_AUPR',
	'SKIN_ALWL',
	'SKIN_ALWR',
	'HEAD',
	'EARL',
	'EARR',
	'NOSE',
]);

export interface SkinTone {
	id: string;
	label: string;
	tint: string;
}

// Tints multiply the authored skin colormap (light tan), so they must sit
// brighter than the target color reads on screen.
export const SKIN_TONES: SkinTone[] = [
	{ id: 'human', label: 'Human', tint: '#ffffff' },
	{ id: 'goblin', label: 'Goblin', tint: '#7cb35a' },
	{ id: 'orc', label: 'Orc', tint: '#5e8a4a' },
	{ id: 'undead', label: 'Undead', tint: '#9aa8b5' },
	{ id: 'demon', label: 'Demon', tint: '#c05a4a' },
];

let tone = SKIN_TONES[0];
const listeners = new Set<() => void>();

export function setSkinTone(id: string): void {
	const next = SKIN_TONES.find((t) => t.id === id);
	if (!next || next === tone) return;
	tone = next;
	for (const l of listeners) l();
}

export function getSkinTone(): SkinTone {
	return tone;
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export function useSkinTone(): SkinTone {
	return useSyncExternalStore(subscribe, getSkinTone, getSkinTone);
}

// SkeletonUtils.clone shares materials with the cached GLTF, so the first tint
// clones each skin material once per instance (marked via userData) before
// touching color — other characters and the codex preview stay unaffected.
export function applySkinTint(scene: THREE.Object3D, tint: string): void {
	const clones = new Map<THREE.Material, THREE.MeshStandardMaterial>();
	scene.traverse((o) => {
		const mesh = o as THREE.Mesh;
		if (!mesh.isMesh || !SKIN_TINT_MESHES.has(mesh.name)) return;
		let m = mesh.material as THREE.MeshStandardMaterial;
		if (!m.userData.skinTint) {
			const c =
				clones.get(m) ?? (m.clone() as THREE.MeshStandardMaterial);
			c.userData.skinTint = true;
			clones.set(m, c);
			mesh.material = c;
			m = c;
		}
		m.color.set(tint);
	});
}

// NPCs pass a fixed override; the player omits it and follows the tone store.
export function useSkinTint(scene: THREE.Object3D, override?: string): void {
	const t = useSkinTone();
	const tint = override ?? t.tint;
	useEffect(() => applySkinTint(scene, tint), [scene, tint]);
}
