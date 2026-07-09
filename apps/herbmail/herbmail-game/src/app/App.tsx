import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { DungeonScene } from '../game/DungeonScene';
import { FpsControls } from '../game/FpsControls';

export function App() {
	return (
		<>
			<Canvas
				dpr={0.25}
				gl={{ antialias: true, powerPreference: 'high-performance' }}
				camera={{ fov: 70, near: 0.05, far: 100 }}
				style={{ imageRendering: 'pixelated' }}>
				<color attach="background" args={['#0a0a0e']} />
				<Suspense fallback={null}>
					<DungeonScene />
				</Suspense>
				<FpsControls />
			</Canvas>
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
