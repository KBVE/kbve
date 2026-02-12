import { DiscordSDK } from '@discord/embedded-app-sdk';

//  [LOGGER]

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
    level: LogLevel;
    message: string;
    context?: Record<string, unknown>;
}

//  [Discord]

export type Snowflake = string;

export interface Entitlement {
	id: Snowflake;
	sku_id: Snowflake;
	application_id: Snowflake;
	user_id?: Snowflake;
	type: number;
	deleted: boolean;
	starts_at?: string;
	ends_at?: string;
	guild_id?: Snowflake;
	consumed?: boolean;
  }

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
	global_name?: string | null;
	public_flags?: number;
	flags?: number;
	bot?: boolean;
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
    Purge = 1 << 11, // Purge all messages & GC + alloc trigger
}

export enum Commands {
    // MessageParentCommand
    SUBSCRIBE = 1 << 0, // 1
    UNSUBSCRIBE = 1 << 1, // 2
    PING_LOAD = 1 << 2, // 4
    // MessageChildCommand
    LOADED = 1 << 3, // 8
    DISPATCH = 1 << 4, // 16
    GET_INSTANCE_ID = 1 << 5, // 32
    SET_ACTIVITY = 1 << 6, // 64
    GET_CHANNEL_ID = 1 << 7, // 128
    GET_GUILD_ID = 1 << 8, // 256
    GET_USER = 1 << 9, // 512
    GET_USER_ID = 1 << 10, // 1024
    GET_INSTANCE_PARTICIPANTS = 1 << 11, // 2048
    HARDWARE_ACCELERATION = 1 << 12, // 4096
    GET_CHANNEL = 1 << 13, // 8192
    GET_CHANNEL_PERMISSIONS = 1 << 14, // 16384
    GET_ENTITLEMENTS = 1 << 15, // 32768
    GET_PLATFORM_BEHAVIORS = 1 << 16, // 65536
    GET_SKUS = 1 << 17, // 131072
    IMAGE_UPLOAD = 1 << 18, // 262144
    EXTERNAL_LINK = 1 << 19, // 524288
    INVITE_DIALOG = 1 << 20, // 1048576
    SHARE_MOMENT_DIALOG = 1 << 21, // 2097152
    SET_ORIENTATION_LOCK_STATE = 1 << 22, // 4194304
    START_PURCHASE = 1 << 23, // 8388608
    GET_LOCALE = 1 << 24, // 16777216
    SET_CONFIG = 1 << 25, // 33554432
}



//  Combined JSFFI

export interface JSFFI_Message<TPlayload = any> {
	state?: JavaScriptListenerState;
	type: JavaScriptMessageType;
	timestamp?: number; // ULID usually contains the timestamp.
	payload: TPlayload;
}

export interface JSFFI_AuthMessage
	extends JSFFI_Message<{
		user: CompatibleUser;
		accessToken: string;
	}> {
	type: JavaScriptMessageType.Authentication;
}

export interface JSFFI_EventMessage
	extends JSFFI_Message<{
		event: DiscordSDKEvents;
		data: any;
	}> {
	type: JavaScriptMessageType.Event;
}

export interface JSFFI_ErrorMessage
	extends JSFFI_Message<{
		errorCode: string;
		errorMessage: string;
		details?: string;
	}> {
	type: JavaScriptMessageType.Error;
}

export interface JSFFI_CommandMessage
	extends JSFFI_Message<{
		command: MessageChildCommand | MessageParentCommand;
		args: any;
	}> {
	type: JavaScriptMessageType.Command;
}

export interface JSFFI_NotificationMessage
	extends JSFFI_Message<{
		title: string;
		message: string;
		level: 'info' | 'warning' | 'error';
	}> {
	type: JavaScriptMessageType.Notification;
}

// Combined Type
export type JSFFI_MessageVariants =
	| JSFFI_AuthMessage
	| JSFFI_EventMessage
	| JSFFI_ErrorMessage
	| JSFFI_CommandMessage
	| JSFFI_NotificationMessage;
