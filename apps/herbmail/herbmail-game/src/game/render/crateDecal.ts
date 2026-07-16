import * as THREE from 'three';
import { Health } from '../mecs/props';
import { crackStage } from '../prop/crate';

// Damage decals overlaid on a crate: a slightly-oversized cube carrying the crack
// texture on every face. Kept transparent + unlit so only the dark crack pixels
// read, over the crate's own lit material. Stage 0 hides it; 1/2 swap in heavier
// cracks. Textures are shared; each decal owns a cloned material so crates can sit
// at different damage without cross-talk.
const loader = new THREE.TextureLoader();

function crackTex(url: string): THREE.Texture {
	const t = loader.load(url);
	t.magFilter = THREE.NearestFilter;
	t.minFilter = THREE.NearestFilter;
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

const STAGE_TEX: (THREE.Texture | null)[] = [
	null,
	crackTex('/textures/crate_crack1.png'),
	crackTex('/textures/crate_crack2.png'),
];

const DECAL_GEO = new THREE.BoxGeometry(1.22, 1.22, 1.22);

export function makeCrackDecal(): THREE.Mesh {
	const mat = new THREE.MeshBasicMaterial({
		transparent: true,
		depthWrite: false,
		alphaTest: 0.35,
	});
	const mesh = new THREE.Mesh(DECAL_GEO, mat);
	mesh.visible = false;
	mesh.userData.crackStage = 0;
	mesh.userData.crackDecal = true;
	// DECAL_GEO is a shared module singleton; only the material is per-decal.
	mesh.userData.sharedGeo = true;
	return mesh;
}

export function setCrackStage(decal: THREE.Mesh, stage: number): void {
	if (decal.userData.crackStage === stage) return;
	decal.userData.crackStage = stage;
	const mat = decal.material as THREE.MeshBasicMaterial;
	mat.map = STAGE_TEX[stage] ?? null;
	mat.needsUpdate = true;
	decal.visible = stage > 0;
}

// Drive each live crate's crack decal from its Health. Cheap enough to run every
// frame (setCrackStage no-ops when the stage is unchanged), so damage shows the
// instant hp drops without a bump/reconcile.
export function applyCrateDamage(eid: number, group: THREE.Object3D): void {
	const decal = group.userData.crackDecalRef as THREE.Mesh | undefined;
	if (decal) setCrackStage(decal, crackStage(Health.hp[eid]));
}
