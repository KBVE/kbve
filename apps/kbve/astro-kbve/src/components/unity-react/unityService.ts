/**
 * Unity Service - Singleton
 * Manages Unity WebGL communication with Supabase and event handling
 * Works with react-unity-webgl library and WebGLBridge.jslib
 */

import type {
	UnityEvent,
	WebToUnityMessage,
	SupabasePayload,
	PlayerData,
	GameState,
	UnityArrayDataEvent,
	UnityMessageEvent,
	UnityErrorEvent,
	SessionData,
} from './typeUnity';
import { UnityEventType } from './typeUnity';
import { getSupa } from '@/lib/supa';

/**
 * Unity Context interface from react-unity-webgl
 */
interface UnityContext {
	sendMessage: (
		gameObjectName: string,
		methodName: string,
		parameter?: string | number,
	) => void;
	requestFullscreen: (fullscreen: boolean) => void;
	unload: () => Promise<void>;
}

/**
 * Binary data handler callback
 */
type ArrayDataHandler = (event: UnityArrayDataEvent) => void;

/**
 * UnityService - Singleton class for managing Unity WebGL integration
 */
class UnityService {
	private static instance: UnityService | null = null;
	private unityContext: UnityContext | null = null;
	private eventHandlers: Map<string, Set<(event: UnityEvent) => void>> =
		new Map();
	private arrayDataHandlers: Map<string, Set<ArrayDataHandler>> = new Map();
	private windowListenersInitialized = false;

	// Private constructor to enforce singleton pattern
	private constructor() {
		// Initialize window event listeners for WebGLBridge.jslib
		this.initializeWindowListeners();
	}

	/**
	 * Get singleton instance
	 */
	public static getInstance(): UnityService {
		if (!UnityService.instance) {
			UnityService.instance = new UnityService();
		}
		return UnityService.instance;
	}

	/**
	 * Set Unity context from react-unity-webgl hook
	 */
	public setUnityContext(context: UnityContext): void {
		this.unityContext = context;
	}

	/**
	 * Initialize window event listeners for WebGLBridge.jslib custom events
	 * These listen for CustomEvent dispatched by the .jslib plugin
	 */
	private initializeWindowListeners(): void {
		if (this.windowListenersInitialized || typeof window === 'undefined') {
			return;
		}

		// Listen for UnityMessage events (JSON messages from Unity)
		window.addEventListener('UnityMessage', ((
			event: CustomEvent<UnityMessageEvent>,
		) => {
			const { type, data, timestamp } = event.detail;
			console.log('[UnityService] Received UnityMessage:', type, data);

			this.emit({
				type: type,
				data: data,
				timestamp: new Date(timestamp).getTime(),
			});
		}) as EventListener);

		// Listen for UnityArrayData events (typed arrays from Unity)
		window.addEventListener('UnityArrayData', ((
			event: CustomEvent<UnityArrayDataEvent>,
		) => {
			const arrayEvent = event.detail;
			console.log(
				'[UnityService] Received UnityArrayData:',
				arrayEvent.type,
				arrayEvent.dataType,
				arrayEvent.length,
			);

			// Emit to array data handlers
			const handlers = this.arrayDataHandlers.get(arrayEvent.type);
			if (handlers) {
				handlers.forEach((handler) => {
					try {
						handler(arrayEvent);
					} catch (error) {
						console.error(
							`Error in array data handler for ${arrayEvent.type}:`,
							error,
						);
					}
				});
			}

			// Also emit as regular event for convenience
			this.emit({
				type: arrayEvent.type,
				data: arrayEvent,
				timestamp: new Date(arrayEvent.timestamp).getTime(),
			});
		}) as EventListener);

		// Listen for UnityError events
		window.addEventListener('UnityError', ((
			event: CustomEvent<UnityErrorEvent>,
		) => {
			const { message, timestamp } = event.detail;
			console.error('[UnityService] Unity Error:', message);

			this.emit({
				type: UnityEventType.ERROR,
				data: new Error(message),
				timestamp: new Date(timestamp).getTime(),
			});
		}) as EventListener);

		this.windowListenersInitialized = true;
		console.log('[UnityService] Window event listeners initialized');
	}

	/**
	 * Subscribe to typed array data from Unity
	 */
	public onArrayData(
		eventType: string,
		handler: ArrayDataHandler,
	): () => void {
		if (!this.arrayDataHandlers.has(eventType)) {
			this.arrayDataHandlers.set(eventType, new Set());
		}
		this.arrayDataHandlers.get(eventType)!.add(handler);

		// Return unsubscribe function
		return () => {
			const handlers = this.arrayDataHandlers.get(eventType);
			if (handlers) {
				handlers.delete(handler);
				if (handlers.size === 0) {
					this.arrayDataHandlers.delete(eventType);
				}
			}
		};
	}

	/**
	 * Send message to Unity
	 */
	public sendToUnity(message: WebToUnityMessage): void {
		if (!this.unityContext) {
			console.warn('Unity context not set. Make sure Unity is loaded.');
			return;
		}

		try {
			this.unityContext.sendMessage(
				message.gameObject,
				message.method,
				message.parameter,
			);
		} catch (error) {
			console.error('Error sending message to Unity:', error);
			this.emit({
				type: UnityEventType.ERROR,
				data: error instanceof Error ? error : new Error(String(error)),
				timestamp: Date.now(),
			});
		}
	}

	/**
	 * Subscribe to Unity events
	 */
	public on(
		eventType: string | UnityEventType,
		handler: (event: UnityEvent) => void,
	): () => void {
		if (!this.eventHandlers.has(eventType)) {
			this.eventHandlers.set(eventType, new Set());
		}
		this.eventHandlers.get(eventType)!.add(handler);

		// Return unsubscribe function
		return () => {
			const handlers = this.eventHandlers.get(eventType);
			if (handlers) {
				handlers.delete(handler);
				if (handlers.size === 0) {
					this.eventHandlers.delete(eventType);
				}
			}
		};
	}

	/**
	 * Emit event to all subscribers
	 */
	public emit(event: UnityEvent): void {
		// Emit to specific event type handlers
		const handlers = this.eventHandlers.get(event.type);
		if (handlers) {
			handlers.forEach((handler) => {
				try {
					handler(event);
				} catch (error) {
					console.error(
						`Error in event handler for ${event.type}:`,
						error,
					);
				}
			});
		}

		// Emit to wildcard handlers
		const wildcardHandlers = this.eventHandlers.get('*');
		if (wildcardHandlers) {
			wildcardHandlers.forEach((handler) => {
				try {
					handler(event);
				} catch (error) {
					console.error('Error in wildcard event handler:', error);
				}
			});
		}
	}

	/**
	 * Save data to Supabase
	 */
	public async saveToSupabase(payload: SupabasePayload): Promise<any> {
		try {
			const supa = getSupa();
			// Use the SharedWorker's upsert method instead of accessing .client directly
			const data = await supa.upsert(payload.table, payload.data);

			// Notify Unity that save was successful
			this.sendToUnity({
				gameObject: 'WebGLBridge',
				method: 'OnDataSaved',
				parameter: JSON.stringify({ success: true, data }),
			});

			return data;
		} catch (error) {
			console.error('Error saving to Supabase:', error);

			// Notify Unity that save failed
			this.sendToUnity({
				gameObject: 'WebGLBridge',
				method: 'OnDataSaved',
				parameter: JSON.stringify({
					success: false,
					error: String(error),
				}),
			});

			throw error;
		}
	}

	/**
	 * Load data from Supabase
	 */
	public async loadFromSupabase(
		table: string,
		filters?: Record<string, any>,
	): Promise<any> {
		try {
			const supa = getSupa();
			// Use the SharedWorker's select method with filters as match parameter
			const data = await supa.select(table, {
				columns: '*',
				match: filters,
			});

			// Notify Unity with loaded data
			this.sendToUnity({
				gameObject: 'WebGLBridge',
				method: 'OnDataLoaded',
				parameter: JSON.stringify({ success: true, data }),
			});

			return data;
		} catch (error) {
			console.error('Error loading from Supabase:', error);

			// Notify Unity that load failed
			this.sendToUnity({
				gameObject: 'WebGLBridge',
				method: 'OnDataLoaded',
				parameter: JSON.stringify({
					success: false,
					error: String(error),
				}),
			});

			throw error;
		}
	}

	/**
	 * Save player data
	 */
	public async savePlayerData(playerData: PlayerData): Promise<void> {
		await this.saveToSupabase({
			action: 'save',
			table: 'player_data',
			data: playerData as unknown as Record<string, unknown>,
			userId: playerData.id,
		});
	}

	/**
	 * Save game state
	 */
	public async saveGameState(
		gameState: GameState,
		userId: string,
	): Promise<void> {
		await this.saveToSupabase({
			action: 'save',
			table: 'game_states',
			data: {
				...gameState,
				user_id: userId,
				updated_at: new Date().toISOString(),
			},
			userId,
		});
	}

	/**
	 * Set fullscreen mode
	 */
	public setFullscreen(fullscreen: boolean): void {
		if (this.unityContext) {
			this.unityContext.requestFullscreen(fullscreen);
		}
	}

	/**
	 * Unload Unity instance
	 */
	public async unload(): Promise<void> {
		if (this.unityContext) {
			await this.unityContext.unload();
			this.unityContext = null;
		}
	}

	/**
	 * Check if Unity context is set
	 */
	public isReady(): boolean {
		return this.unityContext !== null;
	}

	/**
	 * Send session data to Unity
	 */
	public sendSessionData(sessionData: SessionData): void {
		this.sendToUnity({
			gameObject: 'WebGLBridge',
			method: 'OnSessionUpdate',
			parameter: JSON.stringify(sessionData),
		});
	}

	/**
	 * Send a command to Unity
	 */
	public sendCommand(
		command: string,
		args: string[] = [],
		userId: string = '',
	): void {
		this.sendToUnity({
			gameObject: 'WebGLBridge',
			method: 'OnMessage',
			parameter: JSON.stringify({
				type: command,
				payload: JSON.stringify({ command, args, userId }),
			}),
		});
	}

	/**
	 * Send binary data to Unity (as base64)
	 */
	public sendBinaryData(data: Uint8Array | ArrayBuffer): void {
		const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
		const base64 = btoa(String.fromCharCode(...bytes));

		this.sendToUnity({
			gameObject: 'WebGLBridge',
			method: 'OnBinaryData',
			parameter: base64,
		});
	}

	/**
	 * Send array data to Unity (as JSON)
	 */
	public sendArrayData(data: number[]): void {
		this.sendToUnity({
			gameObject: 'WebGLBridge',
			method: 'OnArrayData',
			parameter: JSON.stringify({ data }),
		});
	}

	/**
	 * Send Float32Array to Unity
	 */
	public sendFloat32Array(data: Float32Array): void {
		// Convert to regular array for JSON serialization
		this.sendArrayData(Array.from(data));
	}

	/**
	 * Send generic message to Unity
	 */
	public sendMessage(
		gameObject: string,
		method: string,
		parameter?: string | number,
	): void {
		this.sendToUnity({ gameObject, method, parameter });
	}

	/**
	 * Request data load from Unity/Supabase
	 */
	public requestDataLoad(table: string, filters?: string): void {
		this.sendToUnity({
			gameObject: 'WebGLBridge',
			method: 'OnMessage',
			parameter: JSON.stringify({
				type: 'DataLoadRequest',
				payload: JSON.stringify({ table, filters }),
			}),
		});
	}
}

// Export singleton instance
export const unityService = UnityService.getInstance();

/**
 * Helper functions for common operations
 */

/**
 * Convert typed array to base64 string
 */
export function typedArrayToBase64(
	array: Float32Array | Int32Array | Uint8Array,
): string {
	const bytes = new Uint8Array(array.buffer);
	return btoa(String.fromCharCode(...bytes));
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToUint8Array(base64: string): Uint8Array {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes;
}

/**
 * Convert base64 string to Float32Array
 */
export function base64ToFloat32Array(base64: string): Float32Array {
	const bytes = base64ToUint8Array(base64);
	return new Float32Array(bytes.buffer);
}

/**
 * Convert base64 string to Int32Array
 */
export function base64ToInt32Array(base64: string): Int32Array {
	const bytes = base64ToUint8Array(base64);
	return new Int32Array(bytes.buffer);
}
