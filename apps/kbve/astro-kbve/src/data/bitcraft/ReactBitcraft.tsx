/** @jsxImportSource react */
import React, { useState, useEffect, useMemo, type FC } from 'react';
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
import { 
  BitcraftFormDataSchema,
  validateFormData,
  parseFormData,
  ALL_PROFESSIONS
} from './bitcraftTypes';
import type { EffortCalculation } from './BitcraftCalculatorService';

// Utility function for classnames
const cn = (...inputs: any[]) => twMerge(clsx(inputs));

interface ReactBitcraftProps {
  className?: string;
}

const ReactBitcraft: FC<ReactBitcraftProps> = ({ className }) => {
  const professions = BitcraftModule.stores.useProfessionProgress();
  const selectedProf = BitcraftModule.stores.useSelectedProfession();
  const currentProgress = BitcraftModule.stores.useCurrentProfessionProgress();
  
  const [calculation, setCalculation] = useState<EffortCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // React Hook Form setup with zod validation
  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<BitcraftFormData>({
    defaultValues: {
      profession: selectedProf.profession,
      totalEffort: currentProgress?.totalEffort || 1000,
      effortPerTick: currentProgress?.effortPerTick || 10,
      timePerTick: currentProgress?.timePerTick || 1.0,
      currentProgress: currentProgress?.currentEffort || 0
    },
    // Enable zod validation
    mode: 'onChange'
  });

  // Watch form values for real-time calculations
  const formValues = watch();

  // Update form when profession changes with safe defaults
  useEffect(() => {
    const professionData = (professions as any)[selectedProf.profession];
    if (professionData) {
      setValue('profession', selectedProf.profession);
      setValue('totalEffort', professionData.totalEffort || 1000);
      setValue('effortPerTick', professionData.effortPerTick || 10);
      setValue('timePerTick', professionData.timePerTick || 1.0);
      setValue('currentProgress', professionData.currentEffort || 0);
    }
  }, [selectedProf.profession, professions, setValue]);

  // Real-time calculation with validation
  useEffect(() => {
    if (formValues.totalEffort && formValues.effortPerTick && formValues.timePerTick) {
      // Validate form data before calculation
      const validationResult = parseFormData(formValues);
      
      if (validationResult.success) {
        setIsCalculating(true);
        const calc = BitcraftModule.service.bitcraftService.calculateEffort({
          totalEffort: validationResult.data.totalEffort,
          effortPerTick: validationResult.data.effortPerTick,
          timePerTick: validationResult.data.timePerTick,
          currentProgress: validationResult.data.currentProgress || 0
        });
        setCalculation(calc);
        setIsCalculating(false);
      } else {
        // Clear calculation if validation fails
        setCalculation(null);
        console.warn('Form validation failed:', validationResult.error);
      }
    }
  }, [formValues]);

  // Handle form submission with zod validation
  const onSubmit = (data: BitcraftFormData) => {
    // Validate the data before saving
    const validatedData = validateFormData(data);
    
    if (validatedData) {
      BitcraftModule.stores.professionActions.updateProfession(validatedData.profession, {
        totalEffort: validatedData.totalEffort,
        effortPerTick: validatedData.effortPerTick,
        timePerTick: validatedData.timePerTick,
        currentEffort: validatedData.currentProgress
      });
    } else {
      console.error('Form validation failed for submission:', data);
    }
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

  // Helper function to get profession progress data
  const getProfessionData = (profession: BitcraftProfession) => {
    return (professions as any)[profession];
  };

  // Helper function to calculate progress percentage
  const getProgressPercentage = (profession: BitcraftProfession) => {
    const professionData = getProfessionData(profession);
    return professionData ? (professionData.currentEffort / professionData.totalEffort) * 100 : 0;
  };

  // Helper function to determine if profession is selected
  const isProfessionSelected = (profession: BitcraftProfession) => {
    return selectedProf.profession === profession;
  };

  // Helper function for milestone completion status
  const getMilestoneStatus = (percentage: number, index: number) => {
    if (!calculation) return { isCompleted: false, isCurrent: false };
    
    const isCompleted = calculation.progressPercentage >= percentage;
    const isCurrent = calculation.progressPercentage < percentage && 
      (index === 0 || calculation.progressPercentage >= progressCheckpoints[index - 1].percentage);
    
    return { isCompleted, isCurrent };
  };

  // Helper function to get milestone text color
  const getMilestoneTextColor = (isCompleted: boolean, isCurrent: boolean) => {
    if (isCompleted) return "text-green-600 dark:text-green-400";
    if (isCurrent) return "text-blue-600 dark:text-blue-400";
    return "text-gray-500 dark:text-gray-400";
  };

  // Helper function to get milestone dot color
  const getMilestoneDotColor = (isCompleted: boolean, isCurrent: boolean) => {
    if (isCompleted) return "bg-green-500";
    if (isCurrent) return "bg-blue-500";
    return "bg-gray-300 dark:bg-gray-600";
  };

  // Render function for profession button
  const renderProfessionButton = (profession: BitcraftProfession) => {
    const isSelected = isProfessionSelected(profession);
    const progressPercent = getProgressPercentage(profession);
    
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
  };

  // Render function for form input field with validation
  const renderFormInput = (
    name: keyof BitcraftFormData,
    label: string,
    props: {
      type?: string;
      step?: string;
      min?: string;
      max?: number;
    } = {}
  ) => {
    const { type = "number", step, min, max } = props;
    const error = errors[name];
    
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
          {error && <span className="text-red-500 ml-1">*</span>}
        </label>
        <Controller
          name={name}
          control={control}
          rules={{
            validate: (value) => {
              // Create a partial form data object for validation
              const testData = { ...formValues, [name]: value };
              const result = parseFormData(testData);
              
              if (!result.success) {
                const fieldError = result.error.issues.find(issue => 
                  issue.path.includes(name)
                );
                return fieldError?.message || "Invalid value";
              }
              return true;
            }
          }}
          render={({ field }) => (
            <>
              <input
                {...field}
                type={type}
                step={step}
                min={min}
                max={max}
                className={cn(
                  "w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white",
                  error 
                    ? "border-red-500 dark:border-red-400 focus:ring-red-500 focus:border-red-500" 
                    : "border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500"
                )}
                onChange={(e) => field.onChange(Number(e.target.value))}
              />
              {error && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                  {error.message}
                </p>
              )}
            </>
          )}
        />
      </div>
    );
  };

  // Render function for stats row
  const renderStatsRow = (label: string, value: string) => (
    <div className="flex justify-between">
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-900 dark:text-white">{value}</span>
    </div>
  );

  // Render function for milestone checkpoint
  const renderMilestoneCheckpoint = (checkpoint: any, index: number) => {
    if (!calculation) return null;
    
    const { isCompleted, isCurrent } = getMilestoneStatus(checkpoint.percentage, index);
    
    return (
      <div key={checkpoint.percentage} className="flex items-center gap-3">
        <div className={cn(
          "w-3 h-3 rounded-full flex-shrink-0",
          getMilestoneDotColor(isCompleted, isCurrent)
        )} />
        <div className="flex-1 text-sm">
          <div className={cn(
            "font-medium",
            getMilestoneTextColor(isCompleted, isCurrent)
          )}>
            {checkpoint.percentage}% - {checkpoint.timeToReach}
          </div>
        </div>
      </div>
    );
  };

  // Render function for header section
  const renderHeader = () => (
    <div className="text-center space-y-2">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-2">
        <Calculator className="w-8 h-8" />
        Bitcraft Calculator
      </h1>
      <p className="text-gray-600 dark:text-gray-400">
        Calculate effort, time, and progress for your Bitcraft professions
      </p>
    </div>
  );

  // Render function for profession selector panel
  const renderProfessionSelector = () => (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">Select Profession</h3>
        <div className="grid grid-cols-2 gap-2">
          {ALL_PROFESSIONS.map(renderProfessionButton)}
        </div>
      </div>
    </div>
  );

  // Render function for settings form panel
  const renderSettingsForm = () => (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
          {BitcraftModule.constants.PROFESSION_ICONS[selectedProf.profession as BitcraftProfession]} {selectedProf.profession} Settings
        </h3>
        
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {renderValidationStatus()}
          
          <div className="grid grid-cols-2 gap-4">
            {renderFormInput("totalEffort", "Total Effort", { min: "1" })}
            {renderFormInput("currentProgress", "Current Progress", { 
              min: "0", 
              max: formValues.totalEffort 
            })}
            {renderFormInput("effortPerTick", "Effort per Tick", { 
              step: "0.1", 
              min: "0.1" 
            })}
            {renderFormInput("timePerTick", "Time per Tick (s)", { 
              step: "0.01", 
              min: "0.01" 
            })}
          </div>
          
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!isFormValid}
              className={cn(
                "flex-1 px-4 py-2 rounded-md transition-colors duration-200 flex items-center justify-center gap-2",
                isFormValid
                  ? "bg-blue-500 hover:bg-blue-600 text-white"
                  : "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              )}
            >
              <Save className="w-4 h-4" />
              {isFormValid ? "Save" : "Fix Errors to Save"}
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
  );

  // Render function for current milestone
  const renderCurrentMilestone = () => {
    if (!currentMilestone || !calculation) return null;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center gap-2">
          <span className="text-2xl">{currentMilestone.icon}</span>
          <span className={`font-semibold ${currentMilestone.color}`}>
            {currentMilestone.label}
          </span>
        </div>
      </div>
    );
  };

  // Render function for progress summary
  const renderProgressSummary = () => {
    if (!calculation) return null;
    
    return (
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
    );
  };

  // Render function for time estimates
  const renderTimeEstimates = () => {
    if (!calculation) return null;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Time Estimates
        </h3>
        
        <div className="space-y-2 text-sm">
          {renderStatsRow("Remaining Time", BitcraftModule.service.bitcraftService.formatTime(calculation.remainingTimeSeconds))}
          {renderStatsRow("Total Time", BitcraftModule.service.bitcraftService.formatTime(calculation.totalTimeSeconds))}
          {renderStatsRow("Completion", calculation.estimatedCompletionTime.toLocaleTimeString())}
          {renderStatsRow("Remaining Ticks", calculation.remainingTicks.toLocaleString())}
        </div>
      </div>
    );
  };

  // Render function for efficiency stats
  const renderEfficiencyStats = () => {
    if (!efficiency) return null;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Efficiency
        </h3>
        
        <div className="space-y-2 text-sm">
          {renderStatsRow("Per Hour", `${efficiency.effortPerHour.toFixed(1)} effort`)}
          {renderStatsRow("Per Minute", `${efficiency.effortPerMinute.toFixed(1)} effort`)}
          {renderStatsRow("Ticks/Hour", efficiency.ticksPerHour.toFixed(0))}
        </div>
      </div>
    );
  };

  // Render function for progress checkpoints
  const renderProgressCheckpoints = () => {
    if (progressCheckpoints.length === 0) return null;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white flex items-center gap-2">
          <CheckCircle className="w-5 h-5" />
          Milestones
        </h3>
        
        <div className="space-y-2">
          {progressCheckpoints.map(renderMilestoneCheckpoint)}
        </div>
      </div>
    );
  };

  // Render function for loading state
  const renderLoadingState = () => {
    if (!isCalculating) return null;
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          Calculating...
        </div>
      </div>
    );
  };

  // Render function for validation errors
  const renderValidationErrors = () => {
    const hasErrors = Object.keys(errors).length > 0;
    
    if (!hasErrors) return null;
    
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
        <h4 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
          Please fix the following errors:
        </h4>
        <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
          {Object.entries(errors).map(([field, error]) => (
            <li key={field} className="flex items-center gap-2">
              <span className="w-1 h-1 bg-red-500 rounded-full flex-shrink-0" />
              <span className="capitalize">{field}</span>: {error?.message}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // Render function for validation status
  const renderValidationStatus = () => {
    const hasErrors = Object.keys(errors).length > 0;
    
    if (hasErrors) {
      return renderValidationErrors();
    }
    
    if (isFormValid && formValues.totalEffort > 0) {
      return (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm text-green-800 dark:text-green-200">
            <CheckCircle className="w-4 h-4" />
            <span>Form data is valid and ready to save</span>
          </div>
        </div>
      );
    }
    
    return null;
  };

  // Render function for results panel
  const renderResultsPanel = () => (
    <div className="space-y-4">
      {renderCurrentMilestone()}
      {calculation && (
        <>
          {renderProgressSummary()}
          {renderTimeEstimates()}
          {renderEfficiencyStats()}
          {renderProgressCheckpoints()}
        </>
      )}
      {renderLoadingState()}
    </div>
  );

  // Form validation status
  const isFormValid = useMemo(() => {
    const result = parseFormData(formValues);
    return result.success;
  }, [formValues]);

  // Main render shell
  return (
    <div className={cn("w-full max-w-4xl mx-auto p-6 space-y-6", className)}>
      {renderHeader()}
      
      <div className="grid gap-6 lg:grid-cols-3">
        {renderProfessionSelector()}
        {renderSettingsForm()}
        {renderResultsPanel()}
      </div>
    </div>
  );
};

export default ReactBitcraft;
