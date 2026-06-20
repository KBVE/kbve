import { useEffect, useRef, useCallback } from 'react';
import Phaser from 'phaser';
import { IsoArpgScene } from './IsoArpgScene';
import { COLORS } from './config';
import { buildNetConfig } from './net-config';

const CONTAINER_ID = 'iso-arpg-inner';

export default function ReactIsoArpgApp() {
	const gameRef = useRef<Phaser.Game | null>(null);

	const getDimensions = useCallback(() => {
		const container = document.getElementById(CONTAINER_ID);
		if (!container) return { width: 960, height: 540 };
		const rect = container.getBoundingClientRect();
		return {
			width: Math.floor(rect.width),
			height: Math.floor(rect.height),
		};
	}, []);

	useEffect(() => {
		const container = document.getElementById(CONTAINER_ID);
		if (!container || gameRef.current) return;

		let disposed = false;

		buildNetConfig().finally(() => {
			if (disposed || gameRef.current) return;
			const dims = getDimensions();
			const config: Phaser.Types.Core.GameConfig = {
				type: Phaser.AUTO,
				width: dims.width,
				height: dims.height,
				parent: container,
				backgroundColor: COLORS.background,
				pixelArt: true,
				scale: {
					mode: Phaser.Scale.RESIZE,
					autoCenter: Phaser.Scale.CENTER_BOTH,
				},
				input: {
					keyboard: {
						target: window,
						capture: [
							Phaser.Input.Keyboard.KeyCodes.UP,
							Phaser.Input.Keyboard.KeyCodes.DOWN,
							Phaser.Input.Keyboard.KeyCodes.LEFT,
							Phaser.Input.Keyboard.KeyCodes.RIGHT,
							Phaser.Input.Keyboard.KeyCodes.W,
							Phaser.Input.Keyboard.KeyCodes.A,
							Phaser.Input.Keyboard.KeyCodes.S,
							Phaser.Input.Keyboard.KeyCodes.D,
						],
					},
				},
				scene: IsoArpgScene,
			};
			gameRef.current = new Phaser.Game(config);
		});

		const handleResize = () => {
			if (gameRef.current) {
				const d = getDimensions();
				gameRef.current.scale.resize(d.width, d.height);
			}
		};
		window.addEventListener('resize', handleResize);
		const ro = new ResizeObserver(handleResize);
		ro.observe(container);

		return () => {
			disposed = true;
			window.removeEventListener('resize', handleResize);
			ro.disconnect();
			if (gameRef.current) {
				gameRef.current.destroy(true);
				gameRef.current = null;
			}
		};
	}, [getDimensions]);

	return null;
}
