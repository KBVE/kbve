import { useEffect } from 'react';
import { useGameSelector, useGameDispatch } from '../store/GameStoreContext';
import type { NotificationItem } from '../types';

const BORDER_COLORS: Record<string, string> = {
	danger: 'border-red-500',
	success: 'border-green-500',
	info: 'border-blue-500',
	warning: 'border-yellow-500',
};

function Toast({ n, depth }: { n: NotificationItem; depth: number }) {
	const dispatch = useGameDispatch();

	useEffect(() => {
		const timer = setTimeout(() => {
			dispatch({ type: 'REMOVE_NOTIFICATION', payload: { id: n.id } });
		}, 5000);
		return () => clearTimeout(timer);
	}, [n.id, dispatch]);

	return (
		<div
			style={{
				position: 'absolute',
				left: '50%',
				bottom: 0,
				zIndex: 100 - depth,
				transform: `translateX(-50%) translateY(calc(${depth} * clamp(-14px, -2.4vw, -8px))) scale(${1 - depth * 0.04})`,
				opacity: Math.max(0, 1 - depth * 0.18),
				filter:
					depth > 0 ? `brightness(${1 - depth * 0.08})` : undefined,
				transition: 'transform 200ms ease, opacity 200ms ease',
			}}
			className={`pointer-events-auto bg-gray-900/95 border-l-4 ${BORDER_COLORS[n.type] ?? 'border-blue-500'} rounded p-3 text-white shadow-lg w-[clamp(220px,80vw,400px)]`}>
			<div className="flex justify-between items-start">
				<div>
					<p className="font-bold text-sm">{n.title}</p>
					<p className="text-xs mt-1 text-gray-300">{n.message}</p>
				</div>
				<button
					onClick={() =>
						dispatch({
							type: 'REMOVE_NOTIFICATION',
							payload: { id: n.id },
						})
					}
					className="text-gray-400 hover:text-white ml-2"
					aria-label="Close">
					&times;
				</button>
			</div>
		</div>
	);
}

export function NotificationToast() {
	const notifications = useGameSelector((s) => s.notifications);

	if (notifications.length === 0) return null;

	const last = notifications.length - 1;

	return (
		<div className="fixed inset-x-0 bottom-4 z-50 flex justify-center pointer-events-none">
			<div className="relative w-[clamp(220px,80vw,400px)] h-0">
				{notifications.map((n, i) => (
					<Toast key={n.id} n={n} depth={last - i} />
				))}
			</div>
		</div>
	);
}
