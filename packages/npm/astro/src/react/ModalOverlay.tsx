import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useModal } from '../hooks/useModal';
import { cn } from '../utils/cn';

export interface ModalOverlayProps {
	id: string;
	title?: string;
	children?: React.ReactNode;
	vnode?: any;
	className?: string;
	closeOnBackdrop?: boolean;
}

export function ModalOverlay({
	id,
	title,
	children,
	vnode,
	className,
	closeOnBackdrop = true,
}: ModalOverlayProps) {
	const { isOpen, close } = useModal();
	const vnodeRef = useRef<HTMLDivElement>(null);
	const open = isOpen(id);

	// Render VNode if provided and no children
	useEffect(() => {
		if (!open || !vnode || children || !vnodeRef.current) return;
		let cancelled = false;
		import('@kbve/droid').then((mod) => {
			if (cancelled || !vnodeRef.current) return;
			const renderVNode = (mod as any).renderVNode;
			if (typeof renderVNode === 'function') {
				vnodeRef.current.innerHTML = '';
				vnodeRef.current.appendChild(renderVNode(vnode));
			}
		});
		return () => {
			cancelled = true;
			if (vnodeRef.current) vnodeRef.current.innerHTML = '';
		};
	}, [open, vnode, children]);

	// Escape key handler
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') close(id);
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, [open, id, close]);

	// Lock body scroll
	useEffect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	}, [open]);

	if (!open) return null;

	return createPortal(
		<div
			className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
			role="dialog"
			aria-modal="true"
			aria-label={title ?? 'Modal'}
			onClick={(e) => {
				if (closeOnBackdrop && e.target === e.currentTarget) close(id);
			}}>
			<div
				className={cn(
					'w-full max-w-lg rounded-xl shadow-2xl p-6 bg-zinc-900 text-zinc-100',
					className,
				)}>
				{title && (
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-lg font-semibold">{title}</h2>
						<button
							type="button"
							onClick={() => close(id)}
							className="text-zinc-400 hover:text-white transition-colors"
							aria-label="Close">
							&times;
						</button>
					</div>
				)}
				{children ?? <div ref={vnodeRef} />}
			</div>
		</div>,
		document.body,
	);
}
