/**
 * Global Event Bus for Navigation System
 * 
 * This extends the document event system to provide a clean, type-safe API
 * for navigation interactions across the entire application.
 */

// Navigation Event Types
export interface NavigationEvents {
  'nav:show-offcanvas': { type: 'navigation' | 'profile'; data?: any };
  'nav:close-offcanvas': { reason?: 'user' | 'outside-click' | 'route-change' };
  'nav:auth-changed': { isAuthenticated: boolean; user: any | null };
  'nav:content-revealed': { timestamp: number };
  'nav:route-changed': { path: string; previousPath?: string };
}

// Realtime Event Types
export interface RealtimeEvents {
  'realtime:channel-connected': { topic: string; timestamp: number };
  'realtime:channel-disconnected': { topic: string; reason?: string; timestamp: number };
  'realtime:message-received': { topic: string; payload: any; timestamp: number };
  'realtime:message-sent': { topic: string; payload: any; response: string; timestamp: number };
  'realtime:presence-updated': { topic: string; presenceData: any; timestamp: number };
  'realtime:user-joined': { topic: string; key: string; newPresences: any; timestamp: number };
  'realtime:user-left': { topic: string; key: string; leftPresences: any; timestamp: number };
  'realtime:connection-error': { topic: string; error: string; timestamp: number };
  'realtime:all-disconnected': { channelCount: number; timestamp: number };
}

// Combined Event Types
export interface AllEvents extends NavigationEvents, RealtimeEvents {}

export type AllEventType = keyof AllEvents;
export type AllEventData<T extends AllEventType> = AllEvents[T];

export type NavigationEventType = keyof NavigationEvents;
export type NavigationEventData<T extends NavigationEventType> = NavigationEvents[T];

export type RealtimeEventType = keyof RealtimeEvents;
export type RealtimeEventData<T extends RealtimeEventType> = RealtimeEvents[T];

class EventBus {
  private static instance: EventBus;
  private eventTarget: EventTarget;

  private constructor() {
    // Use document as the event target for global scope
    this.eventTarget = document;
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Emit any event (navigation or realtime)
   */
  public emit<T extends AllEventType>(
    eventType: T, 
    data: AllEventData<T>
  ): void {
    const event = new CustomEvent(eventType, {
      detail: data,
      bubbles: true,
      cancelable: true
    });
    
    console.log(`📡 EventBus: Emitting ${eventType}`, data);
    this.eventTarget.dispatchEvent(event);
  }

  /**
   * Listen to any event (navigation or realtime)
   */
  public on<T extends AllEventType>(
    eventType: T,
    listener: (data: AllEventData<T>) => void,
    options?: AddEventListenerOptions
  ): () => void {
    const eventListener = (event: Event) => {
      const customEvent = event as CustomEvent<AllEventData<T>>;
      listener(customEvent.detail);
    };

    this.eventTarget.addEventListener(eventType, eventListener, options);
    
    // Return cleanup function
    return () => {
      this.eventTarget.removeEventListener(eventType, eventListener);
    };
  }

  /**
   * Listen to an event only once
   */
  public once<T extends AllEventType>(
    eventType: T,
    listener: (data: AllEventData<T>) => void
  ): () => void {
    return this.on(eventType, listener, { once: true });
  }

  /**
   * Remove all listeners for a specific event type
   */
  public off(eventType: AllEventType): void {
    // Create a new event to clear all listeners for this type
    const event = new CustomEvent('clear-listeners', { detail: { eventType } });
    this.eventTarget.dispatchEvent(event);
  }

  /**
   * Convenience methods for common navigation events
   */
  public showOffCanvas(type: 'navigation' | 'profile', data?: any): void {
    // Store current scroll position and lock scroll
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    
    this.emit('nav:show-offcanvas', { type, data });
  }

  public closeOffCanvas(reason?: 'user' | 'outside-click' | 'route-change'): void {
    // Restore scroll position and unlock scroll
    const scrollY = document.body.style.top;
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    
    if (scrollY) {
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
    
    this.emit('nav:close-offcanvas', { reason });
  }

  public authChanged(isAuthenticated: boolean, user: any | null): void {
    this.emit('nav:auth-changed', { isAuthenticated, user });
  }

  public contentRevealed(): void {
    this.emit('nav:content-revealed', { timestamp: Date.now() });
  }

  public routeChanged(path: string, previousPath?: string): void {
    this.emit('nav:route-changed', { path, previousPath });
  }

  /**
   * Convenience methods for realtime events
   */
  public channelConnected(topic: string): void {
    this.emit('realtime:channel-connected', { topic, timestamp: Date.now() });
  }

  public channelDisconnected(topic: string, reason?: string): void {
    this.emit('realtime:channel-disconnected', { topic, reason, timestamp: Date.now() });
  }

  public messageReceived(topic: string, payload: any): void {
    this.emit('realtime:message-received', { topic, payload, timestamp: Date.now() });
  }

  public messageSent(topic: string, payload: any, response: string): void {
    this.emit('realtime:message-sent', { topic, payload, response, timestamp: Date.now() });
  }

  public presenceUpdated(topic: string, presenceData: any): void {
    this.emit('realtime:presence-updated', { topic, presenceData, timestamp: Date.now() });
  }

  public userJoined(topic: string, key: string, newPresences: any): void {
    this.emit('realtime:user-joined', { topic, key, newPresences, timestamp: Date.now() });
  }

  public userLeft(topic: string, key: string, leftPresences: any): void {
    this.emit('realtime:user-left', { topic, key, leftPresences, timestamp: Date.now() });
  }

  public connectionError(topic: string, error: string): void {
    this.emit('realtime:connection-error', { topic, error, timestamp: Date.now() });
  }

  public allDisconnected(channelCount: number): void {
    this.emit('realtime:all-disconnected', { channelCount, timestamp: Date.now() });
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();

// Export convenience hooks for React components
export const useNavigationEvents = () => {
  return {
    showOffCanvas: eventBus.showOffCanvas.bind(eventBus),
    closeOffCanvas: eventBus.closeOffCanvas.bind(eventBus),
    authChanged: eventBus.authChanged.bind(eventBus),
    contentRevealed: eventBus.contentRevealed.bind(eventBus),
    routeChanged: eventBus.routeChanged.bind(eventBus),
    on: eventBus.on.bind(eventBus),
    once: eventBus.once.bind(eventBus),
    off: eventBus.off.bind(eventBus)
  };
};

export const useRealtimeEvents = () => {
  return {
    channelConnected: eventBus.channelConnected.bind(eventBus),
    channelDisconnected: eventBus.channelDisconnected.bind(eventBus),
    messageReceived: eventBus.messageReceived.bind(eventBus),
    messageSent: eventBus.messageSent.bind(eventBus),
    presenceUpdated: eventBus.presenceUpdated.bind(eventBus),
    userJoined: eventBus.userJoined.bind(eventBus),
    userLeft: eventBus.userLeft.bind(eventBus),
    connectionError: eventBus.connectionError.bind(eventBus),
    allDisconnected: eventBus.allDisconnected.bind(eventBus),
    on: eventBus.on.bind(eventBus),
    once: eventBus.once.bind(eventBus),
    off: eventBus.off.bind(eventBus)
  };
};

export const useEventBus = () => {
  return {
    // Navigation methods
    showOffCanvas: eventBus.showOffCanvas.bind(eventBus),
    closeOffCanvas: eventBus.closeOffCanvas.bind(eventBus),
    authChanged: eventBus.authChanged.bind(eventBus),
    contentRevealed: eventBus.contentRevealed.bind(eventBus),
    routeChanged: eventBus.routeChanged.bind(eventBus),
    
    // Realtime methods
    channelConnected: eventBus.channelConnected.bind(eventBus),
    channelDisconnected: eventBus.channelDisconnected.bind(eventBus),
    messageReceived: eventBus.messageReceived.bind(eventBus),
    messageSent: eventBus.messageSent.bind(eventBus),
    presenceUpdated: eventBus.presenceUpdated.bind(eventBus),
    userJoined: eventBus.userJoined.bind(eventBus),
    userLeft: eventBus.userLeft.bind(eventBus),
    connectionError: eventBus.connectionError.bind(eventBus),
    allDisconnected: eventBus.allDisconnected.bind(eventBus),
    
    // Core methods
    emit: eventBus.emit.bind(eventBus),
    on: eventBus.on.bind(eventBus),
    once: eventBus.once.bind(eventBus),
    off: eventBus.off.bind(eventBus)
  };
};

// Types are already exported above