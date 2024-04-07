/**
 * Defines the Game component using Phaser 3 and @enable3d/phaser-extension.
 * 
 * This component initializes a Phaser game instance within a React application, utilizing
 * the @enable3d/phaser-extension for enhanced 3D capabilities on top of Phaser's core functionalities.
 * It dynamically adjusts the game's scale based on the window's dimensions and device pixel ratio to
 * ensure optimal display across different devices. The game instance is destroyed and cleaned up on component
 * unmount to prevent memory leaks.
 * 
 * @fileoverview Creation and management of a Phaser Game instance within a React component, 
 * incorporating @enable3d/phaser-extension for 3D game development capabilities.
 * 
 * @requires react: React library for defining JSX components and managing component lifecycle.
 * @requires styled-components: For styling the game container div within React.
 * @requires phaser: The Phaser 3 game framework, used for creating 2D and 3D games in the web browser.
 * @requires @enable3d/phaser-extension: A Phaser 3 extension for enabling and simplifying 3D game development.
 * @requires ./scenes: Custom Phaser scenes for the game logic and presentation.
 * 
 * @returns {JSX.Element} The Game component, rendering a Phaser game within a styled container.
 * 
 * @example
 * // Typically used in a higher-level component like App to include the Phaser game in your application.
 * <Game />
 */

import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import Phaser from 'phaser';
import { enable3d, Canvas } from '@enable3d/phaser-extension';
import { Main, KeybindsScene } from './scenes';

// Styled component for the game container.
const StyledApp = styled.div`
	// Define your styles for the game container here.
	// Example:
	// width: 100%;
	// height: 100%;
	// overflow: hidden;
`;

/**
 * The Game function component initializes and renders a Phaser game within a React application.
 * Utilizes useRef to reference the game container div and useState to manage the game's initialization state.
 * The game is configured for both 2D and 3D rendering capabilities, scaling dynamically to the window's size.
 * 
 * @returns {JSX.Element} Renders a div as the container for the Phaser game canvas.
 */
export function Game() {
	const gameContainerRef = useRef<HTMLDivElement | null>(null);
	const [gameInitialized, setGameInitialized] = useState(false);
	const gameInstanceRef = useRef<Phaser.Game | null>(null);

	useEffect(() => {
		// Initialization effect, responsible for setting up the Phaser game.
		const currentGameContainer = gameContainerRef.current;
		if (gameInitialized && currentGameContainer) {
			// Configuration for the Phaser game, including scale and scenes.
			const config = {
				title: 'The DreamBound',
				type: Phaser.WEBGL,
				transparent: true,
				scale: {
					mode: Phaser.Scale.FIT,
					autoCenter: Phaser.Scale.CENTER_BOTH,
					width: window.innerWidth * Math.max(1, window.devicePixelRatio / 2),
					height: window.innerHeight * Math.max(1, window.devicePixelRatio / 2),
				},
				scene: [Main, KeybindsScene],
				...Canvas(),
			};

			enable3d(() => {
				// Instantiating the Phaser game with the defined configuration.
				const phaserGame = new Phaser.Game(config);
				gameInstanceRef.current = phaserGame;
				currentGameContainer.appendChild(phaserGame.canvas);
				phaserGame.canvas.style.width = '100%';
				phaserGame.canvas.style.height = '100%';
				return phaserGame;
			}).withPhysics('/ammo/kripken');

			return () => {
				// Cleanup logic for destroying the Phaser game instance.
				if (gameInstanceRef.current) {
					gameInstanceRef.current.destroy(true);
					gameInstanceRef.current = null;
				}
				if (currentGameContainer) {
					currentGameContainer.innerHTML = '';
				}
			};
		}
	}, [gameInitialized]);

	useEffect(() => {
		// Effect for initializing the game on component mount.
		setGameInitialized(true);

		return () => {
			// Cleanup effect to reset initialization state on component unmount.
			setGameInitialized(false);
		};
	}, []);

	return (
		<StyledApp>
			<div ref={gameContainerRef} />
		</StyledApp>
	);
}

export default Game;