import {
	useContext,
	useCallback,
	useEffect,
	useRef,
	type ReactNode,
} from 'react';
import { ToastProvider } from '../toast/toast-context';
import { ModalProvider } from '../modal/modal-context';
import { MenuProvider } from '../menu/menu-context';
import { ToastContainer } from '../toast/ToastContainer';
import { ModalOverlay } from '../modal/ModalOverlay';
import { PauseMenu } from '../menu/PauseMenu';
import {
	ModalStateContext,
	ModalDispatchContext,
} from '../modal/modal-context';
import { MenuStateContext, MenuDispatchContext } from '../menu/menu-context';
import { useKeyboard } from '../shared/use-keyboard';

/** Re-focus the Bevy canvas so winit receives keyboard events again. */
function focusCanvas() {
	document.getElementById('bevy-canvas')?.focus();
}

function KeyboardRouter() {
	const modalState = useContext(ModalStateContext);
	const modalDispatch = useContext(ModalDispatchContext);
	const menuState = useContext(MenuStateContext);
	const menuDispatch = useContext(MenuDispatchContext);

	// Track previous overlay state to detect close transitions
	const prevOverlay = useRef(false);
	const overlayActive = modalState.isOpen || menuState.isOpen;

	useEffect(() => {
		if (prevOverlay.current && !overlayActive) {
			focusCanvas();
		}
		prevOverlay.current = overlayActive;
	}, [overlayActive]);

	const handleEscape = useCallback(() => {
		if (modalState.isOpen) {
			modalDispatch({ type: 'CLOSE' });
		} else if (menuState.isOpen) {
			menuDispatch({ type: 'CLOSE' });
		} else {
			menuDispatch({ type: 'OPEN' });
		}
	}, [modalState.isOpen, menuState.isOpen, modalDispatch, menuDispatch]);

	useKeyboard('Escape', handleEscape);

	return null;
}

export function GameUIProvider({ children }: { children: ReactNode }) {
	return (
		<ToastProvider>
			<ModalProvider>
				<MenuProvider>
					<KeyboardRouter />
					{children}
					<ToastContainer />
					<ModalOverlay />
					<PauseMenu />
				</MenuProvider>
			</ModalProvider>
		</ToastProvider>
	);
}
