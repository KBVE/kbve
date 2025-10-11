/**
 * Service for managing Landing Card state and interactions
 * This service provides state management for the ReactLandingCard component
 * using nanostores for reactive state management.
 */

import { atom, map, type WritableAtom, type MapStore } from 'nanostores';
import { eventEngine } from '@kbve/astropad';

// Landing Card icon action interface
export interface LandingCardIconAction {
  icon: string; // Lucide icon name
  label: string;
  action: string; // Action identifier
  tooltip?: string;
}

// Landing Card state interface
export interface LandingCardState {
  id: string;
  text: string;
  href?: string;
  img?: string;
  description?: string;
  icons?: LandingCardIconAction[];
  isHovered: boolean;
  isExpanded: boolean;
  isLoading: boolean;
  error?: string;
}

// Type for Landing Card configuration (props passed to component)
export interface LandingCardConfig {
  id?: string;
  text: string;
  href?: string;
  img?: string;
  description?: string;
  icons?: LandingCardIconAction[];
}

// Global store for all landing card instances
const landingCardInstances: MapStore<Record<string, LandingCardState>> = map({});

// Counter for generating unique IDs
let cardIdCounter = 0;

/**
 * Service class for managing Landing Card instances
 */
export class ServiceLandingCard {
  private cardId: string;
  private state: WritableAtom<LandingCardState>;

  constructor(config: LandingCardConfig) {
    // Generate unique ID if not provided
    this.cardId = config.id || `landing-card-${++cardIdCounter}`;

    // Initialize state
    const initialState: LandingCardState = {
      id: this.cardId,
      text: config.text,
      href: config.href,
      img: config.img,
      description: config.description,
      icons: config.icons,
      isHovered: false,
      isExpanded: false,
      isLoading: false,
    };

    // Create atom for this specific card instance
    this.state = atom(initialState);

    // Register in global store
    landingCardInstances.setKey(this.cardId, initialState);

    // Sync atom changes to global store
    this.state.subscribe((newState) => {
      landingCardInstances.setKey(this.cardId, newState);
    });
  }

  /**
   * Get the current state of this card
   */
  getState(): LandingCardState {
    return this.state.get();
  }

  /**
   * Get the reactive state atom for this card
   */
  getStateAtom(): WritableAtom<LandingCardState> {
    return this.state;
  }

  /**
   * Update card state
   */
  setState(partialState: Partial<LandingCardState>): void {
    const currentState = this.state.get();
    this.state.set({ ...currentState, ...partialState });
  }

  /**
   * Set hover state
   */
  setHovered(isHovered: boolean): void {
    this.setState({ isHovered });

    // Emit hover event through eventEngine
    if (typeof window !== 'undefined' && window.eventEngine) {
      window.eventEngine.emit('landingcard:hover', this.cardId, { isHovered });
    } else {
      // Fallback for SSR or when eventEngine isn't available
      eventEngine.emit('landingcard:hover', this.cardId, { isHovered });
    }
  }

  /**
   * Toggle expanded state for description
   */
  toggleExpanded(): void {
    const currentState = this.state.get();
    const newExpandedState = !currentState.isExpanded;
    this.setState({ isExpanded: newExpandedState });

    // Emit expanded state change event
    if (typeof window !== 'undefined' && window.eventEngine) {
      window.eventEngine.emit('landingcard:expanded', this.cardId, {
        isExpanded: newExpandedState,
        description: currentState.description
      });
    } else {
      eventEngine.emit('landingcard:expanded', this.cardId, {
        isExpanded: newExpandedState,
        description: currentState.description
      });
    }
  }

  /**
   * Set loading state
   */
  setLoading(isLoading: boolean): void {
    this.setState({ isLoading });
  }

  /**
   * Set error state
   */
  setError(error?: string): void {
    this.setState({ error, isLoading: false });
  }

  /**
   * Update card content
   */
  updateContent(updates: Partial<Pick<LandingCardState, 'text' | 'href' | 'img' | 'description' | 'icons'>>): void {
    this.setState(updates);
  }

  /**
   * Handle icon click
   */
  handleIconClick(iconAction: string, iconData?: any): void {
    // Emit icon click event through eventEngine
    if (typeof window !== 'undefined' && window.eventEngine) {
      window.eventEngine.emit(`landingcard:icon:${iconAction}`, this.cardId, {
        iconAction,
        iconData,
        cardId: this.cardId,
      });
    } else {
      // Fallback for SSR or when eventEngine isn't available
      eventEngine.emit(`landingcard:icon:${iconAction}`, this.cardId, {
        iconAction,
        iconData,
        cardId: this.cardId,
      });
    }
  }

  /**
   * Handle card click
   */
  handleClick(): void {
    const state = this.state.get();

    // Emit click event through eventEngine
    if (typeof window !== 'undefined' && window.eventEngine) {
      window.eventEngine.emit('landingcard:click', this.cardId, {
        href: state.href,
        text: state.text,
        description: state.description
      });
    } else {
      eventEngine.emit('landingcard:click', this.cardId, {
        href: state.href,
        text: state.text,
        description: state.description
      });
    }

    // Navigate if href is provided
    if (state.href) {
      window.location.href = state.href;
    }
  }

  /**
   * Check if description should be truncated
   */
  shouldTruncateDescription(maxLength: number = 120): boolean {
    const state = this.state.get();
    return Boolean(state.description && state.description.length > maxLength);
  }

  /**
   * Get display text for description (truncated or full)
   */
  getDisplayText(maxLength: number = 120): string {
    const state = this.state.get();
    if (!state.description) return '';

    const shouldTruncate = this.shouldTruncateDescription(maxLength);
    if (shouldTruncate && !state.isExpanded) {
      return state.description.substring(0, maxLength) + '...';
    }
    return state.description;
  }

  /**
   * Clean up this card instance
   */
  destroy(): void {
    // Remove from global store
    const instances = landingCardInstances.get();
    const { [this.cardId]: _, ...remaining } = instances;
    landingCardInstances.set(remaining);
  }

  /**
   * Get card ID
   */
  getId(): string {
    return this.cardId;
  }
}

/**
 * Factory function to create a new Landing Card service instance
 */
export function createLandingCardService(config: LandingCardConfig): ServiceLandingCard {
  return new ServiceLandingCard(config);
}

/**
 * Get all landing card instances
 */
export function getAllLandingCardInstances(): MapStore<Record<string, LandingCardState>> {
  return landingCardInstances;
}

/**
 * Get a specific landing card instance by ID
 */
export function getLandingCardInstance(id: string): LandingCardState | undefined {
  return landingCardInstances.get()[id];
}

/**
 * Remove a landing card instance by ID
 */
export function removeLandingCardInstance(id: string): void {
  const instances = landingCardInstances.get();
  const { [id]: _, ...remaining } = instances;
  landingCardInstances.set(remaining);
}