/**
 * ReactSupaRealtime Component
 * React component for Supabase Realtime integration with Web Worker
 * Uses the Supa SharedWorker for actual connections, Web Worker for data processing
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { FC } from 'react';
import { useSupa, useSession } from '@/components/providers/SupaProvider';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supa';
import { WorkerMessageType } from './typeRealtime';
import type {
	RealtimeContainerProps,
	RealtimeStatus,
	RealtimeEvent,
	ChannelSubscription,
	WorkerInboundMessage,
	WorkerOutboundMessage,
	RealtimeConnectionState,
	SubscriptionCallback,
} from './typeRealtime';

/**
 * ReactSupaRealtime Component
 */
export const ReactSupaRealtime: FC<RealtimeContainerProps> = ({
	className = '',
	initialSubscriptions = [],
	onStatusChange,
	onRealtimeEvent,
	enableOffscreenCanvas = false,
	canvasId = 'realtime-canvas',
	showStatusIndicator = true,
	autoReconnect = true,
	reconnectDelay = 5000,
}) => {
	// Supa context
	const supa = useSupa();
	const { session, ready: sessionReady } = useSession();

	// Worker ref
	const workerRef = useRef<Worker | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);

	// State
	const [status, setStatus] = useState<RealtimeStatus>(
		'DISCONNECTED' as RealtimeStatus,
	);
	const [subscriptions, setSubscriptions] = useState<
		Map<string, ChannelSubscription>
	>(new Map());
	const [error, setError] = useState<string | null>(null);
	const [lastConnected, setLastConnected] = useState<number | null>(null);
	const [eventCount, setEventCount] = useState<number>(0);

	// Subscription callbacks
	const callbacksRef = useRef<Map<string, SubscriptionCallback>>(new Map());

	/**
	 * Connection state
	 */
	const connectionState: RealtimeConnectionState = useMemo(
		() => ({
			status,
			error: error || undefined,
			subscriptionCount: subscriptions.size,
			lastConnected: lastConnected || undefined,
		}),
		[status, error, subscriptions.size, lastConnected],
	);

	/**
	 * Handle worker messages
	 */
	const handleWorkerMessage = useCallback(
		(event: MessageEvent<WorkerOutboundMessage>) => {
			const message = event.data;

			switch (message.type) {
				case WorkerMessageType.INIT_SUCCESS:
					setStatus('CONNECTED' as RealtimeStatus);
					setLastConnected(Date.now());
					setError(null);
					onStatusChange?.('CONNECTED' as RealtimeStatus);
					break;

				case WorkerMessageType.INIT_ERROR:
					setStatus('ERROR' as RealtimeStatus);
					setError(message.payload.error);
					onStatusChange?.('ERROR' as RealtimeStatus);
					break;

				case WorkerMessageType.STATUS_CHANGE:
					setStatus(message.payload.status);
					if (message.payload.error) {
						setError(message.payload.error.message);
					}
					onStatusChange?.(message.payload.status);
					break;

				case WorkerMessageType.SUBSCRIBE_SUCCESS:
					console.log(
						`Subscription ${message.payload.id} successful`,
					);
					break;

				case WorkerMessageType.SUBSCRIBE_ERROR:
					console.error(
						`Subscription ${message.payload.id} failed:`,
						message.payload.error,
					);
					setError(`Subscription error: ${message.payload.error}`);
					break;

				case WorkerMessageType.REALTIME_EVENT: {
					setEventCount((prev) => prev + 1);
					const realtimeEvent = message.payload;

					// Call subscription-specific callback
					const callback = callbacksRef.current.get(
						realtimeEvent.channelId,
					);
					if (callback) {
						callback(realtimeEvent);
					}

					// Call global callback
					onRealtimeEvent?.(realtimeEvent);
					break;
				}

				case WorkerMessageType.UNSUBSCRIBE_SUCCESS:
					console.log(`Unsubscribed from ${message.payload.id}`);
					break;

				case WorkerMessageType.RENDER_UPDATE:
					// Canvas rendering update (optional handling)
					break;

				default:
					console.warn(
						'Unknown worker message:',
						(message as any).type,
					);
			}
		},
		[onStatusChange, onRealtimeEvent],
	);

	/**
	 * Initialize worker
	 */
	useEffect(() => {
		// Create worker instance using Vite's worker import syntax
		const worker = new Worker(
			new URL('./Realtime.worker.ts', import.meta.url),
			{ type: 'module' },
		);

		workerRef.current = worker;

		// Setup message handler
		worker.onmessage = handleWorkerMessage;

		// Setup error handler
		worker.onerror = (error) => {
			console.error('Worker error:', error);
			setStatus('ERROR' as RealtimeStatus);
			setError(error.message);
			onStatusChange?.('ERROR' as RealtimeStatus);
		};

		// Initialize worker with Supabase credentials
		const initMessage: WorkerInboundMessage = {
			type: WorkerMessageType.INIT,
			payload: {
				url: SUPABASE_URL,
				anonKey: SUPABASE_ANON_KEY,
			},
		};
		worker.postMessage(initMessage);

		return () => {
			// Cleanup worker
			if (workerRef.current) {
				workerRef.current.postMessage({
					type: WorkerMessageType.TERMINATE,
				});
				workerRef.current.terminate();
				workerRef.current = null;
			}
		};
	}, [handleWorkerMessage, onStatusChange]);

	/**
	 * Setup offscreen canvas if enabled
	 */
	useEffect(() => {
		if (enableOffscreenCanvas && canvasRef.current && workerRef.current) {
			try {
				const canvas = canvasRef.current;
				const offscreen = canvas.transferControlToOffscreen();

				const message: WorkerInboundMessage = {
					type: WorkerMessageType.CANVAS_TRANSFER,
					payload: {
						canvas: offscreen,
						width: canvas.width,
						height: canvas.height,
					},
				};

				// Transfer canvas to worker
				workerRef.current.postMessage(message, [offscreen as any]);
			} catch (error) {
				console.error('Failed to transfer canvas to worker:', error);
			}
		}
	}, [enableOffscreenCanvas]);

	/**
	 * Subscribe to initial subscriptions
	 */
	useEffect(() => {
		if (
			status === ('CONNECTED' as RealtimeStatus) &&
			initialSubscriptions.length > 0
		) {
			initialSubscriptions.forEach((sub) => {
				subscribe(sub).catch((error) => {
					console.error('Failed to subscribe:', error);
				});
			});
		}
	}, [status, initialSubscriptions]);

	/**
	 * Subscribe to a channel
	 */
	const subscribe = useCallback(
		async <T = any,>(
			subscription: ChannelSubscription,
			callback?: SubscriptionCallback<T>,
		): Promise<string> => {
			if (!workerRef.current) {
				throw new Error('Worker not initialized');
			}

			// Generate ID if not provided
			const id = subscription.id || crypto.randomUUID();
			const fullSubscription = { ...subscription, id };

			// Store callback
			if (callback) {
				callbacksRef.current.set(id, callback as SubscriptionCallback);
			}

			// Send subscription message to worker
			const message: WorkerInboundMessage = {
				type: WorkerMessageType.SUBSCRIBE,
				payload: fullSubscription,
			};
			workerRef.current.postMessage(message);

			// Update local state
			setSubscriptions((prev) => new Map(prev).set(id, fullSubscription));

			return id;
		},
		[],
	);

	/**
	 * Unsubscribe from a channel
	 */
	const unsubscribe = useCallback(
		async (subscriptionId: string): Promise<void> => {
			if (!workerRef.current) {
				throw new Error('Worker not initialized');
			}

			// Send unsubscribe message to worker
			const message: WorkerInboundMessage = {
				type: WorkerMessageType.UNSUBSCRIBE,
				payload: { id: subscriptionId },
			};
			workerRef.current.postMessage(message);

			// Remove callback
			callbacksRef.current.delete(subscriptionId);

			// Update local state
			setSubscriptions((prev) => {
				const next = new Map(prev);
				next.delete(subscriptionId);
				return next;
			});
		},
		[],
	);

	/**
	 * Get status indicator color
	 */
	const getStatusColor = useCallback((): string => {
		switch (status) {
			case 'CONNECTED' as RealtimeStatus:
				return '#4CAF50'; // Green
			case 'CONNECTING' as RealtimeStatus:
			case 'RECONNECTING' as RealtimeStatus:
				return '#FFC107'; // Yellow
			case 'ERROR' as RealtimeStatus:
				return '#f44336'; // Red
			case 'DISCONNECTED' as RealtimeStatus:
			default:
				return '#9E9E9E'; // Grey
		}
	}, [status]);

	/**
	 * Get status text
	 */
	const getStatusText = useCallback((): string => {
		switch (status) {
			case 'CONNECTED' as RealtimeStatus:
				return 'Connected';
			case 'CONNECTING' as RealtimeStatus:
				return 'Connecting...';
			case 'RECONNECTING' as RealtimeStatus:
				return 'Reconnecting...';
			case 'ERROR' as RealtimeStatus:
				return `Error: ${error}`;
			case 'DISCONNECTED' as RealtimeStatus:
			default:
				return 'Disconnected';
		}
	}, [status, error]);

	return (
		<div
			className={`realtime-container ${className}`}
			style={{
				position: 'relative',
				width: '100%',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
			}}>
			{/* Status Indicator */}
			{showStatusIndicator && (
				<div
					className="realtime-status"
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: '0.5rem',
						padding: '0.5rem 1rem',
						background: 'rgba(0, 0, 0, 0.7)',
						color: 'white',
						fontSize: '0.875rem',
						borderRadius: '4px',
						marginBottom: '1rem',
					}}>
					<div
						className="status-indicator"
						style={{
							width: '10px',
							height: '10px',
							borderRadius: '50%',
							backgroundColor: getStatusColor(),
							boxShadow: `0 0 8px ${getStatusColor()}`,
						}}
					/>
					<span className="status-text">{getStatusText()}</span>
					<span
						className="status-subscriptions"
						style={{ marginLeft: 'auto' }}>
						{subscriptions.size} subscription
						{subscriptions.size !== 1 ? 's' : ''}
					</span>
					<span className="status-events">
						{eventCount} event{eventCount !== 1 ? 's' : ''}
					</span>
				</div>
			)}

			{/* Offscreen Canvas (if enabled) */}
			{enableOffscreenCanvas && (
				<canvas
					ref={canvasRef}
					id={canvasId}
					width={800}
					height={600}
					style={{
						width: '100%',
						height: 'auto',
						border: '1px solid rgba(255, 255, 255, 0.2)',
						borderRadius: '4px',
						background: '#000',
					}}
				/>
			)}

			{/* Debug Info (development only) */}
			{import.meta.env.DEV && (
				<div
					className="realtime-debug"
					style={{
						marginTop: 'auto',
						padding: '0.5rem',
						background: 'rgba(0, 0, 0, 0.5)',
						color: '#ccc',
						fontSize: '0.75rem',
						fontFamily: 'monospace',
						borderRadius: '4px',
					}}>
					<div>Status: {status}</div>
					<div>Subscriptions: {subscriptions.size}</div>
					<div>Events: {eventCount}</div>
					<div>Session: {session ? 'Active' : 'None'}</div>
					{lastConnected && (
						<div>
							Last Connected:{' '}
							{new Date(lastConnected).toLocaleTimeString()}
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default ReactSupaRealtime;
