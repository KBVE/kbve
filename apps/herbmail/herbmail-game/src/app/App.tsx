import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Dungeon } from '../game/dungeon/Dungeon';
import { Oases, UnderwaterTint } from '../game/water/OasisView';
import { OasisLevelsDebug } from '../game/water/OasisLevelsDebug';
import { AimReticle } from '../game/hud/AimReticle';
import { TorchPlacer } from '../game/prop/TorchPlacer';
import { CratePlacer } from '../game/prop/CratePlacer';
import { PropRenderer } from '../game/render/PropRenderer';
import { Hud } from '../game/hud/Hud';
import { PlayerBars } from '../game/hud/PlayerBars';
import { AbilityBar } from '../game/hud/AbilityBar';
import { InteractPrompt } from '../game/interact/InteractPrompt';
import { BG_COLOR, PSX_DEFAULTS } from '../game/config';
import { ThirdPersonPlayer } from '../game/character/ThirdPersonPlayer';
import { Goblins } from '../game/npc/Goblins';
import { KurenaiNpc } from '../game/npc/KurenaiNpc';
import { EnemyHealthBars } from '../game/npc/EnemyHealthBars';
import { PhysicsBodies } from '../game/sab/PhysicsBodies';
import { AOComposer } from '../game/render/AOComposer';
import { AdaptiveQuality } from '../game/render/AdaptiveQuality';
import { DungeonSky } from '../game/render/DungeonSky';
import { SunShaft } from '../game/render/SunShaft';
import { EagleEye } from '../game/render/EagleEye';
import { HeldGripDebug } from '../game/character/HeldGripDebug';
import { DebugStats, StatsProbe } from '../game/hud/DebugStats';
import { useEquippedId } from '../game/viewmodel/store';
import { requestCast } from '../game/combat/castSystem';
import { playerEid } from '../game/character/playerEntity';
import { ABILITY_SLOTS } from '../game/combat/ability';
import { InventoryPanel } from '../game/inventory/InventoryPanel';
import { BodyMorphPanel } from '../game/inventory/BodyMorphPanel';
import { toggleOpen, isOpen as isInventoryOpen } from '../game/inventory/store';
import { CHARACTER_URL } from '../game/character/modelUrl';
import { MainMenu } from '../game/menu/MainMenu';
import { Codex } from '../game/menu/Codex';
import { SettingsPanel } from '../game/menu/SettingsPanel';
import { useScreen, setScreen, isPlaying } from '../game/menu/store';
import {
	toggleEagle,
	setEagle,
	isEagle,
	useEagle,
} from '../game/menu/eagleStore';
import { usePsx } from '../game/menu/settingsStore';

export function App() {
	const psx = usePsx();
	const screen = useScreen();
	const [aim, setAim] = useState<string | null>(null);
	const [debug, setDebug] = useState(false);
	const eagle = useEagle();
	const equippedId = useEquippedId();

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.code === 'Escape') {
				if (isInventoryOpen()) {
					toggleOpen();
					return;
				}
				if (isEagle()) {
					setEagle(false);
					return;
				}
				document.exitPointerLock();
				setScreen('main');
				return;
			}
			if (e.code === 'Backquote') setDebug((d) => !d);

			const el = e.target as HTMLElement;
			if (el?.tagName === 'INPUT') return;
			if (!isPlaying()) return;

			if (e.code === 'KeyV') {
				toggleEagle();
				return;
			}

			if (e.code === 'KeyI') {
				const open = toggleOpen();
				if (open) document.exitPointerLock();
				return;
			}

			const digit = e.code.match(/^Digit([1-9])$/);
			if (digit) {
				const slot = Number(digit[1]);
				if (slot >= 1 && slot <= ABILITY_SLOTS)
					requestCast(playerEid(), slot);
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
				gl={{ antialias: false, powerPreference: 'high-performance' }}
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
				style={{
					imageRendering: psx.dpr < 1 ? 'pixelated' : 'auto',
				}}>
				<color attach="background" args={[BG_COLOR]} />
				<DungeonSky />
				<ambientLight intensity={0.12} />
				<Suspense fallback={null}>
					<Dungeon snap={psx.snap} affine={psx.affine} />
				</Suspense>
				<Suspense fallback={null}>
					<Oases />
				</Suspense>
				<SunShaft />
				<Suspense fallback={null}>
					<ThirdPersonPlayer url={CHARACTER_URL} />
				</Suspense>
				<Suspense fallback={null}>
					<Goblins />
				</Suspense>
				<Suspense fallback={null}>
					<KurenaiNpc />
				</Suspense>
				<EnemyHealthBars />
				<Suspense fallback={null}>
					<PropRenderer ambient={0.04} />
				</Suspense>
				<PhysicsBodies />
				<AOComposer />
				<AdaptiveQuality />
				<EagleEye />
				{debug && <StatsProbe />}
				{debug && <OasisLevelsDebug />}
				<TorchPlacer />
				<CratePlacer />
				<AimReticle onAim={setAim} />
			</Canvas>
			<UnderwaterTint />
			{screen === 'playing' && (
				<>
					<Hud kind={aim} equippedId={equippedId} />
					<PlayerBars />
					<AbilityBar />
					<InteractPrompt />
					<InventoryPanel />
					{debug && <HeldGripDebug />}
					{debug && <BodyMorphPanel />}
					{debug && <DebugStats />}
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
						click to look · WASD move · F unlock door · LMB attack ·
						1-4 abilities · I inventory · Esc menu
					</div>
				</>
			)}
			{eagle && (
				<div
					style={{
						position: 'fixed',
						top: '1rem',
						left: '50%',
						transform: 'translateX(-50%)',
						pointerEvents: 'none',
						color: '#ffd27f',
						font: '12px monospace',
						letterSpacing: '0.1em',
						textShadow: '0 1px 2px #000',
					}}>
					SNAPSHOT · frozen player-view draw set · drag orbit · scroll
					zoom · ` stats · V/Esc exit
				</div>
			)}
			{screen === 'main' && <MainMenu />}
			{screen === 'codex' && <Codex />}
			{screen === 'settings' && <SettingsPanel />}
		</>
	);
}
