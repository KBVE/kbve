import { useEffect, useRef, useCallback } from 'react';
import Phaser from 'phaser';
import { RunnerScene } from './RunnerScene';
import { COLORS } from './config';

/// Knight https://aamatniekss.itch.io/fantasy-knight-free-pixelart-animated-character

const CONTAINER_ID = 'runner-game-inner';

export default function ReactRunnerApp() {
	const gameRef = useRef<Phaser.Game | null>(null);

	const getContainerDimensions = useCallback(() => {
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

		const dimensions = getContainerDimensions();

		const config: Phaser.Types.Core.GameConfig = {
			type: Phaser.AUTO,
			width: dimensions.width,
			height: dimensions.height,
			parent: container,
			backgroundColor: COLORS.background,
			scale: {
				mode: Phaser.Scale.RESIZE,
				autoCenter: Phaser.Scale.CENTER_BOTH,
			},
			input: {
				keyboard: {
					target: window,
					capture: [
						Phaser.Input.Keyboard.KeyCodes.SPACE,
						Phaser.Input.Keyboard.KeyCodes.UP,
						Phaser.Input.Keyboard.KeyCodes.DOWN,
						Phaser.Input.Keyboard.KeyCodes.LEFT,
						Phaser.Input.Keyboard.KeyCodes.RIGHT,
						Phaser.Input.Keyboard.KeyCodes.W,
						Phaser.Input.Keyboard.KeyCodes.A,
						Phaser.Input.Keyboard.KeyCodes.S,
						Phaser.Input.Keyboard.KeyCodes.D,
						Phaser.Input.Keyboard.KeyCodes.CTRL,
					],
				},
			},
			scene: RunnerScene,
		};

		gameRef.current = new Phaser.Game(config);

		// Handle resize
		const handleResize = () => {
			if (gameRef.current) {
				const newDimensions = getContainerDimensions();
				gameRef.current.scale.resize(
					newDimensions.width,
					newDimensions.height,
				);
			}
		};

		window.addEventListener('resize', handleResize);

		// Also use ResizeObserver for container size changes
		const resizeObserver = new ResizeObserver(handleResize);
		resizeObserver.observe(container);

		return () => {
			window.removeEventListener('resize', handleResize);
			resizeObserver.disconnect();

			if (gameRef.current) {
				gameRef.current.destroy(true);
				gameRef.current = null;
			}
		};
	}, [getContainerDimensions]);

	// This component doesn't render anything - Phaser creates the canvas
	return null;
}
