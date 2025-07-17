/**
 * Bitcraft Module - Singleton Instance
 * 
 * This module provides a unified interface for all Bitcraft calculator functionality.
 * Use this singleton instance to access all services, components, and utilities.
 */

import { BitcraftCalculatorService, bitcraftService, BitcraftService } from './BitcraftCalculatorService';
import { DEFAULT_BITCRAFT_TASK, BITCRAFT_PRESETS, calculateDefaultTask } from './BitcraftCalculatorService';
import { PROFESSION_COLORS, PROFESSION_ICONS, DEFAULT_PROFESSION_SETTINGS } from './bitcraftTypes';
import { professionProgressStore, selectedProfessionStore, currentProfessionProgress, professionActions, useProfessionProgress, useSelectedProfession, useCurrentProfessionProgress } from './professionStore';
import ReactBitcraft from './ReactBitcraft';

// Singleton instance for the Bitcraft module
class BitcraftModule {
  private static instance: BitcraftModule;

  private constructor() {}

  public static getInstance(): BitcraftModule {
    if (!BitcraftModule.instance) {
      BitcraftModule.instance = new BitcraftModule();
    }
    return BitcraftModule.instance;
  }

  // Core service and calculator
  public service = {
    BitcraftCalculatorService,
    bitcraftService,
    BitcraftService,
    DEFAULT_BITCRAFT_TASK,
    BITCRAFT_PRESETS,
    calculateDefaultTask
  };

  // Types and interfaces
  public types = {
    BitcraftProfession: {} as import('./bitcraftTypes').BitcraftProfession,
    ProfessionProgress: {} as import('./bitcraftTypes').ProfessionProgress,
    ProfessionState: {} as import('./bitcraftTypes').ProfessionState,
    BitcraftFormData: {} as import('./bitcraftTypes').BitcraftFormData,
    EffortCalculation: {} as import('./BitcraftCalculatorService').EffortCalculation,
    BitcraftTaskConfig: {} as import('./BitcraftCalculatorService').BitcraftTaskConfig
  };

  // Constants and configuration
  public constants = {
    PROFESSION_COLORS,
    PROFESSION_ICONS,
    DEFAULT_PROFESSION_SETTINGS
  };

  // Stores and state management
  public stores = {
    professionProgressStore,
    selectedProfessionStore,
    currentProfessionProgress,
    professionActions,
    useProfessionProgress,
    useSelectedProfession,
    useCurrentProfessionProgress
  };

  // React components
  public components = {
    Calculator: ReactBitcraft,
  };

  // Quick start utilities
  public utils = {
    initProfession: (profession: import('./bitcraftTypes').BitcraftProfession, settings?: Partial<import('./bitcraftTypes').ProfessionProgress>) => {
      if (settings) {
        professionActions.updateProfession(profession, settings);
      }
    },
    resetAll: () => {
      professionActions.resetAllProfessions();
    },
    calculate: (totalEffort: number, effortPerTick: number, timePerTick: number, currentProgress = 0) => {
      return BitcraftCalculatorService.getInstance().calculateEffort({
        totalEffort,
        effortPerTick,
        timePerTick,
        currentProgress
      });
    }
  };
}

// Export the singleton instance
export default BitcraftModule.getInstance();
