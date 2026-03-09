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
			{/* Outer frame — golden border with dark shadow inset */}
			<div
				className={`
					${sizeClass} mx-4
					border-[3px] border-panel-border
					shadow-[0_0_0_1px_#1a1008,0_6px_20px_rgba(0,0,0,0.8)]
					animate-modal-in
				`}
				onClick={(e) => e.stopPropagation()}>
				{/* Inner frame — dark inset border for depth */}
				<div className="border-2 border-[#1a1008]">
					{/* Title bar — darker strip with centered title */}
					<div className="flex items-center justify-between px-3 py-2 bg-[#1e1408] border-b border-[#5a4a2a]">
						<h2 className="text-[10px] text-[#c8a832]">
							{topModal.title}
						</h2>
						<button
							onClick={() => dispatch({ type: 'CLOSE' })}
							className="w-5 h-5 flex items-center justify-center
								bg-[#3d2b14] border border-[#5a4a2a]
								text-text-muted hover:text-[#c8a832] hover:border-panel-border
								text-[8px] leading-none cursor-pointer transition-colors">
							&#x2715;
						</button>
					</div>
					{/* Content area — wood panel background */}
					<div className="p-3 bg-panel-inner text-[8px]">
						{topModal.content}
					</div>
				</div>
			</div>
		</div>,
		getPortalRoot('modal-root'),
	);
}
