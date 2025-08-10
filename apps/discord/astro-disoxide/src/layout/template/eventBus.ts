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

export type NavigationEventType = keyof NavigationEvents;
export type NavigationEventData<T extends NavigationEventType> = NavigationEvents[T];

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
   * Emit a navigation event
   */
  public emit<T extends NavigationEventType>(
    eventType: T, 
    data: NavigationEventData<T>
  ): void {
    const event = new CustomEvent(eventType, {
      detail: data,
      bubbles: true,
      cancelable: true
    });
    
    console.log(`=� EventBus: Emitting ${eventType}`, data);
    this.eventTarget.dispatchEvent(event);
  }

  /**
   * Listen to a navigation event
   */
  public on<T extends NavigationEventType>(
    eventType: T,
    listener: (data: NavigationEventData<T>) => void,
    options?: AddEventListenerOptions
  ): () => void {
    const eventListener = (event: Event) => {
      const customEvent = event as CustomEvent<NavigationEventData<T>>;
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
  public once<T extends NavigationEventType>(
    eventType: T,
    listener: (data: NavigationEventData<T>) => void
  ): () => void {
    return this.on(eventType, listener, { once: true });
  }

  /**
   * Remove all listeners for a specific event type
   */
  public off(eventType: NavigationEventType): void {
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

// Types are already exported above