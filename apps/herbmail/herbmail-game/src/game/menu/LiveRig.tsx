import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Character, type CharacterHandle } from '../character/Character';
import { CHARACTER_URL } from '../character/modelUrl';
import type { CharacterMotor } from '../character/CharacterMotor';
import { CS } from '../character/charState';
import {
	addComponent,
	addEntity,
	createWorld,
	removeEntity,
	CharState,
	HeldItems,
	Transform3,
} from '../mecs/props';

// The Live Rig is the 1:1 debug bench: the REAL <Character> component (bit
// resolver, procedural spine/arm/strafe passes, block overlays) driven by the
// same motor/handle inputs the game uses, on a real CharState entity. If it
// breaks in-game, it breaks here — under lights.
const world = createWorld();

type Gait = 'idle' | 'walk' | 'jog';

interface RigControls {
	gait: Gait;
	headingDeg: number;
	lock: boolean;
	block: boolean;
}

const SPEEDS: Record<Gait, number> = { idle: 0, walk: 1.8, jog: 4.5 };
const HEADINGS = [0, 45, 90, 135, 180, -135, -90, -45];

const BIT_LABELS: [string, number][] = [
	['MOVING', CS.MOVING],
	['RUNNING', CS.RUNNING],
	['AIRBORNE', CS.AIRBORNE],
	['RISING', CS.RISING],
	['LANDING', CS.LANDING],
	['EXHAUSTED', CS.EXHAUSTED],
	['BLOCKING', CS.BLOCKING],
	['ATTACKING', CS.ATTACKING],
	['COMBAT_LOCK', CS.COMBAT_LOCK],
	['HARD_LOCK', CS.HARD_LOCK],
	['DEAD', CS.DEAD],
	['HAS_WEAPON', CS.HAS_WEAPON],
	['HAS_SHIELD', CS.HAS_SHIELD],
	['HAS_LIGHT', CS.HAS_LIGHT],
];

function BitsReadout({ eid }: { eid: number }) {
	const [bits, setBits] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setBits(CharState.bits[eid]), 100);
		return () => clearInterval(id);
	}, [eid]);
	return (
		<div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
			{BIT_LABELS.map(([label, mask]) => {
				const on = (bits & mask) !== 0;
				return (
					<span
						key={label}
						style={{
							padding: '2px 7px',
							borderRadius: 3,
							fontSize: 10,
							border: '1px solid',
							borderColor: on ? '#7ac77a88' : '#ffffff18',
							background: on ? '#2f4a2f88' : 'transparent',
							opacity: on ? 1 : 0.35,
						}}>
						{label}
					</span>
				);
			})}
			<span style={{ opacity: 0.4, fontSize: 10, padding: '2px 4px' }}>
				0x{bits.toString(16)}
			</span>
		</div>
	);
}

function makeDrive(controls: React.MutableRefObject<RigControls>) {
	return (motor: CharacterMotor) => {
		const c = controls.current;
		const speed = SPEEDS[c.gait];
		const a = (c.headingDeg * Math.PI) / 180;
		motor.setDesiredVelocity(Math.sin(a) * speed, Math.cos(a) * speed);
		// Lock = square up to a target due north, exactly like combat lock.
		motor.yawLock = c.lock ? 0 : null;
	};
}

function RigStage({
	eid,
	controls,
	handleRef,
}: {
	eid: number;
	controls: React.MutableRefObject<RigControls>;
	handleRef: React.MutableRefObject<CharacterHandle | null>;
}) {
	const drive = useMemo(() => makeDrive(controls), [controls]);
	useFrame(() => {
		Transform3.px[eid] = 0;
		Transform3.pz[eid] = 0;
	});
	return (
		<Character
			url={CHARACTER_URL}
			stateEid={() => eid}
			drive={drive}
			onReady={(h) => {
				// Stationary bench: velocity feeds gait/bits, position pinned.
				h.motor.mover = () => void 0;
				handleRef.current = h;
			}}
		/>
	);
}

export function LiveRig() {
	const [eid] = useState(() => {
		const e = addEntity(world);
		addComponent(world, e, Transform3);
		addComponent(world, e, CharState);
		addComponent(world, e, HeldItems);
		return e;
	});
	useEffect(() => () => removeEntity(world, eid), [eid]);

	// Buttons render from state; the per-frame drive closure reads the mirror
	// ref so it never retriggers React.
	const [c, setC] = useState<RigControls>({
		gait: 'idle',
		headingDeg: 0,
		lock: false,
		block: false,
	});
	const controls = useRef<RigControls>(c);
	useEffect(() => {
		controls.current = c;
	}, [c]);
	const handleRef = useRef<CharacterHandle | null>(null);
	const set = (patch: Partial<RigControls>) =>
		setC((prev) => ({ ...prev, ...patch }));

	return (
		<div
			style={{
				flex: 1,
				minHeight: 0,
				display: 'flex',
				flexDirection: 'column',
			}}>
			<div style={{ flex: 1, minHeight: 0 }}>
				<Canvas
					camera={{ fov: 35, position: [0, 1.4, 3.2] }}
					style={{ background: '#0a0a0e' }}
					gl={{ antialias: true }}>
					<ambientLight intensity={0.6} />
					<directionalLight position={[2, 4, 3]} intensity={1.4} />
					<directionalLight position={[-3, 2, -2]} intensity={0.4} />
					<gridHelper args={[8, 16, '#334', '#223']} />
					<RigStage
						eid={eid}
						controls={controls}
						handleRef={handleRef}
					/>
					<OrbitControls
						makeDefault
						target={[0, 0.9, 0]}
						minDistance={1.2}
						maxDistance={8}
					/>
				</Canvas>
			</div>
			<div
				style={{
					padding: '12px 18px',
					borderTop: '1px solid #ffffff18',
					display: 'flex',
					flexDirection: 'column',
					gap: 8,
				}}>
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
					{(['idle', 'walk', 'jog'] as Gait[]).map((g) => (
						<button
							key={g}
							onClick={() => set({ gait: g })}
							style={rigBtn(c.gait === g)}>
							{g}
						</button>
					))}
					<span style={{ width: 12 }} />
					{HEADINGS.map((h) => (
						<button
							key={h}
							onClick={() => set({ headingDeg: h })}
							style={rigBtn(c.headingDeg === h)}>
							{h}°
						</button>
					))}
					<span style={{ width: 12 }} />
					<button
						onClick={() => set({ lock: !c.lock })}
						style={rigBtn(c.lock)}>
						lock
					</button>
					<button
						onClick={() => {
							const on = !c.block;
							set({ block: on });
							handleRef.current?.setBlocking(on);
						}}
						style={rigBtn(c.block)}>
						block
					</button>
					<button
						onClick={() => handleRef.current?.motor.jump()}
						style={rigBtn(false)}>
						jump
					</button>
					<button
						onClick={() => void handleRef.current?.punch()}
						style={rigBtn(false)}>
						punch
					</button>
				</div>
				<BitsReadout eid={eid} />
			</div>
		</div>
	);
}

function rigBtn(on: boolean): React.CSSProperties {
	return {
		background: on ? '#4a6a8a88' : '#ffffff12',
		border: `1px solid ${on ? '#7ab6ff' : '#ffffff22'}`,
		color: '#fff',
		padding: '4px 10px',
		borderRadius: 4,
		cursor: 'pointer',
		fontSize: 12,
	};
}
