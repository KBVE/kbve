import { useEffect, useState, useCallback } from 'react';
import { DroidEvents } from '@kbve/droid';

interface EventLog {
	event: string;
	payload: unknown;
	timestamp: number;
}

export function EventBusTest() {
	const [logs, setLogs] = useState<EventLog[]>([]);
	const [panelStates, setPanelStates] = useState<Record<string, boolean>>({
		top: false,
		right: false,
		bottom: false,
		left: false,
	});

	const addLog = useCallback((event: string, payload: unknown) => {
		setLogs((prev) => [...prev, { event, payload, timestamp: Date.now() }]);
	}, []);

	useEffect(() => {
		const handleReady = (payload: { timestamp: number }) => {
			addLog('droid-ready', payload);
		};
		const handleModReady = (payload: { meta?: { name: string; version: string }; timestamp: number }) => {
			addLog('droid-mod-ready', payload);
		};
		const handlePanelOpen = (payload: { id: string; payload?: unknown }) => {
			addLog('panel-open', payload);
			setPanelStates((prev) => ({ ...prev, [payload.id]: true }));
		};
		const handlePanelClose = (payload: { id: string }) => {
			addLog('panel-close', payload);
			setPanelStates((prev) => ({ ...prev, [payload.id]: false }));
		};

		DroidEvents.on('droid-ready', handleReady);
		DroidEvents.on('droid-mod-ready', handleModReady);
		DroidEvents.on('panel-open', handlePanelOpen);
		DroidEvents.on('panel-close', handlePanelClose);

		return () => {
			DroidEvents.off('droid-ready', handleReady);
			DroidEvents.off('droid-mod-ready', handleModReady);
			DroidEvents.off('panel-open', handlePanelOpen);
			DroidEvents.off('panel-close', handlePanelClose);
		};
	}, [addLog]);

	const emitTestEvent = () => {
		DroidEvents.emit('droid-ready', { timestamp: Date.now() });
	};

	const emitPanelOpen = (id: string) => {
		DroidEvents.emit('panel-open', { id });
	};

	const emitPanelClose = (id: string) => {
		DroidEvents.emit('panel-close', { id });
	};

	const togglePanel = (id: string) => {
		if (panelStates[id]) {
			emitPanelClose(id);
		} else {
			emitPanelOpen(id);
		}
	};

	const clearLogs = () => setLogs([]);

	return (
		<div data-testid="event-bus-test" style={{ border: '1px solid #ccc', padding: '1rem', marginBottom: '1rem' }}>
			<h2>Event Bus</h2>

			<div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
				<button data-testid="emit-ready" onClick={emitTestEvent}>
					Emit droid-ready
				</button>
				<button data-testid="clear-logs" onClick={clearLogs}>
					Clear Logs
				</button>
			</div>

			<h3>Panel Controls</h3>
			<div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
				{(['top', 'right', 'bottom', 'left'] as const).map((id) => (
					<button
						key={id}
						data-testid={`toggle-panel-${id}`}
						data-state={panelStates[id] ? 'open' : 'closed'}
						onClick={() => togglePanel(id)}
					>
						{id}: {panelStates[id] ? 'Open' : 'Closed'}
					</button>
				))}
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
