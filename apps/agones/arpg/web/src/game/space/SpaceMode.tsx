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
const FLASH_MS = 650;

type SpaceView = 'menu' | 'free' | 'rail';

export function SpaceMode({
	getGame,
}: {
	getGame: () => Phaser.Game | null;
}): ReactElement | null {
	const [active, setActive] = useState(false);
	const [view, setView] = useState<SpaceView>('menu');
	const [heading, setHeading] = useState(0);
	const [flash, setFlash] = useState(false);
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
			pulseFlash(true);
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
