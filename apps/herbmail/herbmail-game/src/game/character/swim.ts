import * as THREE from 'three';
import { oasisAt, pushDisturb, type OasisDef } from '../water/oasis';
import { OASIS_DEPTH, SWIM_SINK } from '../water/constants';
import { solidAtWorld, floorYAtWorld } from '../dungeon/collision';
import { registerInteract } from '../interact/registry';
import { equippedStat } from './armor';
import type { CharacterHandle } from './Character';

const SWIM_SPEED = 1.2;
const ENTER_DEPTH = 0.25;
const WAKE_BONES: { name: string; r: number }[] = [
	{ name: 'head', r: 0.2 },
	{ name: 'spine_02', r: 0.32 },
	{ name: 'pelvis', r: 0.3 },
	{ name: 'hand_l', r: 0.14 },
	{ name: 'hand_r', r: 0.14 },
	{ name: 'foot_l', r: 0.16 },
	{ name: 'foot_r', r: 0.16 },
];
const WAKE_BAND_LO = -0.5;
const WAKE_BAND_HI = 0.3;
const BODY_R = 0.4;
const CLIMB_PROBE = 0.85;
const CLIMB_FWD = 0.95;
const RIM_REACH = 1.3;
const SPLASH = { radius: 0.9, strength: 1.1 };

interface ClimbSeq {
	t: number;
	total: number;
	from: THREE.Vector3;
	to: THREE.Vector3;
	yaw: number;
	out: boolean;
}

let handle: CharacterHandle | null = null;
let pool: OasisDef | null = null;
let bobT = 0;
const prevPos = new THREE.Vector3();
let climb: ClimbSeq | null = null;
const bonePrev = new Map<string, THREE.Vector3>();
const _boneW = new THREE.Vector3();
export function isSwimming(): boolean {
	return handle?.motor.mode === 'swim';
}

export function swimSpeed(): number {
	return SWIM_SPEED;
}

function enterSwim(h: CharacterHandle, p: OasisDef): void {
	pool = p;
	h.motor.mode = 'swim';
	h.motor.swimY = p.surfaceY - SWIM_SINK;
	h.motor.swimFloor = -OASIS_DEPTH + 0.45;
	h.motor.vy = 0;
	h.setBlocking(false);
	prevPos.copy(h.motor.position);
	pushDisturb(p.id, {
		kind: 'drop',
		x: h.motor.position.x,
		z: h.motor.position.z,
		...SPLASH,
	});
}

function startClimb(
	h: CharacterHandle,
	to: THREE.Vector3,
	yaw: number,
	out: boolean,
	clips: string[],
): void {
	const total = clips.reduce((s, c) => s + h.animator.duration(c), 0);
	climb = {
		t: 0,
		total: Math.max(0.6, total),
		from: h.motor.position.clone(),
		to,
		yaw,
		out,
	};
	h.motor.mode = 'climb';
	h.motor.yawLock = null;
	h.motor.yaw = yaw;
	h.motor.swimPitch = 0;
	h.motor.setDesiredVelocity(0, 0);
	h.motor.velocity.set(0, 0, 0);
	void (async () => {
		for (const c of clips) await h.animator.playOnce(c, 0.12);
	})();
}

export function registerSwimEntry(): () => void {
	return registerInteract((px, pz) => {
		const h = handle;
		if (!h || h.motor.mode !== 'ground' || !h.motor.grounded) return null;
		const yaw = h.motor.yaw;
		const fx = Math.sin(yaw);
		const fz = Math.cos(yaw);
		const p = oasisAt(px + fx * RIM_REACH, pz + fz * RIM_REACH);
		if (!p) return null;
		return {
			target: {
				id: `swim:${p.id}`,
				verb: 'Swim',
				interact: () => {
					const to = new THREE.Vector3(
						px + fx * (RIM_REACH + BODY_R),
						p.surfaceY - SWIM_SINK,
						pz + fz * (RIM_REACH + BODY_R),
					);
					pool = p;
					startClimb(h, to, yaw, false, ['Climb_Exit']);
				},
			},
			dist2: 0.5,
		};
	});
}

export function bindSwimHandle(h: CharacterHandle): void {
	handle = h;
	prevPos.copy(h.motor.position);
}

export function tickSwim(dt: number, forwardHeld: boolean): void {
	const h = handle;
	if (!h) return;
	const m = h.motor;

	if (m.mode === 'climb' && climb) {
		climb.t += dt;
		const a = Math.min(1, climb.t / climb.total);
		const s = (v: number) => v * v * (3 - 2 * v);
		const va = climb.out
			? Math.min(1, a / 0.6)
			: Math.max(0, (a - 0.4) / 0.6);
		const ha = climb.out
			? Math.max(0, (a - 0.55) / 0.45)
			: Math.min(1, a / 0.55);
		m.position.y = THREE.MathUtils.lerp(climb.from.y, climb.to.y, s(va));
		m.position.x = THREE.MathUtils.lerp(climb.from.x, climb.to.x, s(ha));
		m.position.z = THREE.MathUtils.lerp(climb.from.z, climb.to.z, s(ha));
		m.yaw = climb.yaw;
		if (a >= 1) {
			if (climb.out) {
				m.mode = 'ground';
				m.grounded = true;
				m.position.y = 0;
				pool = null;
			} else {
				m.mode = 'swim';
				if (pool) {
					m.swimY = pool.surfaceY - SWIM_SINK;
					m.swimFloor = -OASIS_DEPTH + 0.45;
					pushDisturb(pool.id, {
						kind: 'drop',
						x: m.position.x,
						z: m.position.z,
						...SPLASH,
					});
				}
			}
			climb = null;
		}
		return;
	}

	if (m.mode === 'ground') {
		const p = oasisAt(m.position.x, m.position.z);
		if (p && m.position.y < p.surfaceY - ENTER_DEPTH) enterSwim(h, p);
		return;
	}

	if (m.mode !== 'swim') return;
	const p = pool;
	if (!p) {
		m.mode = 'ground';
		return;
	}

	m.position.x = THREE.MathUtils.clamp(
		m.position.x,
		p.x0 + BODY_R,
		p.x1 - BODY_R,
	);
	m.position.z = THREE.MathUtils.clamp(
		m.position.z,
		p.z0 + BODY_R,
		p.z1 - BODY_R,
	);

	const planar = Math.hypot(m.velocity.x, m.velocity.z);
	const targetPitch =
		Math.abs(m.velocity.y) > 0.05
			? Math.atan2(m.velocity.y, Math.max(planar, 0.4))
			: 0;
	m.swimPitch += (targetPitch - m.swimPitch) * (1 - Math.exp(-6 * dt));

	bobT += dt;
	m.swimY =
		p.surfaceY -
		SWIM_SINK +
		Math.sin(bobT * 1.5) * (0.035 + Math.min(planar, 1.2) * 0.03);

	const nearSurface = m.position.y > m.swimY - 0.5;
	if (nearSurface) {
		const bulk = 1 + Math.min(equippedStat('weight'), 30) * 0.02;
		for (const b of WAKE_BONES) {
			const bone = h.bone(b.name);
			if (!bone) continue;
			bone.getWorldPosition(_boneW);
			const yRel = _boneW.y - p.surfaceY;
			let prev = bonePrev.get(b.name);
			if (!prev) {
				prev = _boneW.clone();
				bonePrev.set(b.name, prev);
			}
			if (
				yRel > WAKE_BAND_LO &&
				yRel < WAKE_BAND_HI &&
				prev.distanceToSquared(_boneW) > 1e-8
			) {
				pushDisturb(p.id, {
					kind: 'sphere',
					ox: prev.x,
					oz: prev.z,
					nx: _boneW.x,
					nz: _boneW.z,
					y: THREE.MathUtils.clamp(yRel, -0.3, 0.1),
					radius: b.r * bulk,
				});
			}
			prev.copy(_boneW);
		}
	}
	prevPos.copy(m.position);

	if (forwardHeld && m.speed > 0.2 && nearSurface) {
		const fx = Math.sin(m.yaw);
		const fz = Math.cos(m.yaw);
		const px = m.position.x + fx * CLIMB_PROBE;
		const pz = m.position.z + fz * CLIMB_PROBE;
		const outside = px < p.x0 || px > p.x1 || pz < p.z0 || pz > p.z1;
		if (outside && floorYAtWorld(px, pz) === 0 && !solidAtWorld(px, pz)) {
			const yaw = Math.round(m.yaw / (Math.PI / 2)) * (Math.PI / 2);
			const tx = m.position.x + Math.sin(yaw) * (CLIMB_PROBE + CLIMB_FWD);
			const tz = m.position.z + Math.cos(yaw) * (CLIMB_PROBE + CLIMB_FWD);
			if (floorYAtWorld(tx, tz) === 0 && !solidAtWorld(tx, tz)) {
				startClimb(h, new THREE.Vector3(tx, 0, tz), yaw, true, [
					'ClimbLedge',
					'ClimbUp_1m',
				]);
			}
		}
	}
}
