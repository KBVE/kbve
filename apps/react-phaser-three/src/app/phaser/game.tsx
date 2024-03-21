import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import Phaser from 'phaser';
import { enable3d, Canvas } from '@enable3d/phaser-extension';
import { Main, KeybindsScene } from './scenes';

const StyledApp = styled.div`
	// Your style here
`;
export function Game() {
	const gameContainerRef = useRef<HTMLDivElement | null>(null);
	const [gameInitialized, setGameInitialized] = useState(false);
	const gameInstanceRef = useRef<Phaser.Game | null>(null);

	useEffect(() => {
		const currentGameContainer = gameContainerRef.current;
		if (gameInitialized && currentGameContainer) {
			const config = {
				title: 'Phaser Enable3D - Demo',
				type: Phaser.WEBGL,
				transparent: true,

				scale: {
					mode: Phaser.Scale.FIT,
					autoCenter: Phaser.Scale.CENTER_BOTH,
					width:
						window.innerWidth *
						Math.max(1, window.devicePixelRatio / 2),
					height:
						window.innerHeight *
						Math.max(1, window.devicePixelRatio / 2),
				},
				scene: [Main, KeybindsScene],

				...Canvas(),
			};

			enable3d(() => {
				const phaserGame = new Phaser.Game(config);
				gameInstanceRef.current = phaserGame;
				currentGameContainer.appendChild(phaserGame.canvas);
				phaserGame.canvas.style.width = '100%';
				phaserGame.canvas.style.height = '100%';
				return phaserGame;
			}).withPhysics('/ammo/kripken');

			return () => {
				// Cleanup
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
		setGameInitialized(true);

		return () => {
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
