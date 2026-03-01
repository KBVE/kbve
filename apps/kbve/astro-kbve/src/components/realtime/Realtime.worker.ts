/**
 * Realtime Worker
 * Web Worker for handling Supabase Realtime connections off the main thread
 * Communicates with the Supabase SharedWorker for actual connections
 * Processes incoming data and can handle offscreen canvas rendering
 */

import { WorkerMessageType } from './typeRealtime';
import type {
	WorkerInboundMessage,
	WorkerOutboundMessage,
	ChannelSubscription,
	RealtimeEvent,
	RealtimeStatus,
	RealtimeEventType,
	PostgresChangePayload,
} from './typeRealtime';

/**
 * Worker state
 */
interface WorkerState {
	initialized: boolean;
	status: RealtimeStatus;
	subscriptions: Map<string, ChannelSubscription>;
	unsubscribeFunctions: Map<string, () => void>;
	sharedWorkerPort: MessagePort | null;
	offscreenCanvas: OffscreenCanvas | null;
	canvasContext: OffscreenCanvasRenderingContext2D | null;
}

// Initialize worker state
const state: WorkerState = {
	initialized: false,
	status: 'DISCONNECTED' as RealtimeStatus,
	subscriptions: new Map(),
	unsubscribeFunctions: new Map(),
	sharedWorkerPort: null,
	offscreenCanvas: null,
	canvasContext: null,
};

/**
 * Post message to main thread
 */
function postToMain(message: WorkerOutboundMessage) {
	self.postMessage(message);
}

/**
 * Update connection status
 */
function updateStatus(status: RealtimeStatus, message?: string, error?: Error) {
	state.status = status;
	postToMain({
		type: WorkerMessageType.STATUS_CHANGE,
		payload: { status, message, error },
	});
}

/**
 * Initialize connection to SharedWorker
 * The SharedWorker handles the actual Supabase connection
 */
async function initializeSharedWorker(
	url: string,
	anonKey: string,
	options?: any,
) {
	try {
		updateStatus(
			'CONNECTING' as RealtimeStatus,
			'Connecting to Supabase SharedWorker...',
		);

		// Import the SupaShared class dynamically
		// Note: This creates a connection to the shared worker
		const { SupaShared } = await import('../../lib/supabase-shared');

		// Create instance which connects to the shared worker
		const supaShared = new SupaShared();

		// Initialize the shared worker
		await supaShared.init(url, anonKey, options);

		// Store reference (we'll use this for subscriptions)
		// @ts-ignore - Store on global scope within worker
		self.supaShared = supaShared;

		state.initialized = true;
		updateStatus('CONNECTED' as RealtimeStatus, 'Connected to Supabase');

		postToMain({
			type: WorkerMessageType.INIT_SUCCESS,
		});
	} catch (error) {
		console.error('Failed to initialize SharedWorker:', error);
		updateStatus(
			'ERROR' as RealtimeStatus,
			'Failed to connect',
			error as Error,
		);

		postToMain({
			type: WorkerMessageType.INIT_ERROR,
			payload: { error: (error as Error).message },
		});
	}
}

/**
 * Subscribe to a realtime channel
 */
async function subscribe(subscription: ChannelSubscription) {
	try {
		if (!state.initialized) {
			throw new Error('Worker not initialized');
		}

		// @ts-ignore - Access stored supaShared instance
		const supaShared = self.supaShared;
		if (!supaShared) {
			throw new Error('SupaShared instance not available');
		}

		// Build subscription parameters for postgres_changes
		const params: any = {
			event: subscription.event || '*',
			schema: subscription.schema || 'public',
			table: subscription.table,
		};

		if (subscription.filter) {
			params.filter = subscription.filter;
		}

		// Create subscription key
		const key = subscription.id;

		// Subscribe to postgres changes via SharedWorker
		const unsubscribe = supaShared.subscribePostgres(
			key,
			params,
			(payload: any) => {
				// Process the realtime event
				processRealtimeEvent(subscription.id, payload);
			},
		);

		// Store subscription and unsubscribe function
		state.subscriptions.set(subscription.id, subscription);
		state.unsubscribeFunctions.set(subscription.id, unsubscribe);

		postToMain({
			type: WorkerMessageType.SUBSCRIBE_SUCCESS,
			payload: { id: subscription.id },
		});
	} catch (error) {
		console.error('Failed to subscribe:', error);
		postToMain({
			type: WorkerMessageType.SUBSCRIBE_ERROR,
			payload: {
				id: subscription.id,
				error: (error as Error).message,
			},
		});
	}
}

/**
 * Unsubscribe from a channel
 */
async function unsubscribe(subscriptionId: string) {
	try {
		const unsubscribeFn = state.unsubscribeFunctions.get(subscriptionId);
		if (unsubscribeFn) {
			unsubscribeFn();
			state.unsubscribeFunctions.delete(subscriptionId);
			state.subscriptions.delete(subscriptionId);
		}

		postToMain({
			type: WorkerMessageType.UNSUBSCRIBE_SUCCESS,
			payload: { id: subscriptionId },
		});
	} catch (error) {
		console.error('Failed to unsubscribe:', error);
	}
}

/**
 * Process realtime event from SharedWorker
 * Performs any data transformation or processing needed
 */
function processRealtimeEvent(channelId: string, payload: any) {
	try {
		// Determine event type
		let eventType: RealtimeEventType = 'CUSTOM' as RealtimeEventType;

		if (payload.eventType) {
			eventType = payload.eventType as RealtimeEventType;
		} else if (payload.event) {
			// Map event string to enum
			switch (payload.event) {
				case 'INSERT':
					eventType = 'INSERT' as RealtimeEventType;
					break;
				case 'UPDATE':
					eventType = 'UPDATE' as RealtimeEventType;
					break;
				case 'DELETE':
					eventType = 'DELETE' as RealtimeEventType;
					break;
				default:
					eventType = 'CUSTOM' as RealtimeEventType;
			}
		}

		// Create realtime event
		const realtimeEvent: RealtimeEvent = {
			type: eventType,
			payload: payload,
			timestamp: Date.now(),
			channelId: channelId,
		};

		// Send to main thread
		postToMain({
			type: WorkerMessageType.REALTIME_EVENT,
			payload: realtimeEvent,
		});

		// Optionally render to offscreen canvas
		if (state.offscreenCanvas && state.canvasContext) {
			renderToCanvas(realtimeEvent);
		}
	} catch (error) {
		console.error('Error processing realtime event:', error);
	}
}

/**
 * Setup offscreen canvas for rendering
 */
function setupOffscreenCanvas(
	canvas: OffscreenCanvas,
	width: number,
	height: number,
) {
	try {
		state.offscreenCanvas = canvas;
		state.offscreenCanvas.width = width;
		state.offscreenCanvas.height = height;

		const ctx = canvas.getContext('2d');
		if (ctx) {
			state.canvasContext = ctx;

			// Initialize canvas with background
			ctx.fillStyle = '#000000';
			ctx.fillRect(0, 0, width, height);
		}
	} catch (error) {
		console.error('Failed to setup offscreen canvas:', error);
	}
}

/**
 * Render realtime data to offscreen canvas
 * This is a placeholder implementation - customize based on your needs
 */
function renderToCanvas(event: RealtimeEvent) {
	if (!state.canvasContext || !state.offscreenCanvas) return;

	const ctx = state.canvasContext;
	const canvas = state.offscreenCanvas;

	try {
		// Clear previous frame with semi-transparent overlay for trail effect
		ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		// Example visualization: Draw a circle for each event
		const x = Math.random() * canvas.width;
		const y = Math.random() * canvas.height;
		const radius = 5;

		// Color based on event type
		let color = '#ffffff';
		switch (event.type) {
			case 'INSERT' as RealtimeEventType:
				color = '#4CAF50'; // Green
				break;
			case 'UPDATE' as RealtimeEventType:
				color = '#2196F3'; // Blue
				break;
			case 'DELETE' as RealtimeEventType:
				color = '#f44336'; // Red
				break;
			default:
				color = '#FFC107'; // Yellow
		}

		ctx.beginPath();
		ctx.arc(x, y, radius, 0, Math.PI * 2);
		ctx.fillStyle = color;
		ctx.fill();
		ctx.strokeStyle = color;
		ctx.lineWidth = 2;
		ctx.stroke();

		// Add event type label
		ctx.fillStyle = '#ffffff';
		ctx.font = '12px monospace';
		ctx.fillText(event.type, 10, 20);

		// Add subscription count
		ctx.fillText(`Subscriptions: ${state.subscriptions.size}`, 10, 40);

		// Notify main thread of render update
		postToMain({
			type: WorkerMessageType.RENDER_UPDATE,
			payload: {
				timestamp: Date.now(),
				eventType: event.type,
			},
		});
	} catch (error) {
		console.error('Error rendering to canvas:', error);
	}
}

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent<WorkerInboundMessage>) => {
	const message = event.data;

	switch (message.type) {
		case WorkerMessageType.INIT:
			await initializeSharedWorker(
				message.payload.url,
				message.payload.anonKey,
				message.payload.options,
			);
			break;

		case WorkerMessageType.SUBSCRIBE:
			await subscribe(message.payload);
			break;

		case WorkerMessageType.UNSUBSCRIBE:
			await unsubscribe(message.payload.id);
			break;

		case WorkerMessageType.CANVAS_TRANSFER:
			setupOffscreenCanvas(
				message.payload.canvas,
				message.payload.width,
				message.payload.height,
			);
			break;

		case WorkerMessageType.TERMINATE:
			// Cleanup all subscriptions
			for (const [id, unsubscribeFn] of state.unsubscribeFunctions) {
				try {
					unsubscribeFn();
				} catch (error) {
					console.error(`Error unsubscribing ${id}:`, error);
				}
			}
			state.subscriptions.clear();
			state.unsubscribeFunctions.clear();
			self.close();
			break;

		default:
			console.warn('Unknown message type:', (message as any).type);
	}
};

// Handle worker errors
self.onerror = (error) => {
	console.error('Worker error:', error);
	updateStatus('ERROR' as RealtimeStatus, 'Worker error', error as any);
};

// Notify main thread that worker is ready
console.log('Realtime worker initialized and ready');
