import { useRef, useCallback, useMemo, memo, useEffect } from 'react';
import Phaser from 'phaser';
import GridEngine from 'grid-engine';
import { PhaserGame, laserEvents } from '@kbve/laser';
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
import { ChatBar } from './ui/ChatBar';
import { ConnectionOverlay } from './ui/ConnectionOverlay';
import { ZoneBanner } from './ui/ZoneBanner';
import { CoordsBar } from './ui/CoordsBar';
import { GoldCounter } from './ui/GoldCounter';
import { Minimap } from './ui/Minimap';
import { CombatLog } from './ui/CombatLog';
import { TargetFrame } from './ui/TargetFrame';
import { Hotbar } from './ui/Hotbar';
import { KeybindHelp } from './ui/KeybindHelp';
import { QuestTracker } from './ui/QuestTracker';
import { DayNight } from './ui/DayNight';
import { SoundManager } from './ui/SoundManager';
import { Achievements } from './ui/Achievements';
import { DeathScreen } from './ui/DeathScreen';
import { Compass } from './ui/Compass';
import { SocialBar } from './ui/SocialBar';
import { EmoteBar } from './ui/EmoteBar';

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
			pixelArt: true,
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
		if (import.meta.env.DEV) {
			console.log('[CryptoThrone] Game ready', game.config.gameTitle);
		}
	}, []);

	return <PhaserGame ref={gameRef} config={config} onReady={handleReady} />;
});

/**
 * Event bridge + UI overlays.
 * Uses dispatch-only hook so this wrapper never re-renders on state changes.
 * Each child subscribes to its own state slice independently.
 */
function GameUI({ username }: { username?: string }) {
	const dispatch = useGameDispatch();
	useEventBridge(dispatch);

	useEffect(() => {
		if (username) {
			dispatch({ type: 'SET_PLAYER_STATS', payload: { username } });
		}
	}, [dispatch, username]);

	useEffect(() => {
		if (import.meta.env.DEV) {
			const w = window as Window & {
				__ctEvents?: typeof laserEvents;
				__ctDispatch?: typeof dispatch;
			};
			w.__ctEvents = laserEvents;
			w.__ctDispatch = dispatch;
		}
	}, [dispatch]);

	return (
		<>
			<StickySidebar />
			<ActionMenu />
			<DialogueModal />
			<DiceRollModal />
			<CharacterDialog />
			<NotificationToast />
			<ChatBar />
			<ZoneBanner />
			<CoordsBar />
			<GoldCounter />
			<Minimap />
			<CombatLog />
			<TargetFrame />
			<Hotbar />
			<KeybindHelp />
			<QuestTracker />
			<DayNight />
			<SoundManager />
			<Achievements />
			<DeathScreen />
			<Compass />
			<SocialBar />
			<EmoteBar />
			<ConnectionOverlay />
		</>
	);
}

export default function GameWindow({ username }: { username?: string }) {
	return (
		<GameStoreProvider>
			<div className="relative flex justify-center items-center w-full h-full">
				<PhaserCanvas />
				<GameUI username={username} />
			</div>
		</GameStoreProvider>
	);
}
