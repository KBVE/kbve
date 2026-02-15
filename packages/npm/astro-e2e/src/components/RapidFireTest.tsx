import { useState, useCallback } from 'react';
import { useDroidEvents } from '@kbve/astro';
import { DroidEvents } from '@kbve/droid';

interface EventEntry {
	index: number;
	event: string;
	payload: unknown;
}

function RapidFireListener({
	setEntries,
}: {
	setEntries: React.Dispatch<React.SetStateAction<EventEntry[]>>;
}) {
	const append = useCallback(
		(event: string, payload: unknown) => {
			setEntries((prev) => [...prev, { index: prev.length, event, payload }]);
		},
		[setEntries],
	);

	useDroidEvents(
		'droid-ready',
		useCallback((p) => append('droid-ready', p), [append]),
	);
	useDroidEvents(
		'panel-open',
		useCallback((p) => append('panel-open', p), [append]),
	);
	useDroidEvents(
		'panel-close',
		useCallback((p) => append('panel-close', p), [append]),
	);
	useDroidEvents(
		'droid-mod-ready',
		useCallback((p) => append('droid-mod-ready', p), [append]),
	);

	return null;
}

export function RapidFireTest() {
	const [entries, setEntries] = useState<EventEntry[]>([]);

	const emitBurst = () => {
		for (let i = 0; i < 20; i++) {
			DroidEvents.emit('droid-ready', { timestamp: Date.now() + i });
		}
	};

	const emitMixedBurst = () => {
		const sequence = [
			() => DroidEvents.emit('droid-ready', { timestamp: Date.now() }),
			() => DroidEvents.emit('panel-open', { id: 'top' as const }),
			() => DroidEvents.emit('panel-close', { id: 'top' as const }),
			() => DroidEvents.emit('panel-open', { id: 'right' as const }),
			() => DroidEvents.emit('panel-close', { id: 'right' as const }),
			() => DroidEvents.emit('panel-open', { id: 'bottom' as const }),
			() => DroidEvents.emit('panel-close', { id: 'bottom' as const }),
			() => DroidEvents.emit('panel-open', { id: 'left' as const }),
			() => DroidEvents.emit('panel-close', { id: 'left' as const }),
			() =>
				DroidEvents.emit('droid-mod-ready', {
					meta: { name: 'test-mod', version: '1.0.0' },
					timestamp: Date.now(),
				}),
		];
		for (const fn of sequence) fn();
	};

	const emitAllPanelDirections = () => {
		const dirs = ['top', 'right', 'bottom', 'left'] as const;
		for (const id of dirs) {
			DroidEvents.emit('panel-open', { id });
		}
		for (const id of dirs) {
			DroidEvents.emit('panel-close', { id });
		}
	};

	const emitModReady = () => {
		DroidEvents.emit('droid-mod-ready', {
			meta: { name: 'edge-mod', version: '2.5.0' },
			timestamp: Date.now(),
		});
	};

	const emitModReadyMinimal = () => {
		DroidEvents.emit('droid-mod-ready', { timestamp: Date.now() });
	};

	const clearEntries = () => setEntries([]);

	return (
		<div data-testid="rapid-fire-test">
			<h2>Rapid Fire Event Tests</h2>

			<RapidFireListener setEntries={setEntries} />

			<div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
				<button data-testid="emit-burst" onClick={emitBurst}>
					Emit 20 droid-ready
				</button>
				<button data-testid="emit-mixed-burst" onClick={emitMixedBurst}>
					Emit Mixed Burst (10)
				</button>
				<button data-testid="emit-all-panels" onClick={emitAllPanelDirections}>
					All Panel Directions
				</button>
				<button data-testid="emit-mod-ready" onClick={emitModReady}>
					Emit droid-mod-ready
				</button>
				<button data-testid="emit-mod-ready-minimal" onClick={emitModReadyMinimal}>
					Emit droid-mod-ready (no meta)
				</button>
				<button data-testid="clear-rapid" onClick={clearEntries}>
					Clear
				</button>
			</div>

			<div data-testid="rapid-log" data-count={String(entries.length)}>
				{entries.length === 0 && <p data-testid="rapid-empty">No events.</p>}
				{entries.map((e) => (
					<div key={e.index} data-testid={`rapid-entry-${e.index}`} data-event={e.event}>
						<strong>{e.event}</strong>: {JSON.stringify(e.payload)}
					</div>
				))}
			</div>
		</div>
	);
}
