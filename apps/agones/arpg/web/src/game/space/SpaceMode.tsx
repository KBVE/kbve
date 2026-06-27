import { useEffect, useRef, useState, type ReactElement } from 'react';
import type Phaser from 'phaser';
import { onSpaceEnter, emitSpaceExit } from '../systems/hud';
import { SpaceScene } from './SpaceScene';

const SCENE_KEY = 'IsoArpgScene';
const FLASH_MS = 450;

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
	const [heading, setHeading] = useState(0);
	const [flash, setFlash] = useState(false);
	const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);

	const pulseFlash = () => {
		setFlash(true);
		if (flashTimer.current) clearTimeout(flashTimer.current);
		flashTimer.current = setTimeout(() => setFlash(false), FLASH_MS);
	};

	useEffect(() => {
		const off = onSpaceEnter((data) => {
			setHeading(data.heading);
			pulseFlash();
			// Halt the iso scene's update/render while we're in space; the WebSocket
			// keeps running on its own callbacks so the connection stays warm.
			getGame()?.scene.pause(SCENE_KEY);
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
			{active && <SpaceScene heading={heading} onExit={exit} />}
			<div
				style={{
					position: 'absolute',
					inset: 0,
					background: '#eaf2ff',
					opacity: flash ? 1 : 0,
					transition: `opacity ${FLASH_MS}ms ease`,
					pointerEvents: 'none',
				}}
			/>
		</div>
	);
}
