import { useEffect, useRef, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import { cn } from '../utils/cn';
import type { ToastPayload } from '@kbve/droid';

const SEVERITY_STYLES: Record<string, string> = {
	success: 'border-l-4 border-green-500 bg-green-900/20 text-green-200',
	warning: 'border-l-4 border-yellow-500 bg-yellow-900/20 text-yellow-200',
	error: 'border-l-4 border-red-500 bg-red-900/20 text-red-200',
	info: 'border-l-4 border-blue-500 bg-blue-900/20 text-blue-200',
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
	useEffect(() => {
		if (!toast) return;
		const duration = toast.duration ?? DEFAULT_DURATION;
		if (duration <= 0) return;
		const timer = setTimeout(() => onDismiss(toast.id), duration);
		return () => clearTimeout(timer);
	}, [toast?.id, toast?.duration, onDismiss]);

	const active = toast !== null;

	return (
		<div
			className={cn(
				'transition-all duration-200',
				active
					? 'opacity-100 visible max-h-40 pointer-events-auto'
					: 'opacity-0 invisible max-h-0 overflow-hidden pointer-events-none',
			)}
			aria-hidden={!active}>
			{active && (
				<div
					role="alert"
					className={cn(
						'rounded-lg px-4 py-3 shadow-lg backdrop-blur-md',
						SEVERITY_STYLES[toast.severity] ?? SEVERITY_STYLES.info,
					)}>
					<div className="flex items-start justify-between gap-2">
						<div className="flex-1">
							<p className="text-sm font-medium">
								{toast.message}
							</p>
							{toast.vnode && <VNodeSlot vnode={toast.vnode} />}
						</div>
						<button
							type="button"
							onClick={() => onDismiss(toast.id)}
							className="text-current opacity-60 hover:opacity-100 transition-opacity"
							aria-label="Dismiss">
							&times;
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

const POSITION_CLASSES: Record<string, string> = {
	'top-right': 'top-4 right-4',
	'top-left': 'top-4 left-4',
	'bottom-right': 'bottom-4 right-4',
	'bottom-left': 'bottom-4 left-4',
	'top-center': 'top-4 left-1/2 -translate-x-1/2',
	'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2',
};

export function ToastContainer({
	className,
	position = 'top-right',
	maxVisible = 5,
}: ToastContainerProps) {
	const { toasts, remove } = useToast();
	const entries = Object.values(toasts).slice(0, maxVisible);
	const hasToasts = entries.length > 0;

	const handleDismiss = useCallback((id: string) => remove(id), [remove]);

	return (
		<div
			aria-hidden={!hasToasts}
			className={cn(
				'fixed z-[9999] flex flex-col gap-2 w-80 pointer-events-none',
				POSITION_CLASSES[position],
				className,
			)}>
			{Array.from({ length: maxVisible }, (_, i) => (
				<PooledToastSlot
					key={`toast-slot-${i}`}
					toast={entries[i] ?? null}
					onDismiss={handleDismiss}
				/>
			))}
		</div>
	);
}
