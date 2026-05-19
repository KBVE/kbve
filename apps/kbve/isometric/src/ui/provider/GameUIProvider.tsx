import {
	useContext,
	useCallback,
	useEffect,
	useRef,
	type ReactNode,
} from 'react';
import { ToastProvider } from '../toast/toast-context';
import { ModalProvider } from '../modal/modal-context';
import { ToastContainer } from '../toast/ToastContainer';
import { ModalOverlay } from '../modal/ModalOverlay';
import {
	ModalStateContext,
	ModalDispatchContext,
} from '../modal/modal-context';
import { useKeyboard } from '../shared/use-keyboard';

/** Re-focus the Bevy canvas so winit receives keyboard events again. */
function focusCanvas() {
	document.getElementById('bevy-canvas')?.focus();
}

function KeyboardRouter() {
	const modalState = useContext(ModalStateContext);
	const modalDispatch = useContext(ModalDispatchContext);

	// Track previous overlay state to detect close transitions. The pause
	// menu now lives in Bevy (PauseMenuPlugin owns Escape); only modals stay
	// React-side.
	const prevOverlay = useRef(false);
	const overlayActive = modalState.isOpen;

	useEffect(() => {
		if (prevOverlay.current && !overlayActive) {
			focusCanvas();
		}
		prevOverlay.current = overlayActive;
	}, [overlayActive]);

	const handleEscape = useCallback(() => {
		if (modalState.isOpen) {
			modalDispatch({ type: 'CLOSE' });
		}
	}, [modalState.isOpen, modalDispatch]);

	useKeyboard('Escape', handleEscape);

	return null;
}

export function GameUIProvider({ children }: { children: ReactNode }) {
	return (
		<ToastProvider>
			<ModalProvider>
				<KeyboardRouter />
				{children}
				<ToastContainer />
				<ModalOverlay />
			</ModalProvider>
		</ToastProvider>
	);
}
