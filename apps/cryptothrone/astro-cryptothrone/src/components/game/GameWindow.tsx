import { useRef, useCallback, useMemo, memo } from 'react';
import Phaser from 'phaser';
import GridEngine from 'grid-engine';
import { PhaserGame } from '@kbve/laser';
import type { PhaserGameRef } from '@kbve/laser';
import { PreloaderScene } from './scenes/PreloaderScene';
import { CloudCityScene } from './scenes/CloudCityScene';
import { GameStoreProvider, useGameDispatch } from './store/GameStoreContext';
import { useEventBridge } from './store/useEventBridge';
import { CharacterDialog } from './ui/CharacterDialog';
import { NotificationToast } from './ui/NotificationToast';
import { StickySidebar } from './ui/StickySidebar';
import { ActionMenu } from './ui/ActionMenu';
import { DialogueModal } from './ui/DialogueModal';
import { DiceRollModal } from './ui/DiceRollModal';

/**
 * Isolated Phaser canvas — never re-renders when game store changes.
 * Config and onReady are memoized so the PhaserGame useEffect dependency
 * array stays referentially stable across React re-renders.
 */
const PhaserCanvas = memo(function PhaserCanvas() {
	const gameRef = useRef<PhaserGameRef>(null);

	const config = useMemo(
		() => ({
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
		}),
		[],
	);

	const handleReady = useCallback((game: Phaser.Game) => {
		console.log('[CryptoThrone] Game ready', game.config.gameTitle);
	}, []);

	return <PhaserGame ref={gameRef} config={config} onReady={handleReady} />;
});

/**
 * Event bridge + UI overlays.
 * Uses dispatch-only hook so this wrapper never re-renders on state changes.
 * Each child subscribes to its own state slice independently.
 */
function GameUI() {
	const dispatch = useGameDispatch();
	useEventBridge(dispatch);

	return (
		<>
			<StickySidebar />
			<ActionMenu />
			<DialogueModal />
			<DiceRollModal />
			<CharacterDialog />
			<NotificationToast />
		</>
	);
}

export default function GameWindow() {
	return (
		<GameStoreProvider>
			<div className="relative flex justify-center items-center w-full">
				<PhaserCanvas />
				<GameUI />
			</div>
		</GameStoreProvider>
	);
}
