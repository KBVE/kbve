import { useRef, useEffect } from 'react';
import type { ViewStatus } from '../engine/bridge';

const STATUS_COLORS: Record<ViewStatus, string> = {
	idle: 'var(--color-status-idle)',
	running: 'var(--color-status-running)',
	paused: 'var(--color-status-paused)',
	stopped: 'var(--color-status-stopped)',
};

const STATUS_LABELS: Record<ViewStatus, string> = {
	idle: 'Idle',
	running: 'Connected',
	paused: 'Paused',
	stopped: 'Disconnected',
};

interface ViewStatusBadgeProps {
	status: ViewStatus;
}

/**
 * Small dot + label badge showing backend actor status.
 * Updates via direct DOM patch when status prop changes.
 */
export function ViewStatusBadge({ status }: ViewStatusBadgeProps) {
	const dotRef = useRef<HTMLSpanElement>(null);
	const labelRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		if (dotRef.current) {
			dotRef.current.style.backgroundColor =
				STATUS_COLORS[status] ?? STATUS_COLORS.idle;
		}
		if (labelRef.current) {
			labelRef.current.textContent = STATUS_LABELS[status] ?? status;
		}
	}, [status]);

	return (
		<div className="flex items-center gap-1.5">
			<span
				ref={dotRef}
				className="inline-block h-2 w-2 rounded-full"
				style={{
					backgroundColor:
						STATUS_COLORS[status] ?? STATUS_COLORS.idle,
				}}
			/>
			<span
				ref={labelRef}
				className="text-caption"
				style={{ color: 'var(--color-text-muted)' }}>
				{STATUS_LABELS[status] ?? status}
			</span>
		</div>
	);
}
