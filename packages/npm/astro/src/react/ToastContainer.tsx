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
			// Access renderVNode from the workers/tools module via the droid entry
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

function ToastItem({
	toast,
	onDismiss,
}: {
	toast: ToastPayload;
	onDismiss: (id: string) => void;
}) {
	useEffect(() => {
		const duration = toast.duration ?? DEFAULT_DURATION;
		if (duration <= 0) return;
		const timer = setTimeout(() => onDismiss(toast.id), duration);
		return () => clearTimeout(timer);
	}, [toast.id, toast.duration, onDismiss]);

	return (
		<div
			role="alert"
			className={cn(
				'rounded-lg px-4 py-3 shadow-lg backdrop-blur-md',
				SEVERITY_STYLES[toast.severity] ?? SEVERITY_STYLES.info,
			)}>
			<div className="flex items-start justify-between gap-2">
				<div className="flex-1">
					<p className="text-sm font-medium">{toast.message}</p>
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

	const handleDismiss = useCallback((id: string) => remove(id), [remove]);

	if (entries.length === 0) return null;

	return (
		<div
			className={cn(
				'fixed z-[9999] flex flex-col gap-2 w-80 pointer-events-none',
				POSITION_CLASSES[position],
				className,
			)}>
			{entries.map((toast) => (
				<div key={toast.id} className="pointer-events-auto">
					<ToastItem toast={toast} onDismiss={handleDismiss} />
				</div>
			))}
		</div>
	);
}
