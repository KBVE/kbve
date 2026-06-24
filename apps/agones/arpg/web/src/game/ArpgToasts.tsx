import { useEffect, useRef, useState } from 'react';
import type { NotificationEventData } from '@kbve/laser';
import { onNotification } from './systems/hud';

interface Toast extends NotificationEventData {
	id: number;
}

const DISMISS_MS = 2600;

/**
 * Screen-fixed toast stack driven by laser's global `notification` event. Any
 * system (stairs, pickups, level-up, errors) calls `emitNotification(...)` and
 * the message surfaces here, then auto-dismisses.
 */
export default function ArpgToasts() {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const nextId = useRef(0);

	useEffect(() => {
		return onNotification((n) => {
			const id = nextId.current++;
			setToasts((prev) => [...prev, { ...n, id }]);
			setTimeout(
				() => setToasts((prev) => prev.filter((t) => t.id !== id)),
				DISMISS_MS,
			);
		});
	}, []);

	if (toasts.length === 0) return null;

	return (
		<div
			style={{
				position: 'absolute',
				top: '12%',
				left: '50%',
				transform: 'translateX(-50%)',
				display: 'flex',
				flexDirection: 'column',
				gap: '6px',
				alignItems: 'center',
				pointerEvents: 'none',
				zIndex: 50,
			}}>
			{toasts.map((t) => (
				<div
					key={t.id}
					style={{
						fontFamily: 'monospace',
						fontSize: '15px',
						color: '#ffe7a8',
						background: 'rgba(16, 12, 8, 0.85)',
						border: '1px solid #6b5836',
						borderRadius: '4px',
						padding: '6px 12px',
						textAlign: 'center',
						textShadow: '0 1px 2px #000',
						maxWidth: '70vw',
					}}>
					{t.title ? <strong>{t.title} — </strong> : null}
					{t.message}
				</div>
			))}
		</div>
	);
}
