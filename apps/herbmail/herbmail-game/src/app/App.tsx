import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { DungeonScene } from '../game/DungeonScene';
import { FpsControls } from '../game/FpsControls';
import { AimReticle } from '../game/AimReticle';
import { Hud } from '../game/Hud';
import { PSX_DEFAULTS } from '../game/config';

export function App() {
	const [psx] = useState({ ...PSX_DEFAULTS });
	const [aim, setAim] = useState<string | null>(null);

	return (
		<>
			<Canvas
				dpr={psx.dpr}
				gl={{ antialias: true, powerPreference: 'high-performance' }}
				camera={{ fov: psx.fov, near: 0.05, far: 100 }}
				style={{ imageRendering: 'pixelated' }}>
				<color attach="background" args={['#0a0a0e']} />
				<Suspense fallback={null}>
					<DungeonScene snap={psx.snap} affine={psx.affine} />
				</Suspense>
				<FpsControls eye={psx.eye} fov={psx.fov} />
				<AimReticle onAim={setAim} />
			</Canvas>
			<Hud kind={aim} />
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
				click to look · WASD to move · esc to release
			</div>
		</>
	);
}
