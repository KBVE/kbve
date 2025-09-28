/**
 * Bitcraft Profession Stores
 * Persistent nanostores for managing Bitcraft profession progress
 */

import { computed } from 'nanostores';
import { persistentMap } from '@nanostores/persistent';
import { useStore } from '@nanostores/react';
import type { 
  BitcraftProfession, 
  ProfessionProgress, 
  ProfessionState 
} from './bitcraftTypes';
import { DEFAULT_PROFESSION_SETTINGS } from './bitcraftTypes';

// Create a persistent store for profession progress
export const professionProgressStore = persistentMap<ProfessionState>(
  'bitcraft-professions:',
  {
    Carpentry: {
      profession: 'Carpentry',
      ...DEFAULT_PROFESSION_SETTINGS.Carpentry,
      lastUpdated: new Date()
    },
    Farming: {
      profession: 'Farming',
      ...DEFAULT_PROFESSION_SETTINGS.Farming,
      lastUpdated: new Date()
    },
    Fishing: {
      profession: 'Fishing',
      ...DEFAULT_PROFESSION_SETTINGS.Fishing,
      lastUpdated: new Date()
    },
    Foraging: {
      profession: 'Foraging',
      ...DEFAULT_PROFESSION_SETTINGS.Foraging,
      lastUpdated: new Date()
    },
    Forestry: {
      profession: 'Forestry',
      ...DEFAULT_PROFESSION_SETTINGS.Forestry,
      lastUpdated: new Date()
    },
    Hunting: {
      profession: 'Hunting',
      ...DEFAULT_PROFESSION_SETTINGS.Hunting,
      lastUpdated: new Date()
    },
    Leatherworking: {
      profession: 'Leatherworking',
      ...DEFAULT_PROFESSION_SETTINGS.Leatherworking,
      lastUpdated: new Date()
    },
    Masonry: {
      profession: 'Masonry',
      ...DEFAULT_PROFESSION_SETTINGS.Masonry,
      lastUpdated: new Date()
    },
    Mining: {
      profession: 'Mining',
      ...DEFAULT_PROFESSION_SETTINGS.Mining,
      lastUpdated: new Date()
    },
    Scholar: {
      profession: 'Scholar',
      ...DEFAULT_PROFESSION_SETTINGS.Scholar,
      lastUpdated: new Date()
    },
    Smithing: {
      profession: 'Smithing',
      ...DEFAULT_PROFESSION_SETTINGS.Smithing,
      lastUpdated: new Date()
    },
    Tailoring: {
      profession: 'Tailoring',
      ...DEFAULT_PROFESSION_SETTINGS.Tailoring,
      lastUpdated: new Date()
    }
  }
);

// Store for currently selected profession
export const selectedProfessionStore = persistentMap<{profession: BitcraftProfession}>(
  'bitcraft-selected-profession:', 
  { profession: 'Carpentry' }
);

// Computed store for the current profession's progress
export const currentProfessionProgress = computed(
  [professionProgressStore, selectedProfessionStore],
  (professions, selected) => professions[selected.profession]
);

// Actions for updating profession progress
export const professionActions = {
  updateProfession: (profession: BitcraftProfession, updates: Partial<ProfessionProgress>) => {
    const current = professionProgressStore.get();
    professionProgressStore.set({
      ...current,
      [profession]: {
        ...current[profession],
        ...updates,
        lastUpdated: new Date()
      }
    });
  },

  updateCurrentEffort: (profession: BitcraftProfession, currentEffort: number) => {
    professionActions.updateProfession(profession, { currentEffort });
  },

  resetProfession: (profession: BitcraftProfession) => {
    professionActions.updateProfession(profession, {
      currentEffort: 0,
      ...DEFAULT_PROFESSION_SETTINGS[profession]
    });
  },

  selectProfession: (profession: BitcraftProfession) => {
    selectedProfessionStore.set({ profession });
  },

  resetAllProfessions: () => {
    const resetState: ProfessionState = {} as ProfessionState;
    Object.keys(DEFAULT_PROFESSION_SETTINGS).forEach(prof => {
      const profession = prof as BitcraftProfession;
      resetState[profession] = {
        profession,
        ...DEFAULT_PROFESSION_SETTINGS[profession],
        lastUpdated: new Date()
      };
    });
    professionProgressStore.set(resetState);
  }
};

// Export typed hooks for easier usage in React components
export const useProfessionProgress = () => useStore(professionProgressStore);
export const useSelectedProfession = () => useStore(selectedProfessionStore);
export const useCurrentProfessionProgress = () => useStore(currentProfessionProgress);
