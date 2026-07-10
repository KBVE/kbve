import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { DungeonScene } from '../game/DungeonScene';
import { FpsControls } from '../game/FpsControls';
import { AimReticle } from '../game/AimReticle';
import { Hud } from '../game/Hud';
import { PSX_DEFAULTS } from '../game/config';
import { Viewmodel } from '../game/viewmodel/Viewmodel';
import { ViewmodelDebug } from '../game/viewmodel/ViewmodelDebug';
import { REST, type ViewmodelRest } from '../game/viewmodel/config';
import { LOADOUT } from '../game/viewmodel/equipment';
import { setEquipped, useEquippedId } from '../game/viewmodel/store';

export function App() {
	const [psx] = useState({ ...PSX_DEFAULTS });
	const [aim, setAim] = useState<string | null>(null);
	const [rest, setRest] = useState<ViewmodelRest>({ ...REST });
	const [debug, setDebug] = useState(false);
	const equippedId = useEquippedId();

	const restRef = useRef(rest);
	const debugRef = useRef(debug);
	useEffect(() => {
		restRef.current = rest;
		debugRef.current = debug;
	}, [rest, debug]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.code === 'Backquote') setDebug((d) => !d);

			const el = e.target as HTMLElement;
			if (el?.tagName === 'INPUT') return;

			{
				if (e.code === 'Backspace' || e.code === 'Digit0') {
					e.preventDefault();
					setRest({ ...REST });
					console.info('[viewmodel] reset to default');
					return;
				}
				const r = { ...restRef.current };
				const P = 0.02;
				const A = 0.15;
				const S = 0.005;
				let hit = true;
				switch (e.code) {
					case 'ArrowUp':
						r.pz -= P;
						break;
					case 'ArrowDown':
						r.pz += P;
						break;
					case 'ArrowLeft':
						r.py -= P;
						break;
					case 'ArrowRight':
						r.py += P;
						break;
					case 'KeyF':
						r.ry += Math.PI;
						break;
					case 'KeyN':
						r.px -= P;
						break;
					case 'KeyM':
						r.px += P;
						break;
					case 'KeyI':
						r.rx += A;
						break;
					case 'KeyK':
						r.rx -= A;
						break;
					case 'KeyJ':
						r.ry += A;
						break;
					case 'KeyL':
						r.ry -= A;
						break;
					case 'KeyU':
						r.rz += A;
						break;
					case 'KeyO':
						r.rz -= A;
						break;
					case 'BracketLeft':
						r.scale = Math.max(0.01, r.scale - S);
						break;
					case 'BracketRight':
						r.scale += S;
						break;
					case 'Enter':
						console.info(
							'[viewmodel] REST =',
							JSON.stringify(restRef.current),
						);
						return;
					default:
						hit = false;
				}
				if (hit) {
					e.preventDefault();
					setRest(r);
					return;
				}
			}

			const n = Number(e.key);
			if (n >= 1 && n <= LOADOUT.length) setEquipped(LOADOUT[n - 1].id);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	return (
		<>
			<Canvas
				dpr={psx.dpr}
				gl={{ antialias: true, powerPreference: 'high-performance' }}
				camera={{ fov: psx.fov, near: 0.05, far: 100 }}
				style={{ imageRendering: 'pixelated' }}>
				<color attach="background" args={['#0a0a0e']} />
				<hemisphereLight args={['#fff0e6', '#20202c', 2.2]} />
				<ambientLight intensity={0.5} />
				<Suspense fallback={null}>
					<DungeonScene snap={psx.snap} affine={psx.affine} />
				</Suspense>
				<Suspense fallback={null}>
					<Viewmodel
						equippedId={equippedId}
						snap={psx.snap}
						restOverride={rest}
					/>
				</Suspense>
				<FpsControls eye={psx.eye} fov={psx.fov} />
				<AimReticle onAim={setAim} />
			</Canvas>
			<Hud kind={aim} equippedId={equippedId} />
			{debug && <ViewmodelDebug value={rest} onChange={setRest} />}
			<div
				style={{
					position: 'fixed',
					inset: 0,
					display: 'flex',
					alignItems: 'flex-end',
					justifyContent: 'center',
					padding: '2rem',
					pointerEvents: 'none',
					color: '#c9c9d6',
					font: '13px monospace',
					textShadow: '0 1px 2px #000',
				}}>
				click to look · WASD move · LMB use · RMB/E interact · R reload
				· 1-3 equip · ` debug
			</div>
		</>
	);
}
