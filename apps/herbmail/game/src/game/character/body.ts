import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import * as THREE from 'three';

export interface BodyMorph {
	masculineFeminine: number;
	buff: number;
	heavy: number;
	skinny: number;
}

export interface BodySlider {
	id: keyof BodyMorph;
	label: string;
	target: string;
}

export const BODY_SLIDERS: BodySlider[] = [
	{
		id: 'masculineFeminine',
		label: 'Masc / Fem',
		target: 'masculineFeminine',
	},
	{ id: 'buff', label: 'Buff', target: 'defaultBuff' },
	{ id: 'heavy', label: 'Heavy', target: 'defaultHeavy' },
	{ id: 'skinny', label: 'Skinny', target: 'defaultSkinny' },
];

let body: BodyMorph = {
	masculineFeminine: 0,
	buff: 0,
	heavy: 0,
	skinny: 0,
};
const listeners = new Set<() => void>();

function emit() {
	body = { ...body };
	for (const l of listeners) l();
}

export function setBodyMorph(id: keyof BodyMorph, value: number) {
	body[id] = Math.max(0, Math.min(1, value));
	emit();
}

export function getBodyMorph() {
	return body;
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

export function useBodyMorph() {
	return useSyncExternalStore(subscribe, getBodyMorph, getBodyMorph);
}

export const WRAP_FEM_THRESHOLD = 0.5;

export function useBodySkinMorph(scene: THREE.Object3D): void {
	const morph = useBodyMorph();
	useEffect(() => {
		scene.traverse((o) => {
			const mesh = o as THREE.Mesh;
			if (mesh.name === 'SKIN_WRAP')
				mesh.visible = morph.masculineFeminine >= WRAP_FEM_THRESHOLD;
			const dict = mesh.morphTargetDictionary;
			const infl = mesh.morphTargetInfluences;
			if (!dict || !infl) return;
			for (const s of BODY_SLIDERS) {
				const idx = dict[s.target];
				if (idx !== undefined) infl[idx] = morph[s.id];
			}
		});
	}, [scene, morph]);
}
