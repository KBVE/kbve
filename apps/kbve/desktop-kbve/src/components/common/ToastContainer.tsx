import { useEffect, useState } from 'react';
import { useToastStore, type Toast } from '../../stores/toastStore';

function ToastItem({ toast }: { toast: Toast }) {
	const removeToast = useToastStore((state) => state.removeToast);
	const [progress, setProgress] = useState(100);

	// Animate progress bar for auto-dismiss
	useEffect(() => {
		if (!toast.duration || toast.duration <= 0) return;

		const duration = toast.duration;
		const startTime = toast.createdAt;
		const endTime = startTime + duration;

		const updateProgress = () => {
			const now = Date.now();
			const remaining = Math.max(0, endTime - now);
			const percent = (remaining / duration) * 100;
			setProgress(percent);

			if (percent > 0) {
				requestAnimationFrame(updateProgress);
			}
		};

		const animationId = requestAnimationFrame(updateProgress);
		return () => cancelAnimationFrame(animationId);
	}, [toast.createdAt, toast.duration]);

	const getToastStyles = () => {
		switch (toast.type) {
			case 'success':
				return {
					container:
						'bg-green-500/10 border-green-500/30 text-green-400',
					progress: 'bg-green-500/50',
				};
			case 'error':
				return {
					container: 'bg-red-500/10 border-red-500/30 text-red-400',
					progress: 'bg-red-500/50',
				};
			case 'warning':
				return {
					container:
						'bg-yellow-500/10 border-yellow-500/30 text-yellow-400',
					progress: 'bg-yellow-500/50',
				};
			case 'info':
				return {
					container:
						'bg-blue-500/10 border-blue-500/30 text-blue-400',
					progress: 'bg-blue-500/50',
				};
		}
	};

	const getIcon = () => {
		switch (toast.type) {
			case 'success':
				return '✓';
			case 'error':
				return '✕';
			case 'warning':
				return '⚠';
			case 'info':
				return 'ℹ';
		}
	};

	const styles = getToastStyles();

	return (
		<div
			className={`
        ${styles.container}
        border rounded-lg shadow-lg
        backdrop-blur-sm
        min-w-[300px] max-w-[450px]
        animate-slide-in-right
        overflow-hidden
        relative
      `}>
			<div className="flex items-start gap-3 p-3">
				<div className="flex-shrink-0 text-lg font-bold mt-0.5">
					{getIcon()}
				</div>
				<div className="flex-1 min-w-0">
					<div className="font-medium text-sm">{toast.title}</div>
					{toast.message && (
						<div className="text-xs text-gray-400 mt-1 break-words">
							{toast.message}
						</div>
					)}
				</div>
				<button
					onClick={() => removeToast(toast.id)}
					className="flex-shrink-0 text-gray-400 hover:text-white transition-colors text-sm"
					aria-label="Close notification">
					✕
				</button>
			</div>

			{/* Progress bar for auto-dismiss */}
			{toast.duration && toast.duration > 0 && (
				<div className="h-0.5 w-full bg-black/20">
					<div
						className={`h-full ${styles.progress} transition-none`}
						style={{ width: `${progress}%` }}
					/>
				</div>
			)}
		</div>
	);
}

export function ToastContainer() {
	const toasts = useToastStore((state) => state.toasts);

	if (toasts.length === 0) return null;

	// Sort by createdAt so oldest appears at top, newest at bottom
	const sortedToasts = [...toasts].sort((a, b) => a.createdAt - b.createdAt);

	return (
		<div
			className="fixed bottom-20 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
			aria-live="polite"
			aria-atomic="true">
			{sortedToasts.map((toast) => (
				<div key={toast.id} className="pointer-events-auto">
					<ToastItem toast={toast} />
				</div>
			))}
		</div>
	);
}
