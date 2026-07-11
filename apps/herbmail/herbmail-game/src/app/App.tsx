import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Dungeon } from '../game/Dungeon';
import { AimReticle } from '../game/AimReticle';
import { TorchPlacer } from '../game/TorchPlacer';
import { PropRenderer } from '../game/render/PropRenderer';
import { Hud } from '../game/Hud';
import { PSX_DEFAULTS } from '../game/config';
import { ThirdPersonPlayer } from '../game/character/ThirdPersonPlayer';
import { EquipmentPanel } from '../game/character/EquipmentPanel';
import { SwordGripDebug } from '../game/character/SwordGripDebug';
import { LOADOUT } from '../game/viewmodel/equipment';
import { setEquipped, useEquippedId } from '../game/viewmodel/store';

export function App() {
	const [psx] = useState({ ...PSX_DEFAULTS });
	const [aim, setAim] = useState<string | null>(null);
	const [debug, setDebug] = useState(false);
	const equippedId = useEquippedId();

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.code === 'Backquote') setDebug((d) => !d);

			const el = e.target as HTMLElement;
			if (el?.tagName === 'INPUT') return;

			const digit = e.code.match(/^Digit([1-9])$/);
			if (digit) {
				const idx = Number(digit[1]) - 1;
				if (idx < LOADOUT.length) setEquipped(LOADOUT[idx].id);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	return (
		<>
			<Canvas
				shadows
				dpr={psx.dpr}
				gl={{ antialias: true, powerPreference: 'high-performance' }}
				camera={{ fov: psx.fov, near: 0.05, far: 100 }}
				onCreated={({ camera, scene, gl }) => {
					(window as unknown as Record<string, unknown>).__vm = {
						camera,
						scene,
						gl,
					};
				}}
				style={{ imageRendering: 'pixelated' }}>
				<color attach="background" args={['#0a0a0e']} />
				<ambientLight intensity={0.05} />
				<Suspense fallback={null}>
					<Dungeon snap={psx.snap} affine={psx.affine} />
				</Suspense>
				<Suspense fallback={null}>
					<ThirdPersonPlayer url="/models/character-anim.glb" />
				</Suspense>
				<Suspense fallback={null}>
					<PropRenderer ambient={0.04} />
				</Suspense>
				<TorchPlacer />
				<AimReticle onAim={setAim} />
			</Canvas>
			<Hud kind={aim} equippedId={equippedId} />
			<EquipmentPanel />
			{debug && <SwordGripDebug />}
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
				click to look · WASD move · LMB mount torch · R reload · 1-3
				equip · ` debug
			</div>
		</>
	);
}
