import {
	useEffect,
	useRef,
	useState,
	type ReactElement,
	type ReactNode,
} from 'react';
import type Phaser from 'phaser';
import { onSpaceEnter, emitSpaceExit } from '../systems/hud';
import { SpaceScene } from './SpaceScene';
import { RailScene } from './RailScene';

const SCENE_KEY = 'IsoArpgScene';
// Atmosphere-crossing fade that masks the iso ↔ 3D swap. A slow ease through deep
// space-dark (not a harsh white cut) reads as punching through the atmosphere.
const FLASH_MS = 650;

/** Which 3D view is up while in space: pick-a-mode menu, free roam, or the rail mission. */
type SpaceView = 'menu' | 'free' | 'rail';

/**
 * Owns the iso ↔ 3D handoff. Mounts as a sibling of the Phaser canvas + HUD and stays
 * inert until the scene fires SPACE_ENTER (the leaving cutscene finished). Then it
 * pauses the Phaser scene, flashes white over the seam, and mounts the solo 3D
 * <SpaceScene> on top. Esc in space emits SPACE_EXIT — the scene relays it to the
 * server (`returnSpace`) — and this resumes Phaser + tears the 3D scene down. Keeping
 * the swap here (not in ReactIsoArpgApp) means the parent only adds a one-line mount.
 */
export function SpaceMode({
	getGame,
}: {
	getGame: () => Phaser.Game | null;
}): ReactElement | null {
	const [active, setActive] = useState(false);
	const [view, setView] = useState<SpaceView>('menu');
	const [heading, setHeading] = useState(0);
	const [flash, setFlash] = useState(false);
	// On LAUNCH we overlay a hyperspace warp (the 2D→3D punch); the calm return just
	// dissolves. `warp` keys the streak/burst overlay on top of the dark fade.
	const [warp, setWarp] = useState(false);
	const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);

	const pulseFlash = (isWarp = false) => {
		setFlash(true);
		setWarp(isWarp);
		if (flashTimer.current) clearTimeout(flashTimer.current);
		flashTimer.current = setTimeout(() => setFlash(false), FLASH_MS);
	};

	useEffect(() => {
		const off = onSpaceEnter((data) => {
			setHeading(data.heading);
			pulseFlash(true); // launching → hyperspace warp
			// Halt the iso scene's update/render while we're in space; the WebSocket
			// keeps running on its own callbacks so the connection stays warm.
			getGame()?.scene.pause(SCENE_KEY);
			setView('menu');
			setActive(true);
		});
		return () => {
			off();
			if (flashTimer.current) clearTimeout(flashTimer.current);
		};
	}, [getGame]);

	const exit = () => {
		// Tell the scene to ask the server to re-materialise us (returnSpace), flash
		// over the seam, resume Phaser, and drop the 3D scene.
		emitSpaceExit();
		pulseFlash();
		getGame()?.scene.resume(SCENE_KEY);
		setActive(false);
	};

	if (!active && !flash) return null;

	return (
		<div style={{ position: 'absolute', inset: 0, zIndex: 30 }}>
			{active && view === 'menu' && (
				<SpaceMenu
					onFree={() => setView('free')}
					onMission={() => setView('rail')}
					onExit={exit}
				/>
			)}
			{active && view === 'free' && (
				<SpaceScene heading={heading} onExit={() => setView('menu')} />
			)}
			{active && view === 'rail' && (
				<RailScene onExit={() => setView('menu')} />
			)}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					// Deep space-dark gradient (blends into the space scene bg), not a
					// bright white flash — a soft eased dissolve over the seam.
					background:
						'radial-gradient(ellipse at 50% 45%, #1a2550 0%, #070a18 60%, #000 100%)',
					opacity: flash ? 1 : 0,
					transition: `opacity ${FLASH_MS}ms cubic-bezier(0.45, 0, 0.2, 1)`,
					pointerEvents: 'none',
				}}
			/>
			{flash && warp && <WarpOverlay />}
		</div>
	);
}

/**
 * The 2D→3D launch flourish: a radial light burst + hyperspace speed-lines that rush
 * outward and fade, layered over the dark dissolve. Plays once (mounted only during the
 * launch flash). Cyan/blue to match the space HUD; pure CSS, no per-frame JS.
 */
function WarpOverlay(): ReactElement {
	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				overflow: 'hidden',
				pointerEvents: 'none',
				display: 'grid',
				placeItems: 'center',
			}}>
			<style>{WARP_KEYFRAMES}</style>
			{/* hyperspace speed-lines streaking outward from center */}
			<div
				style={{
					width: '140vmax',
					height: '140vmax',
					borderRadius: '50%',
					background:
						'repeating-conic-gradient(from 0deg, transparent 0deg, rgba(180,232,255,0.55) 0.35deg, transparent 1.4deg)',
					WebkitMaskImage:
						'radial-gradient(circle, transparent 6%, #000 38%, #000 70%, transparent 78%)',
					maskImage:
						'radial-gradient(circle, transparent 6%, #000 38%, #000 70%, transparent 78%)',
					animation: `warpStreak ${FLASH_MS}ms cubic-bezier(0.3, 0, 0.2, 1) forwards`,
				}}
			/>
			{/* central light burst — the punch through into space */}
			<div
				style={{
					position: 'absolute',
					width: '70vmax',
					height: '70vmax',
					borderRadius: '50%',
					background:
						'radial-gradient(circle, rgba(190,240,255,0.95) 0%, rgba(96,164,255,0.45) 26%, transparent 62%)',
					animation: `warpBurst ${FLASH_MS}ms ease-out forwards`,
				}}
			/>
		</div>
	);
}

const WARP_KEYFRAMES = `
@keyframes warpStreak {
  0%   { transform: scale(0.35) rotate(0deg); opacity: 0; }
  35%  { opacity: 0.85; }
  100% { transform: scale(3.4) rotate(26deg); opacity: 0; }
}
@keyframes warpBurst {
  0%   { transform: scale(0.25); opacity: 0; }
  40%  { opacity: 1; }
  100% { transform: scale(6); opacity: 0; }
}
`;

/** Mode picker shown on entering space: free roam, the rail mission, or back to the planet. */
function SpaceMenu({
	onFree,
	onMission,
	onExit,
}: {
	onFree: () => void;
	onMission: () => void;
	onExit: () => void;
}): ReactElement {
	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 14,
				fontFamily: 'monospace',
				color: '#eaf2ff',
				background:
					'radial-gradient(ellipse at 50% 40%, #0a1230 0%, #03040c 70%, #000 100%)',
			}}>
			<div
				style={{
					fontSize: 26,
					fontWeight: 700,
					letterSpacing: 3,
					marginBottom: 8,
				}}>
				ORBIT
			</div>
			<MenuButton onClick={onFree}>Free Flight</MenuButton>
			<MenuButton onClick={onMission} accent>
				Mission 1 · Survive the Gauntlet
			</MenuButton>
			<MenuButton onClick={onExit}>Return to Planet</MenuButton>
		</div>
	);
}

function MenuButton({
	onClick,
	accent,
	children,
}: {
	onClick: () => void;
	accent?: boolean;
	children: ReactNode;
}): ReactElement {
	return (
		<button
			onClick={onClick}
			style={{
				minWidth: 280,
				padding: '12px 20px',
				fontFamily: 'monospace',
				fontSize: 14,
				color: accent ? '#03040c' : '#cfe0ff',
				background: accent ? '#69b7ff' : 'rgba(105,183,255,0.12)',
				border: `1px solid ${accent ? '#69b7ff' : 'rgba(105,183,255,0.5)'}`,
				borderRadius: 8,
				cursor: 'pointer',
			}}>
			{children}
		</button>
	);
}
