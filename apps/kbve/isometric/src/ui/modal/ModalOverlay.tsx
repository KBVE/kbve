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
			className="fixed inset-0 bg-overlay flex items-center justify-center pointer-events-auto"
			onClick={() => {
				if (topModal.closeOnOverlayClick !== false) {
					dispatch({ type: 'CLOSE' });
				}
			}}>
			<div
				className={`
					${sizeClass} w-full mx-4
					bg-panel border-2 border-panel-border shadow-panel
					animate-modal-in
				`}
				onClick={(e) => e.stopPropagation()}>
				{/* Title bar */}
				<div className="flex items-center justify-between px-3 py-2 border-b-2 border-panel-border bg-panel-inner">
					<h2 className="text-[10px]">{topModal.title}</h2>
					<button
						onClick={() => dispatch({ type: 'CLOSE' })}
						className="text-text-muted hover:text-text text-[10px] leading-none cursor-pointer">
						&#x2715;
					</button>
				</div>
				{/* Content */}
				<div className="p-3 bg-panel-inner text-[8px]">
					{topModal.content}
				</div>
			</div>
		</div>,
		getPortalRoot('modal-root'),
	);
}
