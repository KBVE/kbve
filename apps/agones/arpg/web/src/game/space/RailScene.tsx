import {
	Suspense,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactElement,
	type RefObject,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import { ShipModel } from './ShipModel';

/**
 * Mission 1 — "Survive the Gauntlet". An on-rails (Star Fox) space run: the ship is
 * locked to a spline track and auto-advances; the pilot only dodges within a bounded
 * window (no free flight — that's <SpaceScene>). Fly an asteroid field to the end of
 * the rail alive. No combat in this slice — pure dodge. Reach the end = win; health to
 * zero = fail. Client-solo, no server.
 */

const SPEED = 22; // units/sec along the rail
const LAT_SPEED = 14; // dodge speed within the window (units/sec)
const WINDOW = 5.2; // half-size of the dodge box (lateral + vertical), units
const SHIP_R = 1.1; // ship collision radius
const HIT_DMG = 26; // health lost per asteroid clip
const ASTEROIDS = 46;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

type Result = 'active' | 'success' | 'fail';

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

/** A meandering CatmullRom rail through space — gentle banks/climbs, no sharp turns. */
function makeRail(): THREE.CatmullRomCurve3 {
	const pts: THREE.Vector3[] = [];
	const N = 14;
	for (let i = 0; i <= N; i++) {
		const z = i * 60;
		// smooth low-frequency wander so the track curves without whipping the camera.
		const x = Math.sin(i * 0.55) * 26 + Math.sin(i * 0.21) * 14;
		const y = Math.sin(i * 0.4 + 1.3) * 12;
		pts.push(new THREE.Vector3(x, y, z));
	}
	const c = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
	return c;
}

/** Orthonormal frame on the rail at param u: forward (tangent), right, up. */
function railFrame(curve: THREE.CatmullRomCurve3, u: number) {
	const fwd = curve.getTangentAt(u, new THREE.Vector3()).normalize();
	const right = new THREE.Vector3().crossVectors(WORLD_UP, fwd).normalize();
	const up = new THREE.Vector3().crossVectors(fwd, right).normalize();
	return { fwd, right, up };
}

interface Rock {
	pos: THREE.Vector3;
	r: number;
	rot: THREE.Euler;
	hit: boolean;
}

/** Scatter rocks along the rail, offset within the dodge window, skipping the start. */
function makeRocks(curve: THREE.CatmullRomCurve3): Rock[] {
	const rocks: Rock[] = [];
	for (let i = 0; i < ASTEROIDS; i++) {
		const u = 0.06 + (i / ASTEROIDS) * 0.9 + (Math.random() - 0.5) * 0.01;
		const { right, up } = railFrame(curve, u);
		const ox = (Math.random() * 2 - 1) * WINDOW;
		const oy = (Math.random() * 2 - 1) * WINDOW;
		const pos = curve
			.getPointAt(u, new THREE.Vector3())
			.addScaledVector(right, ox)
			.addScaledVector(up, oy);
		rocks.push({
			pos,
			r: 0.9 + Math.random() * 1.6,
			rot: new THREE.Euler(
				Math.random() * 3,
				Math.random() * 3,
				Math.random() * 3,
			),
			hit: false,
		});
	}
	return rocks;
}

function RailFlight({
	curve,
	rocks,
	onHealth,
	onProgress,
	onResult,
	paused,
}: {
	curve: THREE.CatmullRomCurve3;
	rocks: Rock[];
	onHealth: (h: number) => void;
	onProgress: (p: number) => void;
	onResult: (r: Result) => void;
	paused: boolean;
}): ReactElement {
	const ship = useRef<THREE.Group>(null);
	const keys = useKeys();
	const { camera } = useThree();
	const state = useRef({ u: 0, ox: 0, oy: 0, hp: 100, done: false });
	const len = useMemo(() => curve.getLength(), [curve]);
	const tmp = useMemo(() => new THREE.Vector3(), []);
	const camPos = useMemo(() => new THREE.Vector3(), []);
	const lookAt = useMemo(() => new THREE.Vector3(), []);

	useFrame((_, dtRaw) => {
		const g = ship.current;
		const s = state.current;
		if (!g || s.done || paused) return;
		const dt = Math.min(dtRaw, 0.05);
		const k = keys.current;

		// advance along the rail (arc-length param so speed is constant on curves).
		s.u = Math.min(1, s.u + (SPEED / len) * dt);

		// dodge within the bounded window.
		const lat =
			(k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) -
			(k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
		const vert =
			(k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) -
			(k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
		s.ox = THREE.MathUtils.clamp(
			s.ox + lat * LAT_SPEED * dt,
			-WINDOW,
			WINDOW,
		);
		s.oy = THREE.MathUtils.clamp(
			s.oy + vert * LAT_SPEED * dt,
			-WINDOW,
			WINDOW,
		);

		const { fwd, right, up } = railFrame(curve, s.u);
		const base = curve.getPointAt(s.u, tmp);
		g.position
			.copy(base)
			.addScaledVector(right, s.ox)
			.addScaledVector(up, s.oy);

		// orient the hull down the rail, banking into the lateral input.
		const look = g.position.clone().add(fwd);
		g.up.copy(up);
		g.lookAt(look);
		g.rotateZ(-lat * 0.5);

		// collisions: any un-hit rock within reach this frame clips the hull.
		for (const rk of rocks) {
			if (rk.hit) continue;
			if (g.position.distanceTo(rk.pos) < rk.r + SHIP_R) {
				rk.hit = true;
				s.hp = Math.max(0, s.hp - HIT_DMG);
				onHealth(s.hp);
				if (s.hp <= 0) {
					s.done = true;
					onResult('fail');
				}
			}
		}

		onProgress(s.u);
		if (s.u >= 1 && !s.done) {
			s.done = true;
			onResult('success');
		}

		// chase camera: behind + above the ship, looking down the rail.
		camPos
			.copy(g.position)
			.addScaledVector(fwd, -9)
			.addScaledVector(up, 3.2);
		camera.position.lerp(camPos, 1 - Math.pow(0.0008, dt));
		lookAt.copy(g.position).addScaledVector(fwd, 6);
		camera.lookAt(lookAt);
	});

	return (
		<group ref={ship}>
			<ShipModel />
		</group>
	);
}

/** Static asteroid field rendered along the rail. */
function Rocks({ rocks }: { rocks: Rock[] }): ReactElement {
	return (
		<>
			{rocks.map((rk, i) => (
				<mesh key={i} position={rk.pos} rotation={rk.rot} castShadow>
					<icosahedronGeometry args={[rk.r, 0]} />
					<meshStandardMaterial
						color="#6b5d4f"
						roughness={1}
						metalness={0.1}
						flatShading
					/>
				</mesh>
			))}
		</>
	);
}

export function RailScene({ onExit }: { onExit: () => void }): ReactElement {
	const curve = useMemo(() => makeRail(), []);
	const rocks = useMemo(() => makeRocks(curve), [curve]);
	const [health, setHealth] = useState(100);
	const [progress, setProgress] = useState(0);
	const [result, setResult] = useState<Result>('active');

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.code === 'Escape') onExit();
			// Enter/Space leaves the mission once it's resolved.
			if (
				result !== 'active' &&
				(e.code === 'Enter' || e.code === 'Space')
			)
				onExit();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onExit, result]);

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				background:
					'radial-gradient(ellipse at 50% 35%, #10183a 0%, #05060f 70%, #000 100%)',
			}}>
			<Canvas
				shadows
				camera={{
					position: [0, 4, -12],
					fov: 62,
					near: 0.1,
					far: 4000,
				}}>
				<ambientLight intensity={0.55} />
				<directionalLight
					position={[30, 50, 20]}
					intensity={1.4}
					castShadow
				/>
				<Stars
					radius={500}
					depth={140}
					count={7000}
					factor={6}
					saturation={0}
					fade
				/>
				<Suspense fallback={null}>
					<RailFlight
						curve={curve}
						rocks={rocks}
						onHealth={setHealth}
						onProgress={setProgress}
						onResult={setResult}
						paused={result !== 'active'}
					/>
				</Suspense>
				<Rocks rocks={rocks} />
			</Canvas>
			<RailHud health={health} progress={progress} result={result} />
		</div>
	);
}

function RailHud({
	health,
	progress,
	result,
}: {
	health: number;
	progress: number;
	result: Result;
}): ReactElement {
	return (
		<>
			{/* top: health + progress bars */}
			<div
				style={{
					position: 'absolute',
					top: 14,
					left: 16,
					right: 16,
					display: 'flex',
					gap: 16,
					fontFamily: 'monospace',
					fontSize: 12,
					color: '#bcd0f5',
					textShadow: '0 1px 2px rgba(0,0,0,0.9)',
					pointerEvents: 'none',
				}}>
				<Bar
					label="HULL"
					value={health / 100}
					color="#54e08a"
					warn={health <= 26}
				/>
				<Bar label="RAIL" value={progress} color="#69b7ff" />
			</div>

			{/* center status / result */}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					fontFamily: 'monospace',
					textAlign: 'center',
					color: '#eaf2ff',
					textShadow: '0 2px 6px rgba(0,0,0,0.95)',
					pointerEvents: 'none',
				}}>
				{result === 'active' ? null : (
					<>
						<div
							style={{
								fontSize: 34,
								fontWeight: 700,
								letterSpacing: 2,
							}}>
							{result === 'success'
								? 'GAUNTLET CLEARED'
								: 'HULL DESTROYED'}
						</div>
						<div
							style={{
								fontSize: 13,
								marginTop: 10,
								color: '#9fb3d8',
							}}>
							Enter to return · Esc to leave space
						</div>
					</>
				)}
			</div>

			{/* bottom controls hint */}
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
				WASD / arrows to dodge · survive to the end of the rail · Esc to
				abort
			</div>
		</>
	);
}

function Bar({
	label,
	value,
	color,
	warn,
}: {
	label: string;
	value: number;
	color: string;
	warn?: boolean;
}): ReactElement {
	return (
		<div style={{ flex: 1 }}>
			<div style={{ marginBottom: 3 }}>{label}</div>
			<div
				style={{
					height: 8,
					background: 'rgba(255,255,255,0.12)',
					borderRadius: 4,
					overflow: 'hidden',
				}}>
				<div
					style={{
						height: '100%',
						width: `${Math.round(THREE.MathUtils.clamp(value, 0, 1) * 100)}%`,
						background: warn ? '#e0544f' : color,
						transition: 'width 120ms linear',
					}}
				/>
			</div>
		</div>
	);
}
