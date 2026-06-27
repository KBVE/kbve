import {
	useEffect,
	useMemo,
	useRef,
	type ReactElement,
	type RefObject,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';

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

/** A small starfighter built from primitives — points down +Z (forward). */
function ShipModel(): ReactElement {
	return (
		<group rotation={[Math.PI / 2, 0, 0]}>
			{/* fuselage */}
			<mesh castShadow>
				<coneGeometry args={[0.6, 2.4, 8]} />
				<meshStandardMaterial
					color="#cfd8e8"
					metalness={0.6}
					roughness={0.35}
				/>
			</mesh>
			{/* wings */}
			<mesh position={[0, -0.6, 0]}>
				<boxGeometry args={[3.2, 0.12, 0.9]} />
				<meshStandardMaterial
					color="#8a93a8"
					metalness={0.5}
					roughness={0.4}
				/>
			</mesh>
			{/* engine glow */}
			<mesh position={[0, -1.3, 0]}>
				<sphereGeometry args={[0.34, 12, 12]} />
				<meshStandardMaterial
					color="#69b7ff"
					emissive="#3aa0ff"
					emissiveIntensity={2.2}
				/>
			</mesh>
		</group>
	);
}

/** Drives the ship transform from keys + trails the camera behind it each frame. */
function Flight({ heading }: { heading: number }): ReactElement {
	const ship = useRef<THREE.Group>(null);
	const keys = useKeys();
	const { camera } = useThree();
	// yaw (heading around Y), velocity on the XZ plane.
	const state = useRef({
		yaw: -((heading / 16) * Math.PI * 2),
		vel: new THREE.Vector3(),
	});
	const tmp = useMemo(() => new THREE.Vector3(), []);

	useFrame((_, dtRaw) => {
		const dt = Math.min(dtRaw, 0.05);
		const k = keys.current;
		const s = state.current;
		const g = ship.current;
		if (!g) return;

		const left = k.has('KeyA') || k.has('ArrowLeft');
		const right = k.has('KeyD') || k.has('ArrowRight');
		const fwd = k.has('KeyW') || k.has('ArrowUp');
		const back = k.has('KeyS') || k.has('ArrowDown');

		const turn = (left ? 1 : 0) - (right ? 1 : 0);
		s.yaw += turn * TURN_RATE * dt;

		// forward unit vector from yaw (ship nose = +Z, rotated by yaw around Y).
		const fx = Math.sin(s.yaw);
		const fz = Math.cos(s.yaw);
		const thrust = (fwd ? 1 : 0) - (back ? 0.6 : 0);
		s.vel.x += fx * thrust * THRUST * dt;
		s.vel.z += fz * thrust * THRUST * dt;

		// damping + clamp.
		const damp = Math.max(0, 1 - DAMP * dt);
		s.vel.multiplyScalar(damp);
		if (s.vel.length() > MAX_SPEED) s.vel.setLength(MAX_SPEED);

		g.position.addScaledVector(s.vel, dt);
		g.rotation.set(0, s.yaw, turn * -BANK_MAX);

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
				<Flight heading={heading} />
			</Canvas>
			<SpaceHud />
		</div>
	);
}

/** Minimal on-screen controls hint. */
function SpaceHud(): ReactElement {
	return (
		<div
			style={{
				position: 'absolute',
				bottom: 16,
				left: 0,
				right: 0,
				textAlign: 'center',
				fontFamily: 'monospace',
				fontSize: 12,
				color: '#9fb3d8',
				textShadow: '0 1px 2px rgba(0,0,0,0.9)',
				pointerEvents: 'none',
			}}>
			W/S thrust · A/D turn · Esc to re-enter atmosphere
		</div>
	);
}
