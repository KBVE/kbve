import { createContext, useContext } from 'react';
import type { GameStatus } from '../core/types';
import type Phaser from 'phaser';

export interface PhaserGameRef {
	game: Phaser.Game | null;
	status: GameStatus;
}

export const PhaserContext = createContext<PhaserGameRef | null>(null);

export function usePhaserGame(): PhaserGameRef {
	const ctx = useContext(PhaserContext);
	if (!ctx) {
		throw new Error(
			'usePhaserGame must be used within a <PhaserGame> component',
		);
	}
	return ctx;
}
