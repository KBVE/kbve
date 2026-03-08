import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { getPortalRoot } from '../shared/portal';
import { ModalStateContext, ModalDispatchContext } from './modal-context';
import { MODAL_SIZE_CLASSES } from './modal-types';

export function ModalOverlay() {
	const { stack, isOpen } = useContext(ModalStateContext);
	const dispatch = useContext(ModalDispatchContext);

	if (!isOpen || stack.length === 0) return null;

	const topModal = stack[stack.length - 1];
	const sizeClass = MODAL_SIZE_CLASSES[topModal.size ?? 'md'];

	return createPortal(
		<div
			className="fixed inset-0 bg-overlay backdrop-blur-[8px] flex items-center justify-center pointer-events-auto"
			onClick={() => {
				if (topModal.closeOnOverlayClick !== false) {
					dispatch({ type: 'CLOSE' });
				}
			}}>
			<div
				className={`
					${sizeClass} w-full mx-4
					bg-glass backdrop-blur-[4px] rounded-panel border border-glass-border shadow-glass
					animate-modal-in
				`}
				onClick={(e) => e.stopPropagation()}>
				{/* Title bar */}
				<div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
					<h2 className="text-sm font-semibold">{topModal.title}</h2>
					<button
						onClick={() => dispatch({ type: 'CLOSE' })}
						className="text-white/50 hover:text-white text-lg leading-none cursor-pointer">
						&times;
					</button>
				</div>
				{/* Content */}
				<div className="p-4">{topModal.content}</div>
			</div>
		</div>,
		getPortalRoot('modal-root'),
	);
}
