import {
	createContext,
	useReducer,
	useEffect,
	type ReactNode,
	type Dispatch,
} from 'react';
import { gameEvents } from '../events/event-bus';
import type { MenuState, SettingsCategory } from './menu-types';

// --- Actions ---
export type MenuAction =
	| { type: 'TOGGLE' }
	| { type: 'OPEN' }
	| { type: 'CLOSE' }
	| { type: 'SET_CATEGORY'; category: SettingsCategory };

const initialState: MenuState = { isOpen: false, activeCategory: 'general' };

function menuReducer(state: MenuState, action: MenuAction): MenuState {
	switch (action.type) {
		case 'TOGGLE':
			return { ...state, isOpen: !state.isOpen };
		case 'OPEN':
			return { ...state, isOpen: true };
		case 'CLOSE':
			return { ...state, isOpen: false, activeCategory: 'general' };
		case 'SET_CATEGORY':
			return { ...state, activeCategory: action.category };
	}
}

// --- Contexts (split) ---
export const MenuStateContext = createContext<MenuState>(initialState);
export const MenuDispatchContext = createContext<Dispatch<MenuAction>>(() => {
	/* noop default */
});

// --- Provider ---
export function MenuProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(menuReducer, initialState);

	// Bridge: event bus → menu state
	useEffect(() => {
		const unsubToggle = gameEvents.on('menu:toggle', () => {
			dispatch({ type: 'TOGGLE' });
		});
		const unsubOpen = gameEvents.on('menu:open', () => {
			dispatch({ type: 'OPEN' });
		});
		const unsubClose = gameEvents.on('menu:close', () => {
			dispatch({ type: 'CLOSE' });
		});
		return () => {
			unsubToggle();
			unsubOpen();
			unsubClose();
		};
	}, []);

	return (
		<MenuStateContext value={state}>
			<MenuDispatchContext value={dispatch}>
				{children}
			</MenuDispatchContext>
		</MenuStateContext>
	);
}
