import { useDroidContext } from './DroidProvider';
import { cn } from '../utils/cn';

export function DroidStatus({ className }: { className?: string }) {
	const { initialized, hasApi, hasUiux, hasWs, hasEvents, error } =
		useDroidContext();

	return (
		<div
			data-testid="droid-status"
			className={cn('droid-status', className)}
		>
			<div
				data-testid="droid-initialized"
				data-value={String(initialized)}
			>
				Initialized: {initialized ? 'Yes' : 'No'}
			</div>

			<div data-testid="droid-has-api" data-value={String(hasApi)}>
				API: {hasApi ? 'Ready' : 'Not loaded'}
			</div>

			<div data-testid="droid-has-uiux" data-value={String(hasUiux)}>
				UIUX: {hasUiux ? 'Ready' : 'Not loaded'}
			</div>

			<div data-testid="droid-has-ws" data-value={String(hasWs)}>
				WebSocket: {hasWs ? 'Ready' : 'Not loaded'}
			</div>

			<div data-testid="droid-has-events" data-value={String(hasEvents)}>
				Events: {hasEvents ? 'Ready' : 'Not loaded'}
			</div>

			{error && (
				<div data-testid="droid-error" style={{ color: 'red' }}>
					Error: {error}
				</div>
			)}
		</div>
	);
}
