import { useMemo } from 'react';
import Phaser from 'phaser';
import { PhaserGame, type LaserGameConfig } from '@kbve/laser';
import { BlackjackScene } from './BlackjackScene';
import { BASE_HEIGHT, BASE_WIDTH, COLORS } from './config';

export default function ReactBlackjackApp() {
	const config = useMemo<LaserGameConfig>(
		() => ({
			width: BASE_WIDTH,
			height: BASE_HEIGHT,
			scenes: [BlackjackScene],
			backgroundColor: `#${COLORS.background.toString(16).padStart(6, '0')}`,
			scale: {
				mode: Phaser.Scale.FIT,
				autoCenter: Phaser.Scale.CENTER_BOTH,
				width: BASE_WIDTH,
				height: BASE_HEIGHT,
			},
			input: {
				keyboard: {
					target: window,
					capture: [
						Phaser.Input.Keyboard.KeyCodes.H,
						Phaser.Input.Keyboard.KeyCodes.S,
						Phaser.Input.Keyboard.KeyCodes.D,
						Phaser.Input.Keyboard.KeyCodes.N,
						Phaser.Input.Keyboard.KeyCodes.ENTER,
						Phaser.Input.Keyboard.KeyCodes.UP,
						Phaser.Input.Keyboard.KeyCodes.DOWN,
					],
				},
			},
			render: {
				antialias: true,
				pixelArt: false,
			},
			fps: {
				target: 30,
				min: 15,
			},
		}),
		[],
	);

	return (
		<PhaserGame config={config} style={{ width: '100%', height: '100%' }} />
	);
}
