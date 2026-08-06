// Character shadows, cheap on purpose. Two halves that do different jobs:
//
//   blob — a soft quad on the ground under the character. Sells CONTACT: the
//          feet read as touching the floor even with no light nearby.
//   caps — an analytic vertical capsule tested against the light ray inside the
//          PSX fragment loop. Sells DIRECTION: the shadow swings and stretches
//          as you pass a torch, and lands on walls and stairs, not just a plane.
//
// Neither renders a shadow map. The capsule set is capped and only tested
// against the nearest lights, so the whole thing is a handful of ALU per
// fragment rather than a depth pass per caster.

export const MAX_CAPS = 4;
export const CAP_STRIDE = 4;

export type ShadowMode = 'both' | 'proj' | 'blob' | 'caps' | 'off';

let mode: ShadowMode = 'proj';
let strength = 0.75;

export function shadowMode(): ShadowMode {
	return mode;
}

export function setShadowMode(m: ShadowMode): void {
	mode = m;
}

export function shadowStrength(): number {
	return strength;
}

export function setShadowStrength(v: number): void {
	strength = v;
}

export function blobsOn(): boolean {
	return mode === 'blob';
}

// The projected mesh is the accurate ground shadow; 'both' pairs it with the
// capsule so walls get one too.
export function projOn(): boolean {
	return mode === 'proj' || mode === 'both';
}

export function capsOn(): boolean {
	return mode === 'both' || mode === 'caps';
}

// Nearest light to the player, published by LightSystem each frame. The shaped
// blob aims away from it and stretches with its elevation — that swing is what
// makes a flat quad read as a cast shadow instead of a decal.
export const nearestLight = {
	on: false,
	x: 0,
	y: 0,
	z: 0,
	intensity: 0,
};

export function setNearestLight(
	on: boolean,
	x: number,
	y: number,
	z: number,
	intensity: number,
): void {
	nearestLight.on = on;
	nearestLight.x = x;
	nearestLight.y = y;
	nearestLight.z = z;
	nearestLight.intensity = intensity;
}

interface Cap {
	x: number;
	y: number;
	z: number;
	r: number;
	h: number;
	live: boolean;
}

const caps: Cap[] = [];
const free: Cap[] = [];

export interface CharShadowHandle {
	update(x: number, y: number, z: number): void;
	release(): void;
}

export function registerCharShadow(
	radius: number,
	height: number,
): CharShadowHandle {
	const cap: Cap = { x: 0, y: 0, z: 0, r: radius, h: height, live: true };
	const reused = free.pop();
	if (reused) {
		Object.assign(reused, cap);
		return handleFor(reused);
	}
	caps.push(cap);
	return handleFor(cap);
}

function handleFor(cap: Cap): CharShadowHandle {
	return {
		update(x, y, z) {
			cap.x = x;
			cap.y = y;
			cap.z = z;
		},
		release() {
			cap.live = false;
			free.push(cap);
		},
	};
}

// Packed for the shader: xyz + radius, plus a parallel height array. Nearest to
// the camera win the limited slots — a shadow you cannot see does not need one.
const packed = new Float32Array(MAX_CAPS * CAP_STRIDE);
const heights = new Float32Array(MAX_CAPS);
const ranked: { cap: Cap; d: number }[] = [];
let packedCount = 0;

export function packCapsules(cx: number, cy: number, cz: number): number {
	if (!capsOn()) {
		packedCount = 0;
		return 0;
	}
	ranked.length = 0;
	for (const c of caps) {
		if (!c.live) continue;
		const dx = c.x - cx;
		const dy = c.y - cy;
		const dz = c.z - cz;
		ranked.push({ cap: c, d: dx * dx + dy * dy + dz * dz });
	}
	ranked.sort((a, b) => a.d - b.d);
	const n = Math.min(ranked.length, MAX_CAPS);
	for (let i = 0; i < n; i++) {
		const c = ranked[i].cap;
		packed[i * CAP_STRIDE] = c.x;
		packed[i * CAP_STRIDE + 1] = c.y;
		packed[i * CAP_STRIDE + 2] = c.z;
		packed[i * CAP_STRIDE + 3] = c.r;
		heights[i] = c.h;
	}
	packedCount = n;
	return n;
}

export function capsuleData(): {
	packed: Float32Array;
	heights: Float32Array;
	count: number;
} {
	return { packed, heights, count: packedCount };
}

if (import.meta.env?.DEV) {
	(window as unknown as Record<string, unknown>).__shadow = {
		mode: (m?: ShadowMode) => (m === undefined ? mode : ((mode = m), mode)),
		strength: (v?: number) =>
			v === undefined ? strength : ((strength = v), strength),
		count: () => caps.filter((c) => c.live).length,
	};
}
