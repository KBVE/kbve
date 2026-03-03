import { useRef, useCallback } from 'react';
import Phaser from 'phaser';
import GridEngine from 'grid-engine';
import { PhaserGame } from '@kbve/laser';
import type { PhaserGameRef } from '@kbve/laser';
import { PreloaderScene } from './scenes/PreloaderScene';
import { CloudCityScene } from './scenes/CloudCityScene';
import { GameStoreProvider, useGameStore } from './store/GameStoreContext';
import { useEventBridge } from './store/useEventBridge';
import { CharacterDialog } from './ui/CharacterDialog';
import { NotificationToast } from './ui/NotificationToast';

function GameWindowInner() {
	const gameRef = useRef<PhaserGameRef>(null);
	const { dispatch } = useGameStore();
	useEventBridge(dispatch);

	const handleReady = useCallback((game: Phaser.Game) => {
		console.log('[CryptoThrone] Game ready', game.config.gameTitle);
	}, []);

	return (
		<>
			<PhaserGame
				ref={gameRef}
				config={{
					width: 800,
					height: 600,
					scenes: [PreloaderScene, CloudCityScene],
					backgroundColor: '#1a1a2e',
					plugins: {
						scene: [
							{
								key: 'gridEngine',
								plugin: GridEngine,
								mapping: 'gridEngine',
							},
						],
					},
					scale: {
						mode: Phaser.Scale.FIT,
						autoCenter: Phaser.Scale.CENTER_BOTH,
					},
				}}
				onReady={handleReady}
			/>
			<CharacterDialog />
			<NotificationToast />
		</>
	);
}

export default function GameWindow() {
	return (
		<GameStoreProvider>
			<div className="relative flex justify-center items-center w-full">
				<GameWindowInner />
			</div>
		</GameStoreProvider>
	);
}
