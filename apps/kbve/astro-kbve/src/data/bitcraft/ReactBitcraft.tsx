/** @jsxImportSource react */
import React, { useState, useEffect, useMemo } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  Calculator, 
  Clock, 
  Target, 
  TrendingUp, 
  RotateCcw, 
  Save,
  Play,
  Pause,
  CheckCircle
} from 'lucide-react';
import { useForm, Controller } from "react-hook-form";
import BitcraftModule from './BitcraftModule';
import type { 
  BitcraftProfession, 
  BitcraftFormData,
  ProfessionState
} from './bitcraftTypes';
import type { EffortCalculation } from './BitcraftCalculatorService';

// Utility function for classnames
const cn = (...inputs: any[]) => twMerge(clsx(inputs));

interface ReactBitcraftProps {
  className?: string;
}

export default function ReactBitcraft({ className }: ReactBitcraftProps) {
  const professions = BitcraftModule.stores.useProfessionProgress();
  const selectedProf = BitcraftModule.stores.useSelectedProfession();
  const currentProgress = BitcraftModule.stores.useCurrentProfessionProgress();
  
  const [calculation, setCalculation] = useState<EffortCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // React Hook Form setup
  const { control, handleSubmit, watch, setValue, reset } = useForm<BitcraftFormData>({
    defaultValues: {
      profession: selectedProf.profession,
      totalEffort: currentProgress.totalEffort,
      effortPerTick: currentProgress.effortPerTick,
      timePerTick: currentProgress.timePerTick,
      currentProgress: currentProgress.currentEffort
    }
  });

  // Watch form values for real-time calculations
  const formValues = watch();

  // Update form when profession changes
  useEffect(() => {
    const professionData = (professions as any)[selectedProf.profession];
    if (professionData) {
      setValue('profession', selectedProf.profession);
      setValue('totalEffort', professionData.totalEffort);
      setValue('effortPerTick', professionData.effortPerTick);
      setValue('timePerTick', professionData.timePerTick);
      setValue('currentProgress', professionData.currentEffort);
    }
  }, [selectedProf.profession, professions, setValue]);

  // Real-time calculation
  useEffect(() => {
    if (formValues.totalEffort && formValues.effortPerTick && formValues.timePerTick) {
      setIsCalculating(true);
      const calc = BitcraftModule.service.bitcraftService.calculateEffort({
        totalEffort: formValues.totalEffort,
        effortPerTick: formValues.effortPerTick,
        timePerTick: formValues.timePerTick,
        currentProgress: formValues.currentProgress || 0
      });
      setCalculation(calc);
      setIsCalculating(false);
    }
  }, [formValues]);

  // Profession list for the profession selector
  const professionList: BitcraftProfession[] = [
    'Carpentry', 'Farming', 'Fishing', 'Foraging', 'Forestry', 'Hunting',
    'Leatherworking', 'Masonry', 'Mining', 'Scholar', 'Smithing', 'Tailoring'
  ];

  // Handle form submission (save to store)
  const onSubmit = (data: BitcraftFormData) => {
    BitcraftModule.stores.professionActions.updateProfession(data.profession, {
      totalEffort: data.totalEffort,
      effortPerTick: data.effortPerTick,
      timePerTick: data.timePerTick,
      currentEffort: data.currentProgress
    });
  };

  // Reset current profession
  const handleReset = () => {
    BitcraftModule.stores.professionActions.resetProfession(selectedProf.profession);
  };

  // Calculate efficiency metrics
  const efficiency = useMemo(() => {
    if (formValues.effortPerTick && formValues.timePerTick) {
      return BitcraftModule.service.bitcraftService.calculateEfficiency(formValues.effortPerTick, formValues.timePerTick);
    }
    return null;
  }, [formValues.effortPerTick, formValues.timePerTick]);

  // Progress checkpoints for visual milestones
  const progressCheckpoints = useMemo(() => {
    if (formValues.totalEffort && formValues.effortPerTick && formValues.timePerTick) {
      return BitcraftModule.service.bitcraftService.createProgressCheckpoints(
        formValues.totalEffort,
        formValues.effortPerTick,
        formValues.timePerTick,
        [25, 50, 75, 90, 100]
      );
    }
    return [];
  }, [formValues.totalEffort, formValues.effortPerTick, formValues.timePerTick]);

  // Current milestone progress
  const currentMilestone = useMemo(() => {
    if (!calculation) return null;
    
    const progress = calculation.progressPercentage;
    if (progress >= 100) return { label: 'Complete!', color: 'text-green-600', icon: '🎉' };
    if (progress >= 90) return { label: '90% Complete', color: 'text-green-500', icon: '🔥' };
    if (progress >= 75) return { label: '75% Complete', color: 'text-yellow-500', icon: '⚡' };
    if (progress >= 50) return { label: 'Halfway There!', color: 'text-blue-500', icon: '📈' };
    if (progress >= 25) return { label: '25% Complete', color: 'text-indigo-500', icon: '🚀' };
    return { label: 'Getting Started', color: 'text-gray-500', icon: '🎯' };
  }, [calculation]);

  return (
    <div className={cn("w-full max-w-4xl mx-auto p-6 space-y-6", className)}>
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-2">
          <Calculator className="w-8 h-8" />
          Bitcraft Calculator
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Calculate effort, time, and progress for your Bitcraft professions
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Panel - Profession Selector */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Select Profession</h3>
            <div className="grid grid-cols-2 gap-2">
              {professionList.map((profession) => {
                const isSelected = selectedProf.profession === profession;
                const professionData = (professions as any)[profession];
                const progressPercent = professionData ? (professionData.currentEffort / professionData.totalEffort) * 100 : 0;
                
                return (
                  <button
                    key={profession}
                    onClick={() => BitcraftModule.stores.professionActions.selectProfession(profession)}
                    className={cn(
                      "p-3 rounded-lg border text-sm font-medium transition-all duration-200",
                      "flex flex-col items-center gap-1",
                      isSelected
                        ? "bg-blue-500 text-white border-blue-500 shadow-md"
                        : "bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                    )}
                  >
                    <span className="text-lg">
                      {BitcraftModule.constants.PROFESSION_ICONS[profession] || '⚡'}
                    </span>
                    <span>{profession}</span>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1">
                      <div 
                        className="bg-green-500 h-1 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(progressPercent, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs opacity-75">
                      {progressPercent.toFixed(1)}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Center Panel - Form */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
              {BitcraftModule.constants.PROFESSION_ICONS[selectedProf.profession as BitcraftProfession]} {selectedProf.profession} Settings
            </h3>
            
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Total Effort
                  </label>
                  <Controller
                    name="totalEffort"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="number"
                        min="1"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    )}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Current Progress
                  </label>
                  <Controller
                    name="currentProgress"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="number"
                        min="0"
                        max={formValues.totalEffort}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    )}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Effort per Tick
                  </label>
                  <Controller
                    name="effortPerTick"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="number"
                        step="0.1"
                        min="0.1"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    )}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Time per Tick (s)
                  </label>
                  <Controller
                    name="timePerTick"
                    control={control}
                    render={({ field }) => (
                      <input
                        {...field}
                        type="number"
                        step="0.01"
                        min="0.01"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    )}
                  />
                </div>
              </div>
              
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
                
                <button
                  type="button"
                  onClick={handleReset}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Panel - Results */}
        <div className="space-y-4">
          {/* Current Milestone */}
          {currentMilestone && calculation && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl">{currentMilestone.icon}</span>
                <span className={`font-semibold ${currentMilestone.color}`}>
                  {currentMilestone.label}
                </span>
              </div>
            </div>
          )}

          {calculation && (
            <>
              {/* Progress Summary */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Progress Summary
                </h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Progress</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {calculation.progressPercentage.toFixed(1)}%
                    </span>
                  </div>
                  
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(calculation.progressPercentage, 100)}%` }}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600 dark:text-gray-400">Current</div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {formValues.currentProgress?.toLocaleString() || 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-600 dark:text-gray-400">Total</div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {calculation.totalEffort.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Time Estimates */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-5 h-5" />
                  Time Estimates
                </h3>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Remaining Time</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {BitcraftModule.service.bitcraftService.formatTime(calculation.remainingTimeSeconds)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Total Time</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {BitcraftModule.service.bitcraftService.formatTime(calculation.totalTimeSeconds)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Completion</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {calculation.estimatedCompletionTime.toLocaleTimeString()}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">Remaining Ticks</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {calculation.remainingTicks.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Efficiency Stats */}
              {efficiency && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Efficiency
                  </h3>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Per Hour</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {efficiency.effortPerHour.toFixed(1)} effort
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Per Minute</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {efficiency.effortPerMinute.toFixed(1)} effort
                      </span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Ticks/Hour</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {efficiency.ticksPerHour.toFixed(0)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Progress Checkpoints */}
              {progressCheckpoints.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Milestones
                  </h3>
                  
                  <div className="space-y-2">
                    {progressCheckpoints.map((checkpoint: any, index: number) => {
                      const isCompleted = calculation.progressPercentage >= checkpoint.percentage;
                      const isCurrent = calculation.progressPercentage < checkpoint.percentage && 
                        (index === 0 || calculation.progressPercentage >= progressCheckpoints[index - 1].percentage);
                      
                      return (
                        <div key={checkpoint.percentage} className="flex items-center gap-3">
                          <div className={cn(
                            "w-3 h-3 rounded-full flex-shrink-0",
                            isCompleted ? "bg-green-500" : isCurrent ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"
                          )} />
                          <div className="flex-1 text-sm">
                            <div className={cn(
                              "font-medium",
                              isCompleted ? "text-green-600 dark:text-green-400" : 
                              isCurrent ? "text-blue-600 dark:text-blue-400" : 
                              "text-gray-500 dark:text-gray-400"
                            )}>
                              {checkpoint.percentage}% - {checkpoint.timeToReach}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          
          {isCalculating && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                Calculating...
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
