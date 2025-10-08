import { atom, computed } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import type { User } from '@supabase/supabase-js';
import { supabase, userClientService } from '@kbve/astropad';

export interface HolyCardProps {
  backgroundImage: string;
  title: string;
  description: string;
  buttonName: string;
  link: string;
}

export interface HolyCardState {
  isHovered: boolean;
  isLoading: boolean;
  hasError: boolean;
}

// Card instance data structure
interface HolyCardInstance {
  props: HolyCardProps | null;
  state: HolyCardState;
  stateAtom: ReturnType<typeof atom<HolyCardState>>;
  propsAtom: ReturnType<typeof atom<HolyCardProps | null>>;
  readyComputed: ReturnType<typeof computed>;
}

// Global registry of card instances
const cardInstances = new Map<string, HolyCardInstance>();

export const holyCardService = {
  // Initialize a new card instance
  initCard: (cardId: string, initialProps?: HolyCardProps) => {
    if (cardInstances.has(cardId)) {
      return cardInstances.get(cardId)!;
    }

    const stateAtom = atom<HolyCardState>({
      isHovered: false,
      isLoading: false,
      hasError: false,
    });

    const propsAtom = atom<HolyCardProps | null>(initialProps || null);

    const readyComputed = computed(
      [propsAtom, stateAtom],
      (props, state) => props !== null && !state.isLoading && !state.hasError
    );

    const instance: HolyCardInstance = {
      props: initialProps || null,
      state: stateAtom.get(),
      stateAtom,
      propsAtom,
      readyComputed,
    };

    cardInstances.set(cardId, instance);
    return instance;
  },

  // Get card instance
  getCard: (cardId: string) => {
    return cardInstances.get(cardId) || null;
  },

  // Set props for specific card
  setProps: (cardId: string, props: HolyCardProps) => {
    const instance = cardInstances.get(cardId);
    if (instance) {
      instance.propsAtom.set(props);
      instance.props = props;
    }
  },

  // Set hover state for specific card
  setHovered: (cardId: string, hovered: boolean) => {
    const instance = cardInstances.get(cardId);
    if (instance) {
      const currentState = instance.stateAtom.get();
      const newState = { ...currentState, isHovered: hovered };
      instance.stateAtom.set(newState);
      instance.state = newState;
    }
  },

  // Set loading state for specific card
  setLoading: (cardId: string, loading: boolean) => {
    const instance = cardInstances.get(cardId);
    if (instance) {
      const currentState = instance.stateAtom.get();
      const newState = { ...currentState, isLoading: loading };
      instance.stateAtom.set(newState);
      instance.state = newState;
    }
  },

  // Set error state for specific card
  setError: (cardId: string, error: boolean) => {
    const instance = cardInstances.get(cardId);
    if (instance) {
      const currentState = instance.stateAtom.get();
      const newState = { ...currentState, hasError: error };
      instance.stateAtom.set(newState);
      instance.state = newState;
    }
  },

  // Handle click for specific card
  handleCardClick: (cardId: string) => {
    const instance = cardInstances.get(cardId);
    if (instance?.props?.link) {
      window.open(instance.props.link, '_blank', 'noopener,noreferrer');
    }
  },

  // Reset specific card
  reset: (cardId: string) => {
    const instance = cardInstances.get(cardId);
    if (instance) {
      instance.stateAtom.set({
        isHovered: false,
        isLoading: false,
        hasError: false,
      });
      instance.propsAtom.set(null);
      instance.props = null;
      instance.state = instance.stateAtom.get();
    }
  },

  // Cleanup card instance
  destroyCard: (cardId: string) => {
    cardInstances.delete(cardId);
  },

  // Get all card IDs (useful for debugging)
  getAllCardIds: () => {
    return Array.from(cardInstances.keys());
  },
};
