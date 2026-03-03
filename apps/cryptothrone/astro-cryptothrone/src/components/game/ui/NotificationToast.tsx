import { useState, useEffect, useCallback } from 'react';
import { laserEvents } from '@kbve/laser';
import type { NotificationEventData } from '@kbve/laser';

export function NotificationToast() {
	const [notification, setNotification] =
		useState<NotificationEventData | null>(null);

	const handleClose = useCallback(() => setNotification(null), []);

	useEffect(() => {
		const unsub = laserEvents.on('notification', (data) => {
			setNotification(data);
			setTimeout(() => setNotification(null), 4000);
		});
		return unsub;
	}, []);

	if (!notification) return null;

	const borderColor =
		notification.notificationType === 'danger'
			? 'border-red-500'
			: notification.notificationType === 'success'
				? 'border-green-500'
				: 'border-blue-500';

	return (
		<div className="absolute top-4 right-4 z-50">
			<div
				className={`bg-gray-900/95 border-l-4 ${borderColor} rounded p-3 text-white min-w-[250px]`}>
				<div className="flex justify-between items-start">
					<div>
						<p className="font-bold text-sm">
							{notification.title}
						</p>
						<p className="text-xs mt-1 text-gray-300">
							{notification.message}
						</p>
					</div>
					<button
						onClick={handleClose}
						className="text-gray-400 hover:text-white ml-2"
						aria-label="Close notification">
						&times;
					</button>
				</div>
			</div>
		</div>
	);
}
