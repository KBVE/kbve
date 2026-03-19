import { useEffect, useRef, useState } from 'react';
import {
	viewStart,
	viewSnapshot,
	onViewStatusChange,
	onViewConfigAck,
	type ViewStatus,
} from './bridge';

interface ViewBridgeState {
	status: ViewStatus;
	data: Record<string, unknown>;
	loading: boolean;
	error: string | null;
}

/**
 * Hook that connects a frontend view to its backend actor.
 *
 * On mount:
 * 1. Sends a Start command to the actor
 * 2. Fetches the actor's snapshot to hydrate initial state
 * 3. Subscribes to status + config events for live updates
 *
 * Returns the current actor state which updates via direct event
 * subscriptions — no polling.
 */
export function useViewBridge(viewId: string): ViewBridgeState {
	const [state, setState] = useState<ViewBridgeState>({
		status: 'idle',
		data: {},
		loading: true,
		error: null,
	});
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;
		const cleanups: (() => void)[] = [];

		async function init() {
			try {
				// Start the actor
				await viewStart(viewId);

				// Fetch initial snapshot
				const snap = await viewSnapshot(viewId);
				if (mountedRef.current) {
					setState({
						status: snap.status,
						data: snap.data,
						loading: false,
						error: null,
					});
				}

				// Subscribe to status changes
				const unStatus = await onViewStatusChange(viewId, (status) => {
					if (mountedRef.current) {
						setState((prev) => ({ ...prev, status }));
					}
				});
				cleanups.push(unStatus);

				// Subscribe to config acknowledgements
				const unConfig = await onViewConfigAck(viewId, (config) => {
					if (mountedRef.current) {
						setState((prev) => ({
							...prev,
							data: { ...prev.data, ...config },
						}));
					}
				});
				cleanups.push(unConfig);
			} catch (err) {
				// In dev mode without Tauri, invoke() throws — handle gracefully
				if (mountedRef.current) {
					setState((prev) => ({
						...prev,
						loading: false,
						error:
							err instanceof Error
								? err.message
								: 'Bridge unavailable',
					}));
				}
			}
		}

		init();

		return () => {
			mountedRef.current = false;
			cleanups.forEach((fn) => fn());
		};
	}, [viewId]);

	return state;
}
