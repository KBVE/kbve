import {
	useEffect,
	useRef,
	useCallback,
	useState,
	type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../hooks/useToast';
import { $toasts } from '@kbve/droid';
import type { ToastPayload } from '@kbve/droid';

const SEVERITY_STYLES: Record<string, CSSProperties> = {
	success: {
		borderLeft: '4px solid var(--sl-color-green, #22c55e)',
		backgroundColor: 'var(--sl-color-green-low, rgba(20,83,45,0.2))',
		color: 'var(--sl-color-green-high, #bbf7d0)',
	},
	warning: {
		borderLeft: '4px solid var(--sl-color-orange, #eab308)',
		backgroundColor: 'var(--sl-color-orange-low, rgba(113,63,18,0.2))',
		color: 'var(--sl-color-orange-high, #fef08a)',
	},
	error: {
		borderLeft: '4px solid var(--sl-color-red, #ef4444)',
		backgroundColor: 'var(--sl-color-red-low, rgba(127,29,29,0.2))',
		color: 'var(--sl-color-red-high, #fecaca)',
	},
	info: {
		borderLeft: '4px solid var(--sl-color-blue, #3b82f6)',
		backgroundColor: 'var(--sl-color-blue-low, rgba(30,58,138,0.2))',
		color: 'var(--sl-color-blue-high, #bfdbfe)',
	},
};

const POSITION_STYLES: Record<string, CSSProperties> = {
	'top-right': { top: 16, right: 16 },
	'top-left': { top: 16, left: 16 },
	'bottom-right': { bottom: 16, right: 16 },
	'bottom-left': { bottom: 16, left: 16 },
	'top-center': { top: 16, left: '50%', transform: 'translateX(-50%)' },
	'bottom-center': { bottom: 16, left: '50%', transform: 'translateX(-50%)' },
};

const DEFAULT_DURATION = 5000;

function VNodeSlot({ vnode }: { vnode: any }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!ref.current) return;
		let cancelled = false;
		import('@kbve/droid').then((mod) => {
			if (cancelled || !ref.current) return;
			const renderVNode = (mod as any).renderVNode;
			if (typeof renderVNode === 'function') {
				ref.current.innerHTML = '';
				ref.current.appendChild(renderVNode(vnode));
			}
		});
		return () => {
			cancelled = true;
			if (ref.current) ref.current.innerHTML = '';
		};
	}, [vnode]);

	return <div ref={ref} />;
}

function PooledToastSlot({
	toast,
	onDismiss,
}: {
	toast: ToastPayload | null;
	onDismiss: (id: string) => void;
}) {
	const [hoverDismiss, setHoverDismiss] = useState(false);

	useEffect(() => {
		if (!toast) return;
		const duration = toast.duration ?? DEFAULT_DURATION;
		if (duration <= 0) return;
		const timer = setTimeout(() => onDismiss(toast.id), duration);
		return () => clearTimeout(timer);
	}, [toast?.id, toast?.duration, onDismiss]);

	const active = toast !== null;

	const slotStyle: CSSProperties = {
		transition: 'all 200ms ease',
		...(active
			? {
					opacity: 1,
					visibility: 'visible' as const,
					maxHeight: 160,
					pointerEvents: 'auto' as const,
				}
			: {
					opacity: 0,
					visibility: 'hidden' as const,
					maxHeight: 0,
					overflow: 'hidden',
					pointerEvents: 'none' as const,
				}),
	};

	const alertStyle: CSSProperties = {
		borderRadius: 8,
		paddingInline: 16,
		paddingBlock: 12,
		boxShadow: 'var(--sl-shadow-lg, 0 10px 15px -3px rgba(0,0,0,0.3))',
		backdropFilter: 'blur(12px)',
		...(active
			? (SEVERITY_STYLES[toast.severity] ?? SEVERITY_STYLES.info)
			: {}),
	};

	const dismissStyle: CSSProperties = {
		background: 'none',
		border: 'none',
		color: 'currentColor',
		opacity: hoverDismiss ? 1 : 0.6,
		transition: 'opacity 150ms ease',
		cursor: 'pointer',
		fontSize: 18,
		lineHeight: 1,
		padding: 0,
	};

	return (
		<div style={slotStyle} aria-hidden={!active}>
			{active && (
				<div role="alert" style={alertStyle}>
					<div
						style={{
							display: 'flex',
							alignItems: 'flex-start',
							justifyContent: 'space-between',
							gap: 8,
						}}>
						<div style={{ flex: 1 }}>
							<p
								style={{
									fontSize: 'var(--sl-text-sm, 0.875rem)',
									fontWeight: 500,
									margin: 0,
								}}>
								{toast.message}
							</p>
							{toast.vnode && <VNodeSlot vnode={toast.vnode} />}
						</div>
						<button
							type="button"
							onClick={() => onDismiss(toast.id)}
							onMouseEnter={() => setHoverDismiss(true)}
							onMouseLeave={() => setHoverDismiss(false)}
							style={dismissStyle}
							aria-label="Dismiss">
							&#x2715;
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

export interface ToastContainerProps {
	className?: string;
	position?:
		| 'top-right'
		| 'top-left'
		| 'bottom-right'
		| 'bottom-left'
		| 'top-center'
		| 'bottom-center';
	maxVisible?: number;
}

export function ToastContainer({
	className,
	position = 'top-right',
	maxVisible = 5,
}: ToastContainerProps) {
	const { toasts, remove } = useToast();
	const entries = Object.values(toasts).slice(0, maxVisible);
	const hasToasts = entries.length > 0;

	const handleDismiss = useCallback((id: string) => remove(id), [remove]);

	// Cross-island CustomEvent bridge: syncs toasts from DroidEvents
	// when nanostores modules are duplicated across Astro islands.
	// On mount, drains any toasts queued before this island was ready.
	useEffect(() => {
		const onAdded = (e: Event) => {
			const payload = (e as CustomEvent).detail as ToastPayload;
			if (!payload?.id) return;
			const current = $toasts.get();
			if (!current[payload.id]) {
				$toasts.set({ ...current, [payload.id]: payload });
			}
		};
		const onRemoved = (e: Event) => {
			const { id } = (e as CustomEvent).detail as { id: string };
			if (!id) return;
			const current = $toasts.get();
			if (current[id]) {
				const next = { ...current };
				delete next[id];
				$toasts.set(next);
			}
		};
		window.addEventListener('toast-added', onAdded);
		window.addEventListener('toast-removed', onRemoved);

		// Drain toasts queued before this island mounted (race condition fix).
		// After drain, set to null so addToast() stops buffering and relies
		// on nanostores + the CustomEvent bridge instead.
		const pending = window.__kbveToastQueue;
		if (pending && pending.length > 0) {
			const current = $toasts.get();
			const merged = { ...current };
			for (const toast of pending) {
				if (!merged[toast.id]) merged[toast.id] = toast;
			}
			$toasts.set(merged);
		}
		(window as any).__kbveToastQueue = null;

		return () => {
			window.removeEventListener('toast-added', onAdded);
			window.removeEventListener('toast-removed', onRemoved);
		};
	}, []);

	const containerStyle: CSSProperties = {
		position: 'fixed',
		zIndex: 9999,
		display: 'flex',
		flexDirection: 'column',
		gap: 8,
		width: 320,
		pointerEvents: 'none',
		...POSITION_STYLES[position],
	};

	return createPortal(
		<div
			aria-hidden={!hasToasts}
			className={className}
			style={containerStyle}>
			{Array.from({ length: maxVisible }, (_, i) => (
				<PooledToastSlot
					key={`toast-slot-${i}`}
					toast={entries[i] ?? null}
					onDismiss={handleDismiss}
				/>
			))}
		</div>,
		document.body,
	);
}
