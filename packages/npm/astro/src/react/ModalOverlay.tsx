import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useModal } from '../hooks/useModal';

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
	const [hoverClose, setHoverClose] = useState(false);
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

	const backdropStyle: CSSProperties = {
		position: 'fixed',
		inset: 0,
		zIndex: 9998,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		padding: 16,
		transition: 'all 200ms ease',
		...(open
			? {
					opacity: 1,
					visibility: 'visible' as const,
					pointerEvents: 'auto' as const,
					backgroundColor:
						'var(--sl-color-backdrop-overlay, rgba(0,0,0,0.5))',
					backdropFilter: 'blur(4px)',
				}
			: {
					opacity: 0,
					visibility: 'hidden' as const,
					pointerEvents: 'none' as const,
				}),
	};

	const panelStyle: CSSProperties = {
		width: '100%',
		maxWidth: 512,
		borderRadius: 12,
		boxShadow: 'var(--sl-shadow-lg, 0 25px 50px -12px rgba(0,0,0,0.5))',
		padding: 24,
		backgroundColor: 'var(--sl-color-bg-nav, #18181b)',
		color: 'var(--sl-color-text, #f4f4f5)',
		border: '1px solid var(--sl-color-hairline-light, #27272a)',
		transition: 'transform 200ms ease',
		transform: open ? 'scale(1)' : 'scale(0.95)',
	};

	const closeButtonStyle: CSSProperties = {
		background: 'none',
		border: 'none',
		color: hoverClose
			? 'var(--sl-color-white, #ffffff)'
			: 'var(--sl-color-gray-3, #a1a1aa)',
		transition: 'color 150ms ease',
		cursor: 'pointer',
		fontSize: 20,
		lineHeight: 1,
		padding: 0,
	};

	return createPortal(
		<div
			style={backdropStyle}
			className={className}
			role="dialog"
			aria-modal={open}
			aria-hidden={!open}
			aria-label={title ?? 'Modal'}
			onClick={(e) => {
				if (open && closeOnBackdrop && e.target === e.currentTarget)
					close(id);
			}}>
			<div style={panelStyle}>
				{title && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							marginBottom: 16,
						}}>
						<h2
							style={{
								fontSize: 'var(--sl-text-lg, 1.125rem)',
								fontWeight: 600,
								margin: 0,
							}}>
							{title}
						</h2>
						<button
							type="button"
							onClick={() => close(id)}
							onMouseEnter={() => setHoverClose(true)}
							onMouseLeave={() => setHoverClose(false)}
							style={closeButtonStyle}
							aria-label="Close">
							&#x2715;
						</button>
					</div>
				)}
				{children ?? <div ref={vnodeRef} />}
			</div>
		</div>,
		document.body,
	);
}
