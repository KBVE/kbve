import {
	Suspense,
	useEffect,
	useMemo,
	useRef,
	type ReactElement,
	type RefObject,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { ShipModel } from './ShipModel';
import { SpaceHud } from './SpaceHud';
import { usePointer } from './usePointer';

const MOUSE_TURN = 1.0; // how much the cursor's x adds to the yaw rate
const VERT_THRUST = 11; // climb/dive accel from the cursor's y (units/sec²)

/**
 * Solo client-side "Star Fox" space instance. The pilot leaves the multiplayer iso
 * world (their ship + body go off-grid server-side) and flies here, free-roam arcade
 * style on a plane: thrust along the heading, yaw to turn, a chase camera trailing
 * behind. Esc returns to the planet. Asset-free for slice 1 — the ship is built from
 * primitives; a baked model can drop in later.
 */

const TURN_RATE = 2.2; // rad/sec yaw
const THRUST = 26; // units/sec² along heading
const DAMP = 1.4; // velocity damping per sec
const MAX_SPEED = 60;
const CHASE_DIST = 9;
const CHASE_HEIGHT = 3.4;
const BANK_MAX = 0.5; // roll lean into a turn

/** Pressed-key set shared from the window into the R3F frame loop. */
function useKeys(): RefObject<Set<string>> {
	const keys = useRef<Set<string>>(new Set());
	useEffect(() => {
		const down = (e: KeyboardEvent) => keys.current.add(e.code);
		const up = (e: KeyboardEvent) => keys.current.delete(e.code);
		const blur = () => keys.current.clear();
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		window.addEventListener('blur', blur);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
			window.removeEventListener('blur', blur);
		};
	}, []);
	return keys;
}

/** Drives the ship transform from keys + trails the camera behind it each frame. */
function Flight({ heading }: { heading: number }): ReactElement {
	const ship = useRef<THREE.Group>(null);
	const keys = useKeys();
	const pointer = usePointer();
	const { camera } = useThree();
	// yaw (heading around Y), velocity in 3D (XZ plane + gentle vertical).
	const state = useRef({
		yaw: -((heading / 16) * Math.PI * 2),
		vel: new THREE.Vector3(),
	});
	const tmp = useMemo(() => new THREE.Vector3(), []);

	useFrame((_, dtRaw) => {
		const dt = Math.min(dtRaw, 0.05);
		const k = keys.current;
		const pt = pointer.current;
		const s = state.current;
		const g = ship.current;
		if (!g) return;

		const left = k.has('KeyA') || k.has('ArrowLeft');
		const right = k.has('KeyD') || k.has('ArrowRight');
		const fwd = k.has('KeyW') || k.has('ArrowUp');
		const back = k.has('KeyS') || k.has('ArrowDown');

		// steer with keys + the cursor's x (mouse right = bank right).
		const mx = pt.active ? pt.nx : 0;
		const turn = THREE.MathUtils.clamp(
			(left ? 1 : 0) - (right ? 1 : 0) - mx * MOUSE_TURN,
			-1,
			1,
		);
		s.yaw += turn * TURN_RATE * dt;

		// forward unit vector from yaw (ship nose = +Z, rotated by yaw around Y).
		const fx = Math.sin(s.yaw);
		const fz = Math.cos(s.yaw);
		const thrust = (fwd ? 1 : 0) - (back ? 0.6 : 0);
		s.vel.x += fx * thrust * THRUST * dt;
		s.vel.z += fz * thrust * THRUST * dt;
		// climb / dive from the cursor's y (mouse up = climb).
		const my = pt.active ? -pt.ny : 0;
		s.vel.y += my * VERT_THRUST * dt;

		// damping + clamp.
		const damp = Math.max(0, 1 - DAMP * dt);
		s.vel.multiplyScalar(damp);
		if (s.vel.length() > MAX_SPEED) s.vel.setLength(MAX_SPEED);

		g.position.addScaledVector(s.vel, dt);
		// nose follows yaw + pitches into the climb; banks into the turn.
		g.rotation.set(-my * 0.35, s.yaw, turn * -BANK_MAX);

		// chase camera: behind the nose, lifted, looking at the ship.
		tmp.set(
			g.position.x - fx * CHASE_DIST,
			g.position.y + CHASE_HEIGHT,
			g.position.z - fz * CHASE_DIST,
		);
		camera.position.lerp(tmp, 1 - Math.pow(0.0015, dt));
		camera.lookAt(g.position);
	});

	return (
		<group ref={ship}>
			<ShipModel />
		</group>
	);
}

export function SpaceScene({
	heading,
	onExit,
}: {
	heading: number;
	onExit: () => void;
}): ReactElement {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.code === 'Escape') onExit();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onExit]);

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				background:
					'radial-gradient(ellipse at 50% 40%, #0a1230 0%, #03040c 70%, #000 100%)',
			}}>
			<Canvas
				shadows
				camera={{
					position: [0, 4, -12],
					fov: 60,
					near: 0.1,
					far: 2000,
				}}>
				<ambientLight intensity={0.5} />
				<directionalLight position={[30, 50, 20]} intensity={1.4} />
				<Stars
					radius={400}
					depth={120}
					count={6000}
					factor={6}
					saturation={0}
					fade
				/>
				{/* the planet you just left, falling away below */}
				<mesh position={[0, -90, 60]}>
					<sphereGeometry args={[70, 48, 48]} />
					<meshStandardMaterial
						color="#2f6b4f"
						emissive="#0c2a1c"
						emissiveIntensity={0.4}
						roughness={1}
					/>
				</mesh>
				<Suspense fallback={null}>
					<Flight heading={heading} />
				</Suspense>
			</Canvas>
			<SpaceHud
				topRight={<div>FREE FLIGHT</div>}
				hint="Mouse to steer · W/S thrust · Esc to re-enter atmosphere"
			/>
		</div>
	);
}
