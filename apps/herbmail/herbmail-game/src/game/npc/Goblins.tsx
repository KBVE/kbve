import { useEffect, useMemo } from 'react';
import { Character, type LocomotionClips } from '../character/Character';
import type { CharacterMotor, MotorConfig } from '../character/CharacterMotor';
import { CHARACTER_URL } from '../character/modelUrl';
import { HUMAN_H, TILE } from '../config';
import { dungeonSpawn, solidAtWorld } from '../dungeon/collision';
import { getDungeon } from '../dungeon/store';
import { Transform3, Wander } from '../mecs/props';
import { despawnGoblin, spawnGoblin } from './goblinSim';

// Goblin stands ~1.2m against the ~2m human model. Straight 1m read too small
// in third person, and the hunched zombie gait shaves apparent height further.
export const GOBLIN_HEIGHT = 1.2;
export const GOBLIN_SCALE = GOBLIN_HEIGHT / HUMAN_H;
export const GOBLIN_TINT = '#7cb35a';
// Body radius shrinks with the model so a goblin fits gaps the player can't:
// the collision probe, sub-step length and wall clearance all derive from it.
const PLAYER_RADIUS = 0.35;
export const GOBLIN_RADIUS = PLAYER_RADIUS * GOBLIN_SCALE;

// Bald: goblins reuse the human head but drop the hairstyle mesh.
const HIDE = new Set(['HAIR']);

// Zombie set doubles as a goblin shamble. Its clips are retargeted from other
// proportions though — the leg rotations swing the feet on this rig — so idle
// is the native (foot-stable) Idle_Loop with the zombie hunch masked onto the
// upper body only. Walk stays full zombie: motion hides the drift and speedRef
// retimes the stride (≈0.9 m/s × 0.6 scale) so chasing plays a frantic ~2.6×
// scramble instead of ice-skating.
const LOCOMOTION: LocomotionClips = {
	idle: 'Idle_Loop',
	idleOverlay: 'Zombie_Idle_Loop',
	walk: 'Zombie_Walk_Fwd_Loop',
	run: 'Zombie_Walk_Fwd_Loop',
	speedRef: 0.55,
};

// Frozen loadout: goblins never mirror the player's armor store.
const NAKED = new Set<string>();

// Motor speeds are world-space (scale only shrinks the mesh), so a small body
// needs a matching stride speed or the legs skate.
const GOBLIN_MOTOR: MotorConfig = {
	walkSpeed: 0.8,
	runSpeed: 1.8,
	accel: 10,
	turnLerp: 8,
	gravity: 22,
	jumpSpeed: 3,
};

const COUNT = 3;

// Ring of candidate offsets around the entrance-room centre; first open tile
// wins per goblin so nobody spawns inside a wall or column.
function spawnPoints(count: number): [number, number][] {
	const [cx, , cz] = dungeonSpawn();
	const out: [number, number][] = [];
	for (let ring = 1; ring <= 3 && out.length < count; ring++) {
		for (let i = 0; i < 8 && out.length < count; i++) {
			const a = (i / 8) * Math.PI * 2 + ring * 0.7;
			const x = cx + Math.cos(a) * TILE * ring;
			const z = cz + Math.sin(a) * TILE * ring;
			if (!solidAtWorld(x, z)) out.push([x, z]);
		}
	}
	return out;
}

// A slot is the render-stable identity; the entity inside it is created and
// destroyed by the spawn effect (StrictMode mounts twice, so the eid must be
// re-fillable — a useMemo-spawned entity would stay dead after the first
// cleanup despawns it).
interface Slot {
	x: number;
	z: number;
	eid: number;
}

// The ECS sim (goblinSim.npcSystem) owns AI + movement + collision; the motor
// here is a render puppet. Position hard-syncs from Transform3 each frame, and
// the wander velocity feeds the motor only so gait/facing animate — its own
// integration is disabled via a no-op mover.
function makePuppet(slot: Slot): (motor: CharacterMotor, t: number) => void {
	return (motor) => {
		const eid = slot.eid;
		if (eid < 0) return;
		motor.position.set(
			Transform3.px[eid],
			Transform3.py[eid],
			Transform3.pz[eid],
		);
		motor.setDesiredVelocity(Wander.vx[eid], Wander.vz[eid]);
	};
}

const NOOP_MOVER = (): void => void 0;

export function Goblins() {
	const slots = useMemo<Slot[]>(
		() => spawnPoints(COUNT).map(([x, z]) => ({ x, z, eid: -1 })),
		[],
	);

	useEffect(() => {
		const world = getDungeon().world;
		for (const s of slots)
			s.eid = spawnGoblin(
				world,
				s.x,
				s.z,
				GOBLIN_RADIUS,
				GOBLIN_MOTOR.walkSpeed,
				GOBLIN_MOTOR.runSpeed,
			);
		return () => {
			for (const s of slots) {
				if (s.eid >= 0) despawnGoblin(world, s.eid);
				s.eid = -1;
			}
		};
	}, [slots]);

	return (
		<>
			{slots.map((s, i) => (
				<Character
					key={i}
					url={CHARACTER_URL}
					scale={GOBLIN_SCALE}
					tint={GOBLIN_TINT}
					armor={NAKED}
					hide={HIDE}
					locomotion={LOCOMOTION}
					motorConfig={GOBLIN_MOTOR}
					position={[s.x, 0, s.z]}
					drive={makePuppet(s)}
					onReady={(h) => {
						h.motor.mover = NOOP_MOVER;
					}}
				/>
			))}
		</>
	);
}
