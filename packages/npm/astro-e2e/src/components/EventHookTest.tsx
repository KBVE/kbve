import { useState, useCallback } from 'react';
import { useDroidEvents } from '@kbve/astro';
import { DroidEvents } from '@kbve/droid';

interface EventLog {
	event: string;
	payload: unknown;
	timestamp: number;
}

function EventListener({
	setLogs,
}: {
	setLogs: React.Dispatch<React.SetStateAction<EventLog[]>>;
}) {
	const addLog = useCallback(
		(event: string, payload: unknown) => {
			setLogs((prev) => [...prev, { event, payload, timestamp: Date.now() }]);
		},
		[setLogs],
	);

	useDroidEvents(
		'droid-ready',
		useCallback((payload) => addLog('droid-ready', payload), [addLog]),
	);

	useDroidEvents(
		'panel-open',
		useCallback((payload) => addLog('panel-open', payload), [addLog]),
	);

	useDroidEvents(
		'panel-close',
		useCallback((payload) => addLog('panel-close', payload), [addLog]),
	);

	return null;
}

export function EventHookTest() {
	const [logs, setLogs] = useState<EventLog[]>([]);

	const emitReady = () => {
		DroidEvents.emit('droid-ready', { timestamp: Date.now() });
	};

	const emitPanelOpen = () => {
		DroidEvents.emit('panel-open', { id: 'right' });
	};

	const emitPanelClose = () => {
		DroidEvents.emit('panel-close', { id: 'right' });
	};

	const clearLogs = () => setLogs([]);

	return (
		<div data-testid="event-hook-test" style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
			<h2>useDroidEvents Hook</h2>

			<EventListener setLogs={setLogs} />

			<div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
				<button data-testid="emit-ready" onClick={emitReady}>
					Emit droid-ready
				</button>
				<button data-testid="emit-panel-open" onClick={emitPanelOpen}>
					Emit panel-open
				</button>
				<button data-testid="emit-panel-close" onClick={emitPanelClose}>
					Emit panel-close
				</button>
				<button data-testid="clear-logs" onClick={clearLogs}>
					Clear Logs
				</button>
			</div>

			<h3>Event Log</h3>
			<div data-testid="event-log" data-count={String(logs.length)}>
				{logs.length === 0 && <p data-testid="no-events">No events captured yet.</p>}
				{logs.map((log, i) => (
					<div key={i} data-testid={`event-entry-${i}`} data-event={log.event}>
						<strong>{log.event}</strong>: {JSON.stringify(log.payload)}
					</div>
				))}
			</div>
		</div>
	);
}
