import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Character, type LocomotionClips } from '../character/Character';
import type { CharacterMotor, MotorConfig } from '../character/CharacterMotor';
import { CHARACTER_URL } from '../character/modelUrl';
import { HUMAN_H } from '../config';
import { getDungeon } from '../dungeon/store';
import { Transform3, Wander, isAlive } from '../mecs/props';
import { playerAnchor } from '../render/playerAnchor';
import {
	enemyBudget,
	farSpawnPoints,
	noteProgress,
	resetProgress,
} from './spawn';
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

interface Slot {
	x: number;
	z: number;
	eid: number;
	gen: number;
	respawnAt: number;
}

function makeGoblin(world: ReturnType<typeof getDungeon>['world'], x: number, z: number): number {
	return spawnGoblin(
		world,
		x,
		z,
		GOBLIN_RADIUS,
		GOBLIN_MOTOR.walkSpeed,
		GOBLIN_MOTOR.runSpeed,
	);
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
	const slots = useRef<Slot[]>([]);
	const [view, setView] = useState<Slot[]>([]);

	useEffect(() => {
		const world = getDungeon().world;
		resetProgress();
		const list = slots.current;
		return () => {
			for (const s of list) if (s.eid >= 0) despawnGoblin(world, s.eid);
			slots.current = [];
		};
	}, []);

	// Grow the encounter with depth, then reconcile deaths: castSystem flags a
	// goblin dying (CS.DEAD) on lethal damage and npcSystem despawns it after its
	// death clip. Drop the stale puppet and respawn at a fresh far point so the
	// dungeon stays populated instead of littering frozen bodies.
	useFrame((state) => {
		const world = getDungeon().world;
		const t = state.clock.elapsedTime;
		if (playerAnchor.on) noteProgress(playerAnchor.pos.x, playerAnchor.pos.z);
		let changed = false;

		const want = enemyBudget();
		if (slots.current.length < want)
			for (const [x, z] of farSpawnPoints(want - slots.current.length)) {
				slots.current.push({ x, z, eid: makeGoblin(world, x, z), gen: 0, respawnAt: 0 });
				changed = true;
			}

		for (const s of slots.current) {
			if (s.eid >= 0 && !isAlive(world, s.eid)) {
				s.eid = -1;
				s.gen++;
				s.respawnAt = t + RESPAWN_DELAY;
				changed = true;
			} else if (s.eid < 0 && s.respawnAt > 0 && t >= s.respawnAt) {
				const [nx, nz] = farSpawnPoints(1)[0] ?? [s.x, s.z];
				s.x = nx;
				s.z = nz;
				s.respawnAt = 0;
				s.eid = makeGoblin(world, nx, nz);
				changed = true;
			}
		}
		if (changed) setView(slots.current.slice());
	});

	return (
		<>
			{view.map((s, i) =>
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
