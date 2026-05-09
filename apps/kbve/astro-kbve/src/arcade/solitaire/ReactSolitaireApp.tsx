import { useMemo } from 'react';
import Phaser from 'phaser';
import { PhaserGame, type LaserGameConfig } from '@kbve/laser';
import { SolitaireScene } from './SolitaireScene';
import { BASE_HEIGHT, BASE_WIDTH, COLORS } from './config';

/**
 * Klondike solitaire mounted via @kbve/laser's typed `<PhaserGame>` wrapper.
 *
 * The wrapper now survives React StrictMode double-mount via a deferred
 * destroy + canvas re-attach, so we can rely on it instead of bespoke
 * `new Phaser.Game()` boilerplate per game. Config is memoized once with
 * an empty dep array so the wrapper's effect dep doesn't trigger spurious
 * re-creates.
 */
export default function ReactSolitaireApp() {
	const config = useMemo<LaserGameConfig>(
		() => ({
			width: BASE_WIDTH,
			height: BASE_HEIGHT,
			scenes: [SolitaireScene],
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
						Phaser.Input.Keyboard.KeyCodes.N,
						Phaser.Input.Keyboard.KeyCodes.Z,
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
