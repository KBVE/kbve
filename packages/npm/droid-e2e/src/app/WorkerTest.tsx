import { useEffect, useState } from 'react';
import { droid } from '@kbve/droid';

interface WorkerStatus {
	initialized: boolean;
	hasApi: boolean;
	hasUiux: boolean;
	hasWs: boolean;
	hasEvents: boolean;
	error: string | null;
}

export function WorkerTest() {
	const [status, setStatus] = useState<WorkerStatus>({
		initialized: false,
		hasApi: false,
		hasUiux: false,
		hasWs: false,
		hasEvents: false,
		error: null,
	});

	useEffect(() => {
		let cancelled = false;

		async function init() {
			try {
				const result = await droid();
				if (cancelled) return;

				const kbve = (window as any).kbve;
				setStatus({
					initialized: result.initialized,
					hasApi: !!kbve?.api,
					hasUiux: !!kbve?.uiux,
					hasWs: !!kbve?.ws,
					hasEvents: !!kbve?.events,
					error: null,
				});
			} catch (err) {
				if (cancelled) return;
				setStatus((prev) => ({
					...prev,
					error: err instanceof Error ? err.message : String(err),
				}));
			}
		}

		init();
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<div data-testid="worker-test" style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
			<h2>Worker Initialization</h2>

			<div data-testid="worker-initialized" data-value={String(status.initialized)}>
				Initialized: {status.initialized ? 'Yes' : 'No'}
			</div>

			<div data-testid="worker-has-api" data-value={String(status.hasApi)}>
				API Worker: {status.hasApi ? 'Ready' : 'Not loaded'}
			</div>

			<div data-testid="worker-has-uiux" data-value={String(status.hasUiux)}>
				UIUX: {status.hasUiux ? 'Ready' : 'Not loaded'}
			</div>

			<div data-testid="worker-has-ws" data-value={String(status.hasWs)}>
				WebSocket Worker: {status.hasWs ? 'Ready' : 'Not loaded'}
			</div>

			<div data-testid="worker-has-events" data-value={String(status.hasEvents)}>
				Event Bus: {status.hasEvents ? 'Ready' : 'Not loaded'}
			</div>

			{status.error && (
				<div data-testid="worker-error" style={{ color: 'red' }}>
					Error: {status.error}
				</div>
			)}
		</div>
	);
}
