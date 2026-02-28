import { atom } from 'nanostores';

// Event data structure
export interface AppEvent {
	id: string;
	type: string;
	source: string;
	data?: any;
	timestamp: number;
}

// Event listener function type
export type EventListener = (event: AppEvent) => void;

// Event engine class
class EventEngine {
	private listeners: Map<string, EventListener[]> = new Map();
	private eventHistory = atom<AppEvent[]>([]);
	private maxHistorySize = 100;

	// Emit an event
	emit(type: string, source: string, data?: any): void {
		const event: AppEvent = {
			id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
			type,
			source,
			data,
			timestamp: Date.now(),
		};

		// Add to history
		const currentHistory = this.eventHistory.get();
		const newHistory = [event, ...currentHistory].slice(
			0,
			this.maxHistorySize,
		);
		this.eventHistory.set(newHistory);

		// Emit to listeners
		const typeListeners = this.listeners.get(type) || [];
		const allListeners = this.listeners.get('*') || [];

		[...typeListeners, ...allListeners].forEach((listener) => {
			try {
				listener(event);
			} catch (error) {
				console.error(`Error in event listener for ${type}:`, error);
			}
		});

		// Also emit to console for debugging
		console.log(`[EventEngine] ${type}:`, { source, data });
	}

	// Add event listener
	on(type: string, listener: EventListener): () => void {
		if (!this.listeners.has(type)) {
			this.listeners.set(type, []);
		}
		this.listeners.get(type)!.push(listener);

		// Return cleanup function
		return () => {
			const listeners = this.listeners.get(type);
			if (listeners) {
				const index = listeners.indexOf(listener);
				if (index > -1) {
					listeners.splice(index, 1);
				}
			}
		};
	}

	// Remove specific listener or all listeners for a type
	off(type: string, listener?: EventListener): void {
		if (!listener) {
			// Remove all listeners for the type
			this.listeners.delete(type);
		} else {
			// Remove specific listener
			const listeners = this.listeners.get(type);
			if (listeners) {
				const index = listeners.indexOf(listener);
				if (index > -1) {
					listeners.splice(index, 1);
					// If no listeners left, remove the type entry
					if (listeners.length === 0) {
						this.listeners.delete(type);
					}
				}
			}
		}
	}

	// Get event history (reactive)
	getHistory() {
		return this.eventHistory;
	}

	// Get recent events of a specific type
	getRecentEvents(type: string, limit = 10): AppEvent[] {
		return this.eventHistory
			.get()
			.filter((event) => event.type === type)
			.slice(0, limit);
	}

	// Clear event history
	clearHistory(): void {
		this.eventHistory.set([]);
	}

	// Get all active listener types
	getActiveTypes(): string[] {
		return Array.from(this.listeners.keys());
	}

	// Get listener count for a type
	getListenerCount(type: string): number {
		return this.listeners.get(type)?.length || 0;
	}

	// Built-in event types for common actions
	static EventTypes = {
		// Card events
		CARD_HOVER: 'card:hover',
		CARD_CLICK: 'card:click',
		CARD_ICON_CLICK: 'card:icon:click',

		// User actions
		USER_BOOKMARK: 'user:bookmark',
		USER_SHARE: 'user:share',
		USER_FAVORITE: 'user:favorite',
		USER_DOWNLOAD: 'user:download',

		// Navigation
		NAV_ROUTE_CHANGE: 'nav:route:change',
		NAV_MENU_OPEN: 'nav:menu:open',

		// UI interactions
		UI_MODAL_OPEN: 'ui:modal:open',
		UI_MODAL_CLOSE: 'ui:modal:close',
		UI_TOOLTIP_SHOW: 'ui:tooltip:show',

		// API events
		API_REQUEST_START: 'api:request:start',
		API_REQUEST_SUCCESS: 'api:request:success',
		API_REQUEST_ERROR: 'api:request:error',

		// System events
		SYSTEM_READY: 'system:ready',
		SYSTEM_ERROR: 'system:error',
	} as const;
}

// Create singleton instance
export const eventEngine = new EventEngine();

// Attach to window for global access
declare global {
	interface Window {
		eventEngine: EventEngine;
	}
}

// Auto-attach to window when imported
if (typeof window !== 'undefined') {
	window.eventEngine = eventEngine;

	// Emit system ready event
	eventEngine.emit(EventEngine.EventTypes.SYSTEM_READY, 'eventEngine', {
		timestamp: Date.now(),
		userAgent: navigator.userAgent,
	});
}

export default eventEngine;
