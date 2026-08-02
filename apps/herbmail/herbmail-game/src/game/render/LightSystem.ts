import * as THREE from 'three';
import {
	hasComponent,
	LightEmitter,
	eachOwned,
	Transform3,
	type World,
} from '../mecs/props';
import { FireflyFx } from '../prop/components';
import { MAX_LIGHTS, LIGHT_RANGE, psxMaterialRegistry } from './PsxMaterial';
import type { OcclusionField } from '../dungeon/occlusion';
import { heldLight } from './heldLight';
import { playerAnchor } from './playerAnchor';
import { bodyMotionSig } from '../dungeon/collision';
import { getOases } from '../water/oasis';
import { getDungeon } from '../dungeon/store';
import { isSectorBaked } from './bake/bakePool';
import { ambientBoost, attParams, bakeGain, lightGain } from './lightGain';
import {
	CAP_STRIDE,
	MAX_CAPS,
	capsuleData,
	packCapsules,
	setNearestLight,
	shadowStrength,
} from './charShadow';
import { VIEW_RANGE, WALL_H } from '../config';

export const HEAD_REACH = 1.122;
export const HEAD_OFFSET = 0.28;
// Consider any emitter within visible range: a torch you could see (out to the fog
// wall, plus its own LIGHT_RANGE glow radius) must still be fed to the shader.
const CULL_RADIUS = VIEW_RANGE + LIGHT_RANGE;
const CULL_SQ = CULL_RADIUS * CULL_RADIUS;
const POINT_LIGHTS = 6;
const POINT_SCALE = 3.0;
// Caster handoff: challenger torch must be this fraction of the current
// caster's squared player distance to steal the role (hysteresis), and the
// shadow fades out/in over FADE_TIME on each swap instead of popping.
const SWAP_RATIO = 0.55;
const FADE_TIME = 0.18;
const SHADOW_CASTERS = 2;
// Character ground shadow: a challenger torch must be this fraction of the
// incumbent's squared distance to steal it, and the origin glides at this rate
// so a swap sweeps rather than snaps.
const SHADOW_SWAP = 0.5;
const SHADOW_GLIDE = 6;
// Wide enough that a torch beside the player still covers him and the wall he
// is thrown against; the cone only bounds where shadows exist, never the light.
const SHADOW_CONE = Math.PI * 0.42;
const SHADOW_PENUMBRA = 0.8;
// Re-aim only when the player has actually moved enough to matter, so a
// standing player keeps reusing the shadow map already rendered.
const SHADOW_AIM_EPS = 0.05;
const SHADOW_MOVE_EPS = 0.02;
// Static sky-light that fills an oasis room — the "sun pooling in" through the
// oculus, fed through the same shader path as torches so it lights the walls.
const OASIS_LIGHT_INTENSITY = 2.2;
const OASIS_LIGHT_Y = WALL_H * 0.5;
// Hoisted so the mecs `each` name-map is cached (zero per-frame allocation).
const LIGHT_TERMS = [LightEmitter, Transform3];

interface Ranked {
	x: number;
	y: number;
	z: number;
	r: number;
	g: number;
	b: number;
	dist: number;
	pdist: number;
	intensity: number;
	tier: number;
	nearOnly: number;
}

// Reads all LightEmitter props each frame, ranks them by camera distance, and
// feeds the nearest MAX_LIGHTS into the PSX shader uniforms plus the nearest
// POINT_LIGHTS real point lights (for standard-material meshes the shader misses).
// Ported from the retired TorchLighting component.
interface ShadowSlot {
	light: THREE.SpotLight;
	target: THREE.Object3D;
	pos: THREE.Vector3 | null;
	pending: THREE.Vector3;
	hasPending: boolean;
	fade: number;
}

export class LightSystem {
	readonly root = new THREE.Group();
	private readonly lights: THREE.PointLight[] = [];
	private readonly slots: ShadowSlot[] = [];
	private lastTime = 0;
	private frame = 0;
	private lastShadowSig = 0;
	private readonly pos = Array.from(
		{ length: MAX_LIGHTS },
		() => new THREE.Vector3(),
	);
	private readonly col = Array.from(
		{ length: MAX_LIGHTS },
		() => new THREE.Vector3(),
	);
	private readonly near = new Array<number>(MAX_LIGHTS).fill(0);
	private readonly caps = Array.from(
		{ length: MAX_CAPS },
		() => new THREE.Vector4(),
	);
	private readonly capH = new Array<number>(MAX_CAPS).fill(0);
	// Smoothed origin for character ground shadows: t* is the target light, the
	// unprefixed fields are the eased value actually published.
	private readonly shadowLight = {
		on: false,
		settled: false,
		x: 0,
		y: 0,
		z: 0,
		tx: 0,
		ty: 0,
		tz: 0,
		intensity: 0,
	};
	// Persistent Ranked pool reused across frames; `active` holds references to the
	// filled entries this frame (no per-emitter object allocation). `casters` is a
	// reused 2-slot buffer for the nearest-to-player shadow lights.
	private readonly pool: Ranked[] = [];
	private active: Ranked[] = [];

	private take(): Ranked {
		let r = this.pool[this.active.length];
		if (!r) {
			r = {
				x: 0,
				y: 0,
				z: 0,
				r: 0,
				g: 0,
				b: 0,
				dist: 0,
				pdist: 0,
				intensity: 0,
				tier: 0,
				nearOnly: 0,
			};
			this.pool[this.active.length] = r;
		}
		return r;
	}

	constructor() {
		for (let i = 0; i < POINT_LIGHTS; i++) {
			const pl = new THREE.PointLight(0xff8a3c, 0, LIGHT_RANGE, 2);
			// Stay visible for the shader's whole life: toggling light.visible (or
			// count) re-hashes the renderer's lights and recompiles every
			// light-using program. Inactive lights sit at intensity 0 instead.
			pl.visible = true;
			this.lights.push(pl);
			this.root.add(pl);
		}
		for (let i = 0; i < SHADOW_CASTERS; i++) {
			// Spot rather than point: a point shadow redraws six cube faces per
			// refresh, a spot redraws one. These casters run at intensity 0 —
			// they emit nothing and exist only so nearby torches throw the
			// player's shadow — so the cone costs no illumination, only the
			// shadowed region, and the target tracks the player to keep that
			// region over whatever actually needs a shadow.
			const sl = new THREE.SpotLight(
				0xffffff,
				0,
				LIGHT_RANGE,
				SHADOW_CONE,
				SHADOW_PENUMBRA,
				2,
			);
			sl.castShadow = true;
			sl.visible = true;
			sl.shadow.intensity = 0;
			sl.shadow.autoUpdate = false;
			sl.shadow.mapSize.set(256, 256);
			sl.shadow.camera.near = 0.2;
			sl.shadow.camera.far = LIGHT_RANGE;
			sl.shadow.bias = -0.005;
			sl.shadow.radius = 4;
			const target = new THREE.Object3D();
			sl.target = target;
			this.slots.push({
				light: sl,
				target,
				pos: null,
				pending: new THREE.Vector3(),
				hasPending: false,
				fade: 0,
			});
			this.root.add(sl);
			this.root.add(target);
		}
	}

	tick(
		world: World,
		mounted: readonly number[],
		camera: THREE.Camera,
		time: number,
		occ: OcclusionField,
		ambient: number,
	): void {
		this.active.length = 0;
		let sectorBaked = false;
		const gather = (eid: number) => {
			const firefly = hasComponent(world, eid, FireflyFx);
			const dx = Transform3.dx[eid];
			const dy = Transform3.dy[eid];
			const dz = Transform3.dz[eid];
			const len = Math.hypot(dx, dy, dz) || 1;
			const reach = firefly ? 0 : HEAD_REACH;
			const yoff = firefly ? 0 : HEAD_OFFSET;
			const x = Transform3.px[eid] + (dx / len) * reach;
			const y = Transform3.py[eid] + (dy / len) * reach + yoff;
			const z = Transform3.pz[eid] + (dz / len) * reach;

			const ph = LightEmitter.flickerPhase[eid];
			const amp = LightEmitter.flickerAmp[eid];
			const f =
				0.85 +
				amp *
					(0.08 * Math.sin(time * 2.1 + ph) +
						0.05 * Math.sin(time * 3.7 + ph * 1.7) +
						0.025 * Math.sin(time * 6.3 + ph * 2.3));

			const pdx = x - playerAnchor.pos.x;
			const pdz = z - playerAnchor.pos.z;
			const pd2 = pdx * pdx + pdz * pdz;
			if (pd2 > CULL_SQ) return;

			const ddx = x - camera.position.x;
			const ddy = y - camera.position.y;
			const ddz = z - camera.position.z;
			const l = this.take();
			l.x = x;
			l.y = y;
			l.z = z;
			l.r = LightEmitter.r[eid];
			l.g = LightEmitter.g[eid];
			l.b = LightEmitter.b[eid];
			l.dist = ddx * ddx + ddy * ddy + ddz * ddz;
			l.pdist = pd2;
			l.intensity = LightEmitter.baseIntensity[eid] * f;
			l.tier = firefly ? 1 : 0;
			l.nearOnly = sectorBaked && LightEmitter.baked[eid] ? 1 : 0;
			this.active.push(l);
		};
		// A sector's static emitters fall back to their near field only once its
		// vertex bake has actually landed; until then they light fully, so a
		// freshly streamed sector is never dark while the worker is busy.
		for (const sector of mounted) {
			const sig = getDungeon().desc(sector)?.signature;
			sectorBaked = sig ? isSectorBaked(sig) : false;
			eachOwned(sector, LIGHT_TERMS, gather);
		}
		sectorBaked = false;

		// Everything gathered so far is a world-placed emitter; the held torch
		// and oasis sky lights appended below are not eligible to cast a
		// character's ground shadow.
		const mountedLights = this.active.length;

		// Torch held in hand: always the nearest source (lights walls + character).
		if (heldLight.on) {
			const flick =
				0.85 +
				0.1 * Math.sin(time * 2.3) +
				0.05 * Math.sin(time * 4.1 + 1.3);
			const l = this.take();
			l.x = heldLight.pos.x;
			l.y = heldLight.pos.y;
			l.z = heldLight.pos.z;
			l.r = heldLight.r;
			l.g = heldLight.g;
			l.b = heldLight.b;
			l.dist = 0;
			l.pdist = 0;
			l.intensity = heldLight.intensity * flick;
			l.tier = 0;
			l.nearOnly = 0;
			this.active.push(l);
		}

		// Static sky-light per oasis: a bright, warm, non-flickering source at the
		// room centre so the open room reads as daylit. tier -1 keeps it ahead of
		// torches in the nearest-N cut when the player is inside.
		for (const o of getOases()) {
			const pdx = o.cx - playerAnchor.pos.x;
			const pdz = o.cz - playerAnchor.pos.z;
			const pd2 = pdx * pdx + pdz * pdz;
			if (pd2 > CULL_SQ) continue;
			const ddx = o.cx - camera.position.x;
			const ddz = o.cz - camera.position.z;
			const l = this.take();
			l.x = o.cx;
			l.y = OASIS_LIGHT_Y;
			l.z = o.cz;
			l.r = 1.0;
			l.g = 0.93;
			l.b = 0.78;
			l.dist = ddx * ddx + ddz * ddz;
			l.pdist = pd2;
			l.intensity = OASIS_LIGHT_INTENSITY;
			l.tier = -1;
			l.nearOnly = 0;
			this.active.push(l);
		}

		// Publish the light nearest the player for character ground shadows.
		// Only world-placed emitters qualify: the held torch sits at hand height
		// with pdist 0, so it would always win and then project the body from
		// inside itself — the shadow blows up through infinity.
		let best: Ranked | null = null;
		for (let i = 0; i < mountedLights; i++) {
			const l = this.active[i];
			if (l.tier === 0 && (!best || l.pdist < best.pdist)) best = l;
		}

		// Hysteresis, same reason the shadow casters have it: bays put a candle
		// in nearly every alcove, so a raw nearest-wins test flips the winner as
		// the player walks and the shadow teleports between origins each frame.
		// Keep the incumbent until a challenger is clearly closer.
		const cur = this.shadowLight;
		if (best) {
			let steal = !cur.on;
			if (cur.on) {
				const hx = cur.tx - playerAnchor.pos.x;
				const hz = cur.tz - playerAnchor.pos.z;
				steal = best.pdist < (hx * hx + hz * hz) * SHADOW_SWAP;
			}
			if (steal) {
				cur.tx = best.x;
				cur.ty = best.y;
				cur.tz = best.z;
				cur.on = true;
			}
			cur.intensity = best.intensity;
		} else {
			cur.on = false;
		}

		// Glide toward the chosen light so a swap sweeps the shadow across
		// instead of snapping it. Same delta the caster fade uses below;
		// this.lastTime is not advanced until after that, so both agree.
		const dtNow = Math.min(Math.max(time - this.lastTime, 0), 0.1);
		const sl = this.shadowLight;
		if (sl.on) {
			const k = 1 - Math.exp(-dtNow * SHADOW_GLIDE);
			sl.x += (sl.tx - sl.x) * k;
			sl.y += (sl.ty - sl.y) * k;
			sl.z += (sl.tz - sl.z) * k;
			if (!sl.settled) {
				sl.x = sl.tx;
				sl.y = sl.ty;
				sl.z = sl.tz;
				sl.settled = true;
			}
		} else {
			sl.settled = false;
		}
		setNearestLight(sl.on, sl.x, sl.y, sl.z, sl.intensity);

		// Nearest characters get the limited capsule slots; a shadow you can't
		// see doesn't need one.
		const capCount = packCapsules(
			camera.position.x,
			camera.position.y,
			camera.position.z,
		);
		const capData = capsuleData();
		for (let i = 0; i < capCount; i++) {
			this.caps[i].set(
				capData.packed[i * CAP_STRIDE],
				capData.packed[i * CAP_STRIDE + 1],
				capData.packed[i * CAP_STRIDE + 2],
				capData.packed[i * CAP_STRIDE + 3],
			);
			this.capH[i] = capData.heights[i];
		}

		// Baked light is a static sum, so it can't flicker per torch. A slow
		// global breath keeps it from reading as a painted-on lightmap.
		const bakeFlicker =
			1 + 0.045 * Math.sin(time * 1.9) + 0.025 * Math.sin(time * 4.3);

		this.active.sort((a, b) => a.tier - b.tier || a.dist - b.dist);
		const count = Math.min(this.active.length, MAX_LIGHTS);

		for (let i = 0; i < count; i++) {
			const l = this.active[i];
			this.pos[i].set(l.x, l.y, l.z);
			this.col[i].set(l.r, l.g, l.b).multiplyScalar(l.intensity);
			this.near[i] = l.nearOnly;
		}

		// Every PSX material shares LightSystem's own pos/col arrays by reference, so
		// the per-light vectors are written once (above) instead of copied into each
		// material. Iterate the material registry directly (only live PSX materials)
		// rather than walking the whole scene graph's thousands of meshes each frame.
		for (const mat of psxMaterialRegistry) {
			const u = (
				mat as THREE.ShaderMaterial & {
					uniforms: Record<string, { value: unknown }>;
				}
			).uniforms;
			if (!u.uLightPos) continue;
			u.uLightCount.value = count;
			u.uAmbient.value = ambient + ambientBoost();
			if (u.uAtt) {
				const a = attParams();
				(u.uAtt.value as THREE.Vector4).set(a.k0, a.k1, a.k2, a.cap);
			}
			if (u.uBakeFlicker) u.uBakeFlicker.value = bakeFlicker;
			if (u.uLightGain) u.uLightGain.value = lightGain();
			if (u.uBakeGain) u.uBakeGain.value = bakeGain();
			if (u.uCapCount) {
				u.uCapCount.value = capCount;
				u.uCapStrength.value = shadowStrength();
				if (u.uCaps.value !== this.caps) u.uCaps.value = this.caps;
				if (u.uCapH.value !== this.capH) u.uCapH.value = this.capH;
			}
			u.uMapTex.value = occ.tex;
			(u.uGridOrigin.value as THREE.Vector2).copy(occ.origin);
			(u.uGridSize.value as THREE.Vector2).copy(occ.size);
			if (u.uLightPos.value !== this.pos) u.uLightPos.value = this.pos;
			if (u.uLightColor.value !== this.col)
				u.uLightColor.value = this.col;
			if (u.uLightNear && u.uLightNear.value !== this.near)
				u.uLightNear.value = this.near;
		}

		for (let i = 0; i < POINT_LIGHTS; i++) {
			const pl = this.lights[i];
			if (i < count) {
				const l = this.active[i];
				pl.position.set(l.x, l.y, l.z);
				pl.color.setRGB(l.r, l.g, l.b);
				pl.intensity = l.intensity * POINT_SCALE;
			} else {
				pl.intensity = 0;
			}
		}

		const dt = Math.min(Math.max(time - this.lastTime, 0), 0.1);
		this.lastTime = time;
		this.updateShadowCasters(dt);
	}

	// The two nearest torches own the cube shadow casters. A slot keeps its
	// torch until it clearly loses the ranking (SWAP_RATIO hysteresis), and
	// every handoff crossfades shadow.intensity so shadows tween between
	// torches instead of popping as the player walks.
	private updateShadowCasters(dt: number): void {
		let a: Ranked | null = null;
		let b: Ranked | null = null;
		for (const l of this.active) {
			if (l.tier !== 0) continue;
			if (!a || l.pdist < a.pdist) {
				b = a;
				a = l;
			} else if (!b || l.pdist < b.pdist) {
				b = l;
			}
		}
		const top: Ranked[] = [];
		if (a) top.push(a);
		if (b) top.push(b);

		const claimed = new Set<Ranked>();
		for (const slot of this.slots) {
			if (!slot.pos) continue;
			const match = top.find(
				(t) =>
					!claimed.has(t) &&
					t.x === slot.pos!.x &&
					t.y === slot.pos!.y &&
					t.z === slot.pos!.z,
			);
			if (match) claimed.add(match);
		}

		this.frame++;
		// Only re-render shadow maps when a dynamic occluder actually moved
		// (player/goblins/props). A static scene skips the six-face cube render
		// entirely instead of paying it every third frame. A rare safety tick
		// covers anything that mutates geometry without touching a Body.
		const sig = bodyMotionSig();
		const occluderMoved =
			Math.abs(sig - this.lastShadowSig) > SHADOW_MOVE_EPS;
		if (occluderMoved) this.lastShadowSig = sig;
		// A point-light shadow redraws all six cube faces at once, so refreshing
		// every caster light on the same frame stacks the whole cost into one
		// spike — and while anything is moving that spike lands every frame.
		// Phase the slots instead: one light per frame, so a moving scene costs
		// a single cube refresh per frame and each light still updates every
		// slots.length frames. Static scenes keep the rare safety tick.
		const period = occluderMoved ? Math.max(1, this.slots.length) : 90;
		let slotIndex = 0;

		for (const slot of this.slots) {
			const cur = slot.pos;
			const held = cur
				? top.find(
						(t) => t.x === cur.x && t.y === cur.y && t.z === cur.z,
					)
				: undefined;
			if (!held) {
				const free = top.find((t) => !claimed.has(t));
				if (free) {
					claimed.add(free);
					if (!cur) {
						slot.pos = new THREE.Vector3(free.x, free.y, free.z);
						slot.fade = 0;
						slot.hasPending = false;
					} else {
						const cx = cur.x - playerAnchor.pos.x;
						const cz = cur.z - playerAnchor.pos.z;
						const curDist = cx * cx + cz * cz;
						if (free.pdist < curDist * SWAP_RATIO) {
							slot.pending.set(free.x, free.y, free.z);
							slot.hasPending = true;
						}
					}
				} else if (cur) {
					slot.hasPending = false;
					slot.fade = Math.max(0, slot.fade - dt / FADE_TIME);
					if (slot.fade === 0) slot.pos = null;
				}
			}

			const sl = slot.light;
			if (!slot.pos) {
				sl.shadow.intensity = 0;
				continue;
			}
			if (slot.hasPending) {
				slot.fade -= dt / FADE_TIME;
				if (slot.fade <= 0) {
					slot.fade = 0;
					slot.pos.copy(slot.pending);
					slot.hasPending = false;
				}
			} else if (!held && slot.fade > 0) {
				// fading out handled above
			} else {
				slot.fade = Math.min(1, slot.fade + dt / FADE_TIME);
			}

			const moved =
				sl.position.x !== slot.pos.x ||
				sl.position.y !== slot.pos.y ||
				sl.position.z !== slot.pos.z;
			sl.position.copy(slot.pos);

			// Point the cone down the torch-to-player line. The target lives in
			// the same group as the light, so the shadow camera follows once its
			// world matrix is current.
			const t = slot.target.position;
			const aimed =
				Math.abs(t.x - playerAnchor.pos.x) > SHADOW_AIM_EPS ||
				Math.abs(t.y - playerAnchor.pos.y) > SHADOW_AIM_EPS ||
				Math.abs(t.z - playerAnchor.pos.z) > SHADOW_AIM_EPS;
			if (aimed) {
				t.copy(playerAnchor.pos);
				slot.target.updateMatrixWorld();
			}
			const wasDark = sl.shadow.intensity === 0;
			sl.shadow.intensity = slot.fade;
			const show = slot.fade > 0;
			const due = this.frame % period === slotIndex % period;
			slotIndex++;
			if (show && (wasDark || moved || aimed || due)) {
				sl.shadow.needsUpdate = true;
			}
		}
	}

	dispose(): void {
		for (const pl of this.lights) this.root.remove(pl);
		for (const slot of this.slots) {
			slot.light.shadow.map?.dispose();
			this.root.remove(slot.light);
		}
	}
}
