import { useEffect } from 'react';
import { useGameSelector, useGameDispatch } from '../store/GameStoreContext';
import type { NotificationItem } from '../types';

const BORDER_COLORS: Record<string, string> = {
	danger: 'border-red-500',
	success: 'border-green-500',
	info: 'border-blue-500',
	warning: 'border-yellow-500',
};

function Toast({ n }: { n: NotificationItem }) {
	const dispatch = useGameDispatch();

	useEffect(() => {
		const timer = setTimeout(() => {
			dispatch({ type: 'REMOVE_NOTIFICATION', payload: { id: n.id } });
		}, 5000);
		return () => clearTimeout(timer);
	}, [n.id, dispatch]);

	return (
		<div
			className={`pointer-events-auto bg-gray-900/95 border-l-4 ${BORDER_COLORS[n.type] ?? 'border-blue-500'} rounded p-3 text-white min-w-[250px] max-w-[400px]`}>
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

	return (
		<div className="fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 pointer-events-none">
			{notifications.map((n) => (
				<Toast key={n.id} n={n} />
			))}
		</div>
	);
}
