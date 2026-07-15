import { useEffect, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Character, type LocomotionClips } from '../character/Character';
import type { CharacterMotor, MotorConfig } from '../character/CharacterMotor';
import { CHARACTER_URL } from '../character/modelUrl';
import { HUMAN_H, TILE } from '../config';
import { dungeonSpawn, solidAtWorld } from '../dungeon/collision';
import { getDungeon } from '../dungeon/store';
import { Transform3, Wander, isAlive } from '../mecs/props';
import { despawnGoblin, spawnGoblin } from './goblinSim';

const RESPAWN_DELAY = 3;

export const GOBLIN_HEIGHT = 1.2;
export const GOBLIN_SCALE = GOBLIN_HEIGHT / HUMAN_H;
export const GOBLIN_TINT = '#7cb35a';

const PLAYER_RADIUS = 0.35;
export const GOBLIN_RADIUS = PLAYER_RADIUS * GOBLIN_SCALE;

const HIDE = new Set(['HAIR']);

const LOCOMOTION: LocomotionClips = {
	idle: 'Idle_Loop',
	idleOverlay: 'Zombie_Idle_Loop',
	walk: 'Zombie_Walk_Fwd_Loop',
	run: 'Zombie_Walk_Fwd_Loop',
	speedRef: 0.55,
};

const NAKED = new Set<string>();

const GOBLIN_MOTOR: MotorConfig = {
	walkSpeed: 0.8,
	runSpeed: 1.8,
	accel: 10,
	turnLerp: 8,
	gravity: 22,
	jumpSpeed: 3,
};

const COUNT = 3;

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

interface Slot {
	x: number;
	z: number;
	eid: number;
	gen: number;
	respawnAt: number;
}

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
		() =>
			spawnPoints(COUNT).map(([x, z]) => ({
				x,
				z,
				eid: -1,
				gen: 0,
				respawnAt: 0,
			})),
		[],
	);
	const [, force] = useState(0);

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

	// Death reconcile: castSystem despawns a goblin's ECS entity when its HP hits
	// zero, but the puppet Character keeps a stale eid. Drop the dead puppet at
	// once (corpse vanishes) and respawn a fresh goblin at a new point after a
	// delay so the encounter stays populated instead of littering frozen bodies.
	useFrame((state) => {
		const world = getDungeon().world;
		const t = state.clock.elapsedTime;
		let changed = false;
		for (const s of slots) {
			if (s.eid >= 0 && !isAlive(world, s.eid)) {
				s.eid = -1;
				s.gen++;
				s.respawnAt = t + RESPAWN_DELAY;
				changed = true;
			} else if (s.eid < 0 && s.respawnAt > 0 && t >= s.respawnAt) {
				const [nx, nz] = spawnPoints(1)[0] ?? [s.x, s.z];
				s.x = nx;
				s.z = nz;
				s.respawnAt = 0;
				s.eid = spawnGoblin(
					world,
					nx,
					nz,
					GOBLIN_RADIUS,
					GOBLIN_MOTOR.walkSpeed,
					GOBLIN_MOTOR.runSpeed,
				);
				changed = true;
			}
		}
		if (changed) force((n) => n + 1);
	});

	return (
		<>
			{slots.map((s, i) =>
				s.eid < 0 ? null : (
					<Character
						key={`${i}-${s.gen}`}
						url={CHARACTER_URL}
						scale={GOBLIN_SCALE}
						tint={GOBLIN_TINT}
						armor={NAKED}
						hide={HIDE}
						locomotion={LOCOMOTION}
						motorConfig={GOBLIN_MOTOR}
						position={[s.x, 0, s.z]}
						drive={makePuppet(s)}
						stateEid={() => s.eid}
						onReady={(h) => {
							h.motor.mover = NOOP_MOVER;
						}}
					/>
				),
			)}
		</>
	);
}
