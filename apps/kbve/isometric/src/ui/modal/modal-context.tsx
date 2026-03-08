import {
	createContext,
	useReducer,
	useEffect,
	type ReactNode,
	type Dispatch,
} from 'react';
import { gameEvents } from '../events/event-bus';
import type { ModalConfig, ModalState } from './modal-types';

// --- Actions ---
export type ModalAction =
	| { type: 'OPEN'; modal: ModalConfig }
	| { type: 'CLOSE' }
	| { type: 'CLOSE_ALL' };

const initialState: ModalState = { stack: [], isOpen: false };

function modalReducer(state: ModalState, action: ModalAction): ModalState {
	switch (action.type) {
		case 'OPEN':
			return {
				stack: [...state.stack, action.modal],
				isOpen: true,
			};
		case 'CLOSE': {
			const popped = state.stack[state.stack.length - 1];
			const newStack = state.stack.slice(0, -1);
			popped?.onClose?.();
			return {
				stack: newStack,
				isOpen: newStack.length > 0,
			};
		}
		case 'CLOSE_ALL': {
			state.stack.forEach((m) => m.onClose?.());
			return initialState;
		}
	}
}

// --- Contexts (split) ---
export const ModalStateContext = createContext<ModalState>(initialState);
export const ModalDispatchContext = createContext<Dispatch<ModalAction>>(
	() => {},
);

// --- Provider ---
export function ModalProvider({ children }: { children: ReactNode }) {
	const [state, dispatch] = useReducer(modalReducer, initialState);

	// Bridge: event bus → modal state
	useEffect(() => {
		const unsubOpen = gameEvents.on(
			'modal:open',
			({ id, title, content, onClose }) => {
				dispatch({
					type: 'OPEN',
					modal: {
						id: id ?? crypto.randomUUID(),
						title,
						content,
						onClose,
						closeOnOverlayClick: true,
						closeOnEscape: true,
						size: 'md',
					},
				});
			},
		);
		const unsubClose = gameEvents.on('modal:close', () => {
			dispatch({ type: 'CLOSE' });
		});
		return () => {
			unsubOpen();
			unsubClose();
		};
	}, []);

	return (
		<ModalStateContext value={state}>
			<ModalDispatchContext value={dispatch}>
				{children}
			</ModalDispatchContext>
		</ModalStateContext>
	);
}
