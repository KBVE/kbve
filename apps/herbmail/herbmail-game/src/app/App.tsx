import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Dungeon } from '../game/dungeon/Dungeon';
import { AimReticle } from '../game/hud/AimReticle';
import { TorchPlacer } from '../game/prop/TorchPlacer';
import { CratePlacer } from '../game/prop/CratePlacer';
import { PropRenderer } from '../game/render/PropRenderer';
import { Hud } from '../game/hud/Hud';
import { PlayerBars } from '../game/hud/PlayerBars';
import { DoorPrompt } from '../game/door/DoorPrompt';
import { PSX_DEFAULTS } from '../game/config';
import { ThirdPersonPlayer } from '../game/character/ThirdPersonPlayer';
import { EquipmentPanel } from '../game/character/EquipmentPanel';
import { HeldGripDebug } from '../game/character/HeldGripDebug';
import { LOADOUT } from '../game/viewmodel/equipment';
import { setEquipped, useEquippedId } from '../game/viewmodel/store';

// Dev cache-bust: browsers cache /models/*.glb by URL, so a re-baked model can
// serve stale for hours. A per-load query forces a fresh fetch in dev only.
const CHARACTER_URL = `/models/character-anim.glb${
	import.meta.env.DEV ? `?v=${Date.now()}` : ''
}`;

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
				shadows="percentage"
				dpr={psx.dpr}
				gl={{ antialias: true, powerPreference: 'high-performance' }}
				camera={{ fov: psx.fov, near: 0.05, far: 34 }}
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
					<ThirdPersonPlayer url={CHARACTER_URL} />
				</Suspense>
				<Suspense fallback={null}>
					<PropRenderer ambient={0.04} />
				</Suspense>
				<TorchPlacer />
				<CratePlacer />
				<AimReticle onAim={setAim} />
			</Canvas>
			<Hud kind={aim} equippedId={equippedId} />
			<PlayerBars />
			<DoorPrompt />
			<EquipmentPanel />
			{debug && <HeldGripDebug />}
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
				click to look · WASD move · F unlock door · LMB mount torch · R
				reload · 1-3 equip · ` debug
			</div>
		</>
	);
}
