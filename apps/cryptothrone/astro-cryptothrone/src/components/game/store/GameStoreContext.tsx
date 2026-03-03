import {
	createContext,
	useContext,
	useReducer,
	type Dispatch,
	type ReactNode,
} from 'react';
import {
	gameReducer,
	initialGameState,
	type GameState,
	type GameAction,
} from './game-store';

interface GameStoreContextValue {
	state: GameState;
	dispatch: Dispatch<GameAction>;
}

const GameStoreContext = createContext<GameStoreContextValue | null>(null);

export function GameStoreProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(gameReducer, initialGameState);
	return (
		<GameStoreContext.Provider value={{ state, dispatch }}>
			{children}
		</GameStoreContext.Provider>
	);
}

export function useGameStore(): GameStoreContextValue {
	const ctx = useContext(GameStoreContext);
	if (!ctx)
		throw new Error('useGameStore must be used within GameStoreProvider');
	return ctx;
}
