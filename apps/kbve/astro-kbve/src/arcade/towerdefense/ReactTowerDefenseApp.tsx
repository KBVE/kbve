import { useMemo } from 'react';
import Phaser from 'phaser';
import { PhaserGame, type LaserGameConfig } from '@kbve/laser';
import { TowerDefenseScene } from './TowerDefenseScene';
import { BASE_HEIGHT, BASE_WIDTH, COLORS } from './config';

export default function ReactTowerDefenseApp() {
	const config = useMemo<LaserGameConfig>(
		() => ({
			width: BASE_WIDTH,
			height: BASE_HEIGHT,
			scenes: [TowerDefenseScene],
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
						Phaser.Input.Keyboard.KeyCodes.R,
						Phaser.Input.Keyboard.KeyCodes.N,
						Phaser.Input.Keyboard.KeyCodes.ONE,
						Phaser.Input.Keyboard.KeyCodes.TWO,
						Phaser.Input.Keyboard.KeyCodes.THREE,
						Phaser.Input.Keyboard.KeyCodes.FOUR,
						Phaser.Input.Keyboard.KeyCodes.FIVE,
						Phaser.Input.Keyboard.KeyCodes.SIX,
						Phaser.Input.Keyboard.KeyCodes.SEVEN,
						Phaser.Input.Keyboard.KeyCodes.EIGHT,
						Phaser.Input.Keyboard.KeyCodes.NINE,
						Phaser.Input.Keyboard.KeyCodes.ZERO,
					],
				},
			},
			render: {
				antialias: true,
				pixelArt: false,
			},
		}),
		[],
	);

	return (
		<PhaserGame config={config} style={{ width: '100%', height: '100%' }} />
	);
}
