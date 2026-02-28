/**
 * Realtime Types
 * Defines all TypeScript types for Supabase Realtime integration with Web Workers
 */

/**
 * Realtime connection status
 */
export enum RealtimeStatus {
	DISCONNECTED = 'DISCONNECTED',
	CONNECTING = 'CONNECTING',
	CONNECTED = 'CONNECTED',
	ERROR = 'ERROR',
	RECONNECTING = 'RECONNECTING',
}

/**
 * Realtime event types that can be received from Supabase
 */
export enum RealtimeEventType {
	// Postgres Changes
	INSERT = 'INSERT',
	UPDATE = 'UPDATE',
	DELETE = 'DELETE',

	// System events
	SYSTEM = 'SYSTEM',
	PRESENCE = 'PRESENCE',
	BROADCAST = 'BROADCAST',

	// Custom events
	CUSTOM = 'CUSTOM',
}

/**
 * Worker message types for communication between main thread and worker
 */
export enum WorkerMessageType {
	// Worker initialization
	INIT = 'INIT',
	INIT_SUCCESS = 'INIT_SUCCESS',
	INIT_ERROR = 'INIT_ERROR',

	// Channel subscription
	SUBSCRIBE = 'SUBSCRIBE',
	SUBSCRIBE_SUCCESS = 'SUBSCRIBE_SUCCESS',
	SUBSCRIBE_ERROR = 'SUBSCRIBE_ERROR',

	// Channel unsubscription
	UNSUBSCRIBE = 'UNSUBSCRIBE',
	UNSUBSCRIBE_SUCCESS = 'UNSUBSCRIBE_SUCCESS',

	// Data events
	REALTIME_EVENT = 'REALTIME_EVENT',

	// Connection status
	STATUS_CHANGE = 'STATUS_CHANGE',

	// Worker control
	TERMINATE = 'TERMINATE',

	// Offscreen canvas (for future use)
	CANVAS_TRANSFER = 'CANVAS_TRANSFER',
	RENDER_UPDATE = 'RENDER_UPDATE',
}

/**
 * Postgres change payload structure
 */
export interface PostgresChangePayload<T = any> {
	/**
	 * Type of change (INSERT, UPDATE, DELETE)
	 */
	eventType: RealtimeEventType;

	/**
	 * New record data (for INSERT and UPDATE)
	 */
	new?: T;

	/**
	 * Old record data (for UPDATE and DELETE)
	 */
	old?: T;

	/**
	 * Schema name
	 */
	schema: string;

	/**
	 * Table name
	 */
	table: string;

	/**
	 * Commit timestamp
	 */
	commit_timestamp?: string;

	/**
	 * Any errors that occurred
	 */
	errors?: string[];
}

/**
 * Realtime event payload wrapper
 */
export interface RealtimeEvent<T = any> {
	/**
	 * Type of the event
	 */
	type: RealtimeEventType;

	/**
	 * Event data payload
	 */
	payload: PostgresChangePayload<T> | T;

	/**
	 * Timestamp of the event
	 */
	timestamp: number;

	/**
	 * Channel ID this event came from
	 */
	channelId: string;
}

/**
 * Channel subscription configuration
 */
export interface ChannelSubscription {
	/**
	 * Unique identifier for this subscription
	 */
	id: string;

	/**
	 * Channel name/topic
	 */
	channel: string;

	/**
	 * Schema to listen to (for postgres_changes)
	 */
	schema?: string;

	/**
	 * Table to listen to (for postgres_changes)
	 */
	table?: string;

	/**
	 * Event type filter (INSERT, UPDATE, DELETE, or *)
	 */
	event?: string;

	/**
	 * Filter conditions
	 */
	filter?: string;

	/**
	 * Subscription type (postgres_changes, broadcast, presence)
	 */
	subscriptionType?: 'postgres_changes' | 'broadcast' | 'presence';
}

/**
 * Worker initialization message
 */
export interface WorkerInitMessage {
	type: WorkerMessageType.INIT;
	payload: {
		/**
		 * Supabase URL
		 */
		url: string;

		/**
		 * Supabase anonymous key
		 */
		anonKey: string;

		/**
		 * Optional configuration
		 */
		options?: any;
	};
}

/**
 * Worker subscribe message
 */
export interface WorkerSubscribeMessage {
	type: WorkerMessageType.SUBSCRIBE;
	payload: ChannelSubscription;
}

/**
 * Worker unsubscribe message
 */
export interface WorkerUnsubscribeMessage {
	type: WorkerMessageType.UNSUBSCRIBE;
	payload: {
		id: string;
	};
}

/**
 * Worker realtime event message (from worker to main thread)
 */
export interface WorkerRealtimeEventMessage<T = any> {
	type: WorkerMessageType.REALTIME_EVENT;
	payload: RealtimeEvent<T>;
}

/**
 * Worker status change message
 */
export interface WorkerStatusMessage {
	type: WorkerMessageType.STATUS_CHANGE;
	payload: {
		status: RealtimeStatus;
		message?: string;
		error?: Error;
	};
}

/**
 * Worker canvas transfer message (for offscreen canvas support)
 */
export interface WorkerCanvasMessage {
	type: WorkerMessageType.CANVAS_TRANSFER;
	payload: {
		canvas: OffscreenCanvas;
		width: number;
		height: number;
	};
}

/**
 * Union type of all worker messages from main thread to worker
 */
export type WorkerInboundMessage =
	| WorkerInitMessage
	| WorkerSubscribeMessage
	| WorkerUnsubscribeMessage
	| WorkerCanvasMessage
	| { type: WorkerMessageType.TERMINATE };

/**
 * Union type of all worker messages from worker to main thread
 */
export type WorkerOutboundMessage =
	| WorkerRealtimeEventMessage
	| WorkerStatusMessage
	| { type: WorkerMessageType.INIT_SUCCESS }
	| { type: WorkerMessageType.INIT_ERROR; payload: { error: string } }
	| { type: WorkerMessageType.SUBSCRIBE_SUCCESS; payload: { id: string } }
	| {
			type: WorkerMessageType.SUBSCRIBE_ERROR;
			payload: { id: string; error: string };
	  }
	| { type: WorkerMessageType.UNSUBSCRIBE_SUCCESS; payload: { id: string } }
	| { type: WorkerMessageType.RENDER_UPDATE; payload: any };

/**
 * Realtime connection state
 */
export interface RealtimeConnectionState {
	/**
	 * Current connection status
	 */
	status: RealtimeStatus;

	/**
	 * Error message if status is ERROR
	 */
	error?: string;

	/**
	 * Number of active subscriptions
	 */
	subscriptionCount: number;

	/**
	 * Last connection timestamp
	 */
	lastConnected?: number;

	/**
	 * Last error timestamp
	 */
	lastError?: number;
}

/**
 * Realtime container props
 */
export interface RealtimeContainerProps {
	/**
	 * CSS class name for the container
	 */
	className?: string;

	/**
	 * Initial channel subscriptions
	 */
	initialSubscriptions?: ChannelSubscription[];

	/**
	 * Callback when connection status changes
	 */
	onStatusChange?: (status: RealtimeStatus) => void;

	/**
	 * Callback when realtime event is received
	 */
	onRealtimeEvent?: <T = any>(event: RealtimeEvent<T>) => void;

	/**
	 * Whether to enable offscreen canvas rendering
	 */
	enableOffscreenCanvas?: boolean;

	/**
	 * Canvas element ID (if using offscreen canvas)
	 */
	canvasId?: string;

	/**
	 * Whether to show connection status indicator
	 */
	showStatusIndicator?: boolean;

	/**
	 * Whether to automatically reconnect on disconnect
	 */
	autoReconnect?: boolean;

	/**
	 * Reconnection delay in milliseconds
	 */
	reconnectDelay?: number;
}

/**
 * Realtime data visualization config (for future offscreen canvas use)
 */
export interface RealtimeVisualizationConfig {
	/**
	 * Canvas width
	 */
	width: number;

	/**
	 * Canvas height
	 */
	height: number;

	/**
	 * Background color
	 */
	backgroundColor?: string;

	/**
	 * Whether to enable animations
	 */
	enableAnimations?: boolean;

	/**
	 * Update frequency in milliseconds
	 */
	updateFrequency?: number;
}

/**
 * Subscription callback function type
 */
export type SubscriptionCallback<T = any> = (event: RealtimeEvent<T>) => void;

/**
 * Subscription manager interface
 */
export interface SubscriptionManager {
	/**
	 * Subscribe to a channel
	 */
	subscribe<T = any>(
		subscription: ChannelSubscription,
		callback: SubscriptionCallback<T>,
	): Promise<string>;

	/**
	 * Unsubscribe from a channel
	 */
	unsubscribe(subscriptionId: string): Promise<void>;

	/**
	 * Get all active subscriptions
	 */
	getSubscriptions(): ChannelSubscription[];

	/**
	 * Get connection state
	 */
	getConnectionState(): RealtimeConnectionState;
}
