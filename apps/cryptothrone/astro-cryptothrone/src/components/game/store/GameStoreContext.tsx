import {
	createContext,
	useContext,
	useReducer,
	useCallback,
	useMemo,
	type Dispatch,
	type ReactNode,
} from 'react';
import {
	gameReducer,
	initialGameState,
	type GameState,
	type GameAction,
} from './game-store';

/**
 * Two separate contexts so components that only need dispatch (event bridge,
 * action handlers) never re-render when state changes.
 */
const StateContext = createContext<GameState | null>(null);
const DispatchContext = createContext<Dispatch<GameAction> | null>(null);

export function GameStoreProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(gameReducer, initialGameState);
	return (
		<DispatchContext.Provider value={dispatch}>
			<StateContext.Provider value={state}>
				{children}
			</StateContext.Provider>
		</DispatchContext.Provider>
	);
}

/** Full store access — use only when you need both state and dispatch. */
export function useGameStore() {
	const state = useContext(StateContext);
	const dispatch = useContext(DispatchContext);
	if (!state || !dispatch)
		throw new Error('useGameStore must be used within GameStoreProvider');
	return { state, dispatch };
}

/** Dispatch-only hook — never triggers re-renders. */
export function useGameDispatch(): Dispatch<GameAction> {
	const dispatch = useContext(DispatchContext);
	if (!dispatch)
		throw new Error(
			'useGameDispatch must be used within GameStoreProvider',
		);
	return dispatch;
}

/** Select a slice of state — combine with memo to skip irrelevant updates. */
export function useGameSelector<T>(selector: (state: GameState) => T): T {
	const state = useContext(StateContext);
	if (!state)
		throw new Error(
			'useGameSelector must be used within GameStoreProvider',
		);
	return selector(state);
}
