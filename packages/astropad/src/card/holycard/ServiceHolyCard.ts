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

export const holyCardState = atom<HolyCardState>({
  isHovered: false,
  isLoading: false,
  hasError: false,
});

export const holyCardProps = atom<HolyCardProps | null>(null);

export const isCardReady = computed(
  [holyCardProps, holyCardState],
  (props, state) => props !== null && !state.isLoading && !state.hasError
);

export const holyCardService = {
  setProps: (props: HolyCardProps) => {
    holyCardProps.set(props);
  },

  setHovered: (hovered: boolean) => {
    holyCardState.set({
      ...holyCardState.get(),
      isHovered: hovered,
    });
  },

  setLoading: (loading: boolean) => {
    holyCardState.set({
      ...holyCardState.get(),
      isLoading: loading,
    });
  },

  setError: (error: boolean) => {
    holyCardState.set({
      ...holyCardState.get(),
      hasError: error,
    });
  },

  handleCardClick: () => {
    const props = holyCardProps.get();
    if (props?.link) {
      window.open(props.link, '_blank', 'noopener,noreferrer');
    }
  },

  reset: () => {
    holyCardState.set({
      isHovered: false,
      isLoading: false,
      hasError: false,
    });
    holyCardProps.set(null);
  },
};
