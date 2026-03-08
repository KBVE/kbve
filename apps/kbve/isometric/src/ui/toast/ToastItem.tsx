import { useEffect } from 'react';
import type { Toast } from './toast-types';
import { SEVERITY_BORDER_COLORS } from './toast-types';

interface ToastItemProps {
	toast: Toast;
	onDismiss: (id: string) => void;
}

export function ToastItem({ toast, onDismiss }: ToastItemProps) {
	useEffect(() => {
		if (toast.duration <= 0 || toast.exiting) return;
		const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
		return () => clearTimeout(timer);
	}, [toast.id, toast.duration, toast.exiting, onDismiss]);

	const borderClass = SEVERITY_BORDER_COLORS[toast.severity];

	return (
		<div
			className={`
				pointer-events-auto mb-2 px-3 py-2.5 min-w-[220px] max-w-[320px]
				bg-glass backdrop-blur-[4px] rounded-toast shadow-toast
				border border-glass-border border-l-4 ${borderClass}
				${toast.exiting ? 'animate-toast-out' : 'animate-toast-in'}
				flex items-start gap-2
			`}
			onAnimationEnd={() => {
				if (toast.exiting) onDismiss(toast.id);
			}}>
			<span className="text-[13px] leading-snug flex-1">
				{toast.message}
			</span>
			<button
				onClick={() => onDismiss(toast.id)}
				className="text-white/50 hover:text-white text-sm leading-none mt-0.5 cursor-pointer">
				&times;
			</button>
		</div>
	);
}
