import * as THREE from 'three';

// A "semi-accurate" blob: not a circle, a humanoid silhouette baked once into a
// texture — head, shoulders, torso, two legs — with soft edges. One quad, one
// draw, no skinning and no second render of the character, but from above it
// reads as a person's shadow rather than a puddle.
//
// The quad is oriented and stretched away from the nearest torch at runtime
// (see Character), which is what sells it: the shape swings and lengthens as
// you walk past a flame, exactly like a real cast shadow would.
const TEX = 128;

function ellipse(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	a: number,
): void {
	ctx.save();
	ctx.globalAlpha = a;
	ctx.beginPath();
	ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

// Figure points "up" in +V so the quad can be rotated to aim away from the
// light: feet near the top (the character's own position), head at the far end.
function drawFigure(ctx: CanvasRenderingContext2D): void {
	const s = TEX;
	ctx.fillStyle = '#000';
	const midX = s * 0.5;

	// Legs — two lobes, slightly apart, nearest the character's feet.
	ellipse(ctx, midX - s * 0.075, s * 0.3, s * 0.062, s * 0.15, 1);
	ellipse(ctx, midX + s * 0.075, s * 0.3, s * 0.062, s * 0.15, 1);
	// Pelvis / torso.
	ellipse(ctx, midX, s * 0.47, s * 0.115, s * 0.14, 1);
	// Shoulders, a touch wider.
	ellipse(ctx, midX, s * 0.6, s * 0.145, s * 0.085, 1);
	// Arms.
	ellipse(ctx, midX - s * 0.15, s * 0.56, s * 0.05, s * 0.11, 0.95);
	ellipse(ctx, midX + s * 0.15, s * 0.56, s * 0.05, s * 0.11, 0.95);
	// Head.
	ellipse(ctx, midX, s * 0.72, s * 0.072, s * 0.072, 1);
}

function makeFigureTexture(): THREE.Texture {
	const cv = document.createElement('canvas');
	cv.width = TEX;
	cv.height = TEX;
	const ctx = cv.getContext('2d');
	if (!ctx) return new THREE.Texture();

	// Draw the figure into an offscreen pass, blur it by redrawing at low alpha
	// with small offsets, so the silhouette is soft the way torchlight is.
	drawFigure(ctx);
	const blurred = document.createElement('canvas');
	blurred.width = TEX;
	blurred.height = TEX;
	const bctx = blurred.getContext('2d');
	if (bctx) {
		bctx.filter = 'blur(5px)';
		bctx.drawImage(cv, 0, 0);
		bctx.filter = 'none';
		// A second, wider pass gives the penumbra a longer tail.
		bctx.globalAlpha = 0.5;
		bctx.filter = 'blur(11px)';
		bctx.drawImage(cv, 0, 0);
	}

	const tex = new THREE.CanvasTexture(bctx ? blurred : cv);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.needsUpdate = true;
	return tex;
}

let geo: THREE.PlaneGeometry | null = null;
let mat: THREE.MeshBasicMaterial | null = null;

export function blobGeometry(): THREE.PlaneGeometry {
	// Pivot at the feet end, not the centre, so stretching the shadow away from
	// the light grows it outward instead of sliding it through the character.
	if (!geo) {
		geo = new THREE.PlaneGeometry(1, 1);
		geo.translate(0, 0.5, 0);
	}
	return geo;
}

export function blobMaterial(): THREE.MeshBasicMaterial {
	if (!mat)
		mat = new THREE.MeshBasicMaterial({
			map: makeFigureTexture(),
			transparent: true,
			opacity: 0.55,
			depthWrite: false,
			color: 0x000000,
		});
	return mat;
}

// Per-character clone: opacity is animated per body (distance to its own
// nearest torch), so they cannot share one material — but the texture is the
// shared one, so this stays a single upload.
export function makeBlobMaterial(): THREE.MeshBasicMaterial {
	return blobMaterial().clone();
}
