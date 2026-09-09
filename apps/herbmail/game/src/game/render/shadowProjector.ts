import * as THREE from 'three';

// Planar projected shadow — the PS1 technique. The character is drawn a second
// time with its world matrix pre-multiplied by a plane-projection matrix, so the
// mesh collapses onto the floor along the rays from the light. The clones share
// the source geometry AND skeleton, so the animation comes along for free: no
// second skinning path, no custom vertex shader, no shadow map.
//
// It is the real silhouette — limbs, gait, held weapon — which a textured blob
// can never be. The cost is one extra draw per shadowed mesh, and it is only
// correct on a flat floor, so callers hide it when not grounded.

// Facial detail cannot read in a flat shadow; skipping it drops ~9 draws a rig.
const SKIP = /EYE|EBR|EAR|NOSE|TETH|TONG/i;

// How far above the head the projection light must sit, as a fraction of body
// height. Below this the shadow stretches toward infinity; 0.6 keeps the worst
// case around a 3x lengthening, which still reads as a long torch-cast shadow.
const MIN_CLEARANCE = 0.6;

/**
 * Projection onto the plane y = h from a point light at L. Derived from the
 * standard shadow matrix with plane normal (0,1,0), d = -h.
 */
export function planeShadowMatrix(
	out: THREE.Matrix4,
	lx: number,
	ly: number,
	lz: number,
	h: number,
): boolean {
	// A light at or below the shadow plane inverts the projection.
	if (ly - h <= 0.05) return false;
	const nDotL = ly - h;
	// prettier-ignore
	out.set(
		nDotL, -lx,  0,     lx * h,
		0,     -h,   0,     ly * h,
		0,     -lz,  nDotL, lz * h,
		0,     -1,   0,     ly,
	);
	return true;
}

export class ShadowProjector {
	readonly group = new THREE.Group();
	private readonly pairs: {
		src: THREE.SkinnedMesh;
		clone: THREE.SkinnedMesh;
		bind: THREE.Matrix4;
	}[] = [];
	private mat: THREE.MeshBasicMaterial;
	private readonly opacity: number;
	private readonly proj = new THREE.Matrix4();
	private sourceCount = -1;

	constructor(opacity = 0.5) {
		this.opacity = opacity;
		this.mat = this.makeMaterial();
		this.group.matrixAutoUpdate = false;
		this.group.frustumCulled = false;
	}

	private makeMaterial(): THREE.MeshBasicMaterial {
		return new THREE.MeshBasicMaterial({
			color: 0x000000,
			transparent: true,
			opacity: this.opacity,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -6,
			polygonOffsetUnits: -6,
		});
	}

	// Rebuilt when the rig's mesh count changes — armor parts attach and detach
	// after the character first mounts.
	private sync(source: THREE.Object3D): void {
		let n = 0;
		source.traverse((o) => {
			if ((o as THREE.SkinnedMesh).isSkinnedMesh) n++;
		});
		if (n === this.sourceCount) return;
		this.sourceCount = n;
		// Reused after a StrictMode remount, the old material is disposed.
		if (!this.mat || this.mat.version === undefined)
			this.mat = this.makeMaterial();

		for (const p of this.pairs) this.group.remove(p.clone);
		this.pairs.length = 0;

		source.traverse((o) => {
			const sk = o as THREE.SkinnedMesh;
			if (!sk.isSkinnedMesh) return;
			if (SKIP.test(sk.name)) return;
			const clone = new THREE.SkinnedMesh(sk.geometry, this.mat);
			clone.bind(sk.skeleton, sk.bindMatrix);
			// MUST be detached. In AttachedBindMode three recomputes
			// bindMatrixInverse = inverse(matrixWorld) every frame — and our
			// matrixWorld is a plane projection, which is singular. Inverting it
			// gives a zero matrix and the skinning explodes into per-frame
			// garbage. Detached inverts bindMatrix instead, which is stable.
			clone.bindMode = THREE.DetachedBindMode;
			clone.bindMatrix.copy(sk.bindMatrix);
			clone.bindMatrixInverse.copy(sk.bindMatrix).invert();
			clone.frustumCulled = false;
			clone.castShadow = false;
			clone.receiveShadow = false;
			clone.raycast = () => undefined;
			// We drive matrixWorld directly; three must not recompute it from
			// the parent chain.
			clone.matrixAutoUpdate = false;
			clone.matrixWorldAutoUpdate = false;
			clone.renderOrder = 2;
			this.pairs.push({ src: sk, clone, bind: sk.bindMatrix.clone() });
			this.group.add(clone);
		});
	}

	update(
		source: THREE.Object3D,
		lightX: number,
		lightY: number,
		lightZ: number,
		groundY: number,
		visible: boolean,
		opacity: number,
		bodyHeight = 1.8,
	): void {
		this.group.visible = visible;
		if (!visible) return;
		this.sync(source);
		this.mat.opacity = opacity;

		// The projection divides by (lightY - vertexY). A niche candle sits at
		// roughly head height, so that denominator collapses for the upper body
		// and goes NEGATIVE above the flame — those vertices wrap through
		// infinity and smear across the floor. Lift the light used for the
		// projection clear of the head: the direction is preserved, only the
		// length is bounded.
		const head = groundY + bodyHeight;
		const safeY = Math.max(lightY, head + bodyHeight * MIN_CLEARANCE);

		// Sit the plane just above the floor; polygonOffset alone is not enough
		// once the projection stretches triangles nearly edge-on.
		if (
			!planeShadowMatrix(
				this.proj,
				lightX,
				safeY,
				lightZ,
				groundY + 0.015,
			)
		) {
			this.group.visible = false;
			return;
		}

		// With detached binding the shader produces
		//   inverse(bindMatrix) * boneMatrix * bindMatrix * position,
		// and the source's own world position works out to
		//   boneMatrix * bindMatrix * position
		// (its matrixWorld cancels against its attached bind inverse). So to
		// land on proj * worldPosition, this clone's matrixWorld must be
		// proj * bindMatrix — NOT proj * matrixWorld.
		for (const { src, clone, bind } of this.pairs) {
			// Hidden armor slots must not cast.
			clone.visible = src.visible;
			if (!clone.visible) continue;
			clone.matrixWorld.multiplyMatrices(this.proj, bind);
		}
	}

	dispose(): void {
		for (const p of this.pairs) this.group.remove(p.clone);
		this.pairs.length = 0;
		// Reset, or a StrictMode remount reuses this instance, sees the stale
		// count, early-returns from sync() and never rebuilds the clones.
		this.sourceCount = -1;
		this.mat.dispose();
	}
}
