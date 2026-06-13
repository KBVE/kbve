import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils/cn';

export type DrawerSide = 'left' | 'right' | 'top' | 'bottom';

export interface DrawerProps {
	open: boolean;
	onClose?: () => void;
	/** Edge the drawer slides in from. Defaults to `right`. */
	side?: DrawerSide;
	/** Width (left/right) or height (top/bottom) of the panel. */
	size?: number | string;
	title?: ReactNode;
	children?: ReactNode;
	/** Dim + blur behind the panel. Defaults to true. */
	backdrop?: boolean;
	closeOnBackdrop?: boolean;
	closeOnEsc?: boolean;
	className?: string;
}

const HORIZONTAL = (side: DrawerSide) => side === 'left' || side === 'right';

function hiddenTransform(side: DrawerSide): string {
	switch (side) {
		case 'left':
			return 'translateX(-100%)';
		case 'right':
			return 'translateX(100%)';
		case 'top':
			return 'translateY(-100%)';
		case 'bottom':
			return 'translateY(100%)';
	}
}

/**
 * Edge-anchored sliding panel. Starlight-safe (`.not-content` baked in), portal
 * rendered, with backdrop + Escape dismissal. Sits in the modal z-band so it
 * covers floating panels.
 */
export function Drawer({
	open,
	onClose,
	side = 'right',
	size = 320,
	title,
	children,
	backdrop = true,
	closeOnBackdrop = true,
	closeOnEsc = true,
	className,
}: DrawerProps) {
	useEffect(() => {
		if (!open || !closeOnEsc) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose?.();
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, [open, closeOnEsc, onClose]);

	useEffect(() => {
		if (!open) return;
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	}, [open]);

	const horizontal = HORIZONTAL(side);
	const dim = typeof size === 'number' ? `${size}px` : size;

	const backdropStyle: CSSProperties = {
		position: 'fixed',
		inset: 0,
		zIndex: 1000,
		transition: 'opacity 200ms ease, visibility 200ms ease',
		opacity: open ? 1 : 0,
		visibility: open ? 'visible' : 'hidden',
		pointerEvents: open ? 'auto' : 'none',
		backgroundColor: backdrop
			? 'var(--sl-color-backdrop-overlay, rgba(0,0,0,0.5))'
			: 'transparent',
		backdropFilter: backdrop ? 'blur(2px)' : undefined,
	};

	const panelStyle: CSSProperties = {
		position: 'fixed',
		zIndex: 1001,
		top: side === 'bottom' ? 'auto' : 0,
		bottom: side === 'top' ? 'auto' : 0,
		left: side === 'right' ? 'auto' : 0,
		right: side === 'left' ? 'auto' : 0,
		width: horizontal ? dim : '100%',
		height: horizontal ? '100%' : dim,
		display: 'flex',
		flexDirection: 'column',
		background: 'var(--sl-color-bg-nav, #18181b)',
		color: 'var(--sl-color-text, #f4f4f5)',
		borderRight:
			side === 'left' ? '1px solid rgba(255,255,255,0.1)' : undefined,
		borderLeft:
			side === 'right' ? '1px solid rgba(255,255,255,0.1)' : undefined,
		borderBottom:
			side === 'top' ? '1px solid rgba(255,255,255,0.1)' : undefined,
		borderTop:
			side === 'bottom' ? '1px solid rgba(255,255,255,0.1)' : undefined,
		boxShadow: '0 0 40px rgba(0,0,0,0.4)',
		transform: open ? 'none' : hiddenTransform(side),
		transition: 'transform 220ms cubic-bezier(0.4,0,0.2,1)',
	};

	return createPortal(
		<div
			style={backdropStyle}
			aria-hidden={!open}
			onClick={(e) => {
				if (open && closeOnBackdrop && e.target === e.currentTarget)
					onClose?.();
			}}>
			<aside
				className={cn('not-content', className)}
				style={panelStyle}
				role="dialog"
				aria-modal={open}>
				{(title || onClose) && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 8,
							padding: '10px 14px',
							borderBottom: '1px solid rgba(255,255,255,0.08)',
						}}>
						<span style={{ fontWeight: 600 }}>{title}</span>
						{onClose && (
							<button
								type="button"
								onClick={onClose}
								aria-label="Close"
								style={{
									background: 'none',
									border: 'none',
									color: 'var(--sl-color-gray-3, #a1a1aa)',
									cursor: 'pointer',
									fontSize: 18,
									lineHeight: 1,
									padding: 2,
								}}>
								&#x2715;
							</button>
						)}
					</div>
				)}
				<div
					style={{
						flex: '1 1 auto',
						minHeight: 0,
						overflow: 'auto',
					}}>
					{children}
				</div>
			</aside>
		</div>,
		document.body,
	);
}
