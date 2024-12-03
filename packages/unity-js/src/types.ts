import { DiscordSDK } from '@discord/embedded-app-sdk';

//  [Discord]

export type DiscordConfigOptions = {
	clientId: string;
	scope: ScopeArgument;
	tokenRoute: `/${string}`;
	redirectUri?: string;
	debug?: boolean;
};

export type DiscordSDKEvents = Parameters<DiscordSDK['subscribe']>[0];
export type ScopeArgument = Parameters<
	DiscordSDK['commands']['authorize']
>[0]['scope'];
export type AuthUser = Awaited<
	ReturnType<DiscordSDK['commands']['authenticate']>
>['user'];

export type ActivityCommands = 'SET_ACTIVITY' | 'GET_INSTANCE_ID' | 'GET_USER';
export type SystemCommands =
	| 'HARDWARE_ACCELERATION'
	| 'GET_LOCALE'
	| 'SET_CONFIG';
export type DialogCommands = 'INVITE_DIALOG' | 'SHARE_MOMENT_DIALOG';

export type MessageChildCommand =
	| ActivityCommands
	| SystemCommands
	| DialogCommands;
export type MessageParentCommand =
	| Exclude<MessageChildCommand, 'DISPATCH' | 'LOADED'>
	| 'SUBSCRIBE'
	| 'UNSUBSCRIBE'
	| 'PING_LOAD';

//  [Discord] => MessageData
export interface MessageData<TData = any, TArgs = any> {
	nonce?: string;
	event?: DiscordSDKEvents;
	command?: MessageChildCommand | MessageParentCommand;
	data?: TData;
	args?: TArgs;
}

export interface CompatibleUser {
	id: string;
	username: string;
	discriminator: string;
	avatar?: string | null;
	globalName?: string | null;
	flags: number;
	bot: boolean;
	publicFlags?: number;
}

export type Nullable<T> = T | null | undefined;

export interface BaseResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}

export type DataPromise<T = AuthUser> = Promise<{
	discordSdk: DiscordSDK;
	user: T | null;
	error?: string;
}>;

//  [JavaScript FFI]

// Map of JavaScriptListenerState
export enum JavaScriptListenerState {
	None = 0, // No state (default)
	Initializing = 1 << 0, // Listener is setting up
	WaitingForServer = 1 << 1, // Waiting for WebSocket or server configuration
	Connected = 1 << 2, // Listener is active and connected
	Disconnected = 1 << 3, // Listener is disconnected
	Error = 1 << 4, // Listener encountered an error
	Reconnecting = 1 << 5, // Listener is attempting to reconnect
	Listening = 1 << 6, // Listener is actively receiving data
	Paused = 1 << 7, // Listener is paused
	Closing = 1 << 8, // Listener is shutting down
	Retrying = 1 << 9, // Listener is retrying a failed operation
	Suspended = 1 << 10, // Listener is suspended
	Authenticated = 1 << 11, // Listener completed authentication
	Unsubscribed = 1 << 12, // Listener is unsubscribed
	PendingData = 1 << 13, // Pending data to process
	Timeout = 1 << 14, // Operation timeout
	ReceivingHandshake = 1 << 15, // Receiving initial handshake
	HeartbeatFailure = 1 << 16, // Heartbeat failure
	Resuming = 1 << 17, // Listener resuming
	RateLimited = 1 << 18, // Listener is rate-limited
	Buffered = 1 << 19, // Data is buffered
	WaitingForReconnect = 1 << 20, // Waiting for reconnect attempt
	SendingData = 1 << 21, // Listener is sending data
	ReceivingData = 1 << 22, // Listener is receiving data
	Overloaded = 1 << 23, // Listener is overloaded with requests
	Validating = 1 << 24, // Listener is validating data
	Queued = 1 << 25, // Listener's actions are queued
	Syncing = 1 << 26, // Listener is synchronizing data
	Expired = 1 << 27, // Listener session expired
	Degraded = 1 << 28, // Listener is in a degraded state
	ShuttingDown = 1 << 29, // Listener is shutting down completely
	MaintenanceMode = 1 << 30, // Listener in maintenance mode
	CriticalFailure = 1 << 31, // Listener encountered a critical failure
}

// Map of JavaScriptMessageType
export enum JavaScriptMessageType {
	None = 0, // No type
	Text = 1 << 0, // Plain text
	JSON = 1 << 1, // JSON data
	Binary = 1 << 2, // Binary data
	Command = 1 << 3, // Command or action message
	Event = 1 << 4, // Real-time event
	Error = 1 << 5, // Error message
	Notification = 1 << 6, // Notification message
	Authentication = 1 << 7, // Authentication message
	Configuration = 1 << 8, // Configuration data
	Sync = 1 << 9, // Synchronization message
	Heartbeat = 1 << 10, // Heartbeat message
}

//  Combined JSFFI