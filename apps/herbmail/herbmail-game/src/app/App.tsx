import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Dungeon } from '../game/dungeon/Dungeon';
import { AimReticle } from '../game/hud/AimReticle';
import { TorchPlacer } from '../game/prop/TorchPlacer';
import { CratePlacer } from '../game/prop/CratePlacer';
import { PropRenderer } from '../game/render/PropRenderer';
import { Hud } from '../game/hud/Hud';
import { PlayerBars } from '../game/hud/PlayerBars';
import { InteractPrompt } from '../game/interact/InteractPrompt';
import { PSX_DEFAULTS } from '../game/config';
import { ThirdPersonPlayer } from '../game/character/ThirdPersonPlayer';
import { PhysicsBodies } from '../game/sab/PhysicsBodies';
import { HeldGripDebug } from '../game/character/HeldGripDebug';
import { LOADOUT } from '../game/viewmodel/equipment';
import { setEquipped, useEquippedId } from '../game/viewmodel/store';
import { InventoryPanel } from '../game/inventory/InventoryPanel';
import { BodyMorphPanel } from '../game/inventory/BodyMorphPanel';
import { toggleOpen } from '../game/inventory/store';

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

			if (e.code === 'KeyI') {
				const open = toggleOpen();
				if (open) document.exitPointerLock();
				return;
			}

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
					// Preventing the default on context loss lets the browser +
					// three re-create the GL resources; without it the canvas stays
					// black after a GPU reset / tab throttle (common on itch embeds).
					gl.domElement.addEventListener(
						'webglcontextlost',
						(e) => e.preventDefault(),
						false,
					);
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
				<PhysicsBodies />
				<TorchPlacer />
				<CratePlacer />
				<AimReticle onAim={setAim} />
			</Canvas>
			<Hud kind={aim} equippedId={equippedId} />
			<PlayerBars />
			<InteractPrompt />
			<InventoryPanel />
			{debug && <HeldGripDebug />}
			{debug && <BodyMorphPanel />}
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
				reload · 1-3 equip · I inventory · ` debug
			</div>
		</>
	);
}
