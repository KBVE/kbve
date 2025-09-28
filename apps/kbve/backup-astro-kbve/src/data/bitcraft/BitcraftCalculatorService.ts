/**
 * Bitcraft Game Calculator
 * Calculates various metrics for Bitcraft gameplay including effort, time, and progress
 */

export interface EffortCalculation {
  totalEffort: number;
  effortPerTick: number;
  timePerTick: number;
  totalTicks: number;
  totalTimeSeconds: number;
  totalTimeMinutes: number;
  totalTimeHours: number;
  progressPercentage: number;
  remainingEffort: number;
  remainingTicks: number;
  remainingTimeSeconds: number;
  estimatedCompletionTime: Date;
}

export interface BitcraftTaskConfig {
  totalEffort: number;
  effortPerTick: number;
  timePerTick: number;
  currentProgress?: number;
}

// New interface for ticker functionality
export interface TickerConfig {
  profession: string;
  effortPerTick: number;
  timePerTick: number;
  syncOffset?: number; // Sync offset in milliseconds (default 250ms)
  onTick: (newProgress: number, tickCount: number) => void;
  onComplete?: (finalProgress: number) => void;
}

export interface TickerState {
  isRunning: boolean;
  startTime: Date;
  tickCount: number;
  currentProgress: number;
  intervalId?: NodeJS.Timeout;
}

export class BitcraftCalculatorService {
  private static instance: BitcraftCalculatorService;
  private tickers: Map<string, TickerState> = new Map();

  private constructor() {
    // Private constructor to prevent direct instantiation
  }

  /**
   * Gets the singleton instance of the BitcraftCalculatorService
   * @returns The singleton instance
   */
  public static getInstance(): BitcraftCalculatorService {
    if (!BitcraftCalculatorService.instance) {
      BitcraftCalculatorService.instance = new BitcraftCalculatorService();
    }
    return BitcraftCalculatorService.instance;
  }

  /**
   * Calculates effort-based task completion metrics
   * @param config Task configuration with effort requirements
   * @returns Detailed calculation results
   */
  public calculateEffort(config: BitcraftTaskConfig): EffortCalculation {
    const {
      totalEffort,
      effortPerTick,
      timePerTick,
      currentProgress = 0
    } = config;

    // Basic calculations
    const totalTicks = Math.ceil(totalEffort / effortPerTick);
    const totalTimeSeconds = totalTicks * timePerTick;
    const totalTimeMinutes = totalTimeSeconds / 60;
    const totalTimeHours = totalTimeMinutes / 60;

    // Progress calculations
    const progressPercentage = (currentProgress / totalEffort) * 100;
    const remainingEffort = totalEffort - currentProgress;
    const remainingTicks = Math.ceil(remainingEffort / effortPerTick);
    const remainingTimeSeconds = remainingTicks * timePerTick;

    // Estimated completion time
    const estimatedCompletionTime = new Date();
    estimatedCompletionTime.setSeconds(
      estimatedCompletionTime.getSeconds() + remainingTimeSeconds
    );

    return {
      totalEffort,
      effortPerTick,
      timePerTick,
      totalTicks,
      totalTimeSeconds,
      totalTimeMinutes,
      totalTimeHours,
      progressPercentage,
      remainingEffort,
      remainingTicks,
      remainingTimeSeconds,
      estimatedCompletionTime
    };
  }

  /**
   * Formats time in a human-readable format
   * @param seconds Total seconds
   * @returns Formatted time string
   */
  public formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  }

  /**
   * Calculates how much effort will be completed in a given time
   * @param timeSeconds Time available in seconds
   * @param effortPerTick Effort completed per tick
   * @param timePerTick Time per tick in seconds
   * @returns Effort that will be completed
   */
  public calculateEffortFromTime(
    timeSeconds: number,
    effortPerTick: number,
    timePerTick: number
  ): number {
    const totalTicks = Math.floor(timeSeconds / timePerTick);
    return totalTicks * effortPerTick;
  }

  /**
   * Calculates efficiency metrics
   * @param effortPerTick Effort per tick
   * @param timePerTick Time per tick in seconds
   * @returns Efficiency metrics
   */
  public calculateEfficiency(effortPerTick: number, timePerTick: number) {
    const effortPerSecond = effortPerTick / timePerTick;
    const effortPerMinute = effortPerSecond * 60;
    const effortPerHour = effortPerMinute * 60;

    return {
      effortPerSecond,
      effortPerMinute,
      effortPerHour,
      ticksPerMinute: 60 / timePerTick,
      ticksPerHour: 3600 / timePerTick
    };
  }

  /**
   * Creates a progress tracker for multiple checkpoints
   * @param totalEffort Total effort required
   * @param effortPerTick Effort per tick
   * @param timePerTick Time per tick
   * @param checkpoints Array of progress percentages (0-100)
   * @returns Array of checkpoint information
   */
  public createProgressCheckpoints(
    totalEffort: number,
    effortPerTick: number,
    timePerTick: number,
    checkpoints: number[] = [25, 50, 75, 90, 100]
  ) {
    return checkpoints.map(percentage => {
      const targetEffort = (totalEffort * percentage) / 100;
      const requiredTicks = Math.ceil(targetEffort / effortPerTick);
      const timeToReach = requiredTicks * timePerTick;

      return {
        percentage,
        targetEffort,
        requiredTicks,
        timeToReach: this.formatTime(timeToReach),
        timeToReachSeconds: timeToReach
      };
    });
  }

  /**
   * Starts a ticker for real-time progress updates
   * @param profession Profession identifier
   * @param config Ticker configuration
   * @param initialProgress Starting progress value
   * @returns True if ticker started successfully
   */
  public startTicker(profession: string, config: TickerConfig, initialProgress: number = 0): boolean {
    // Stop existing ticker for this profession
    this.stopTicker(profession);

    const tickerState: TickerState = {
      isRunning: true,
      startTime: new Date(),
      tickCount: 0,
      currentProgress: initialProgress,
      intervalId: undefined
    };

    // Convert time per tick from seconds to milliseconds and add sync offset
    const baseTick = config.timePerTick * 1000;
    const syncOffset = config.syncOffset || 250; // Default 250ms lag adjustment
    const adjustedTickMs = baseTick + syncOffset;

    console.log(`Starting ticker for ${profession}:`);
    console.log(`Base tick time: ${baseTick}ms`);
    console.log(`Sync offset: ${syncOffset}ms`);
    console.log(`Adjusted tick time: ${adjustedTickMs}ms`);

    tickerState.intervalId = setInterval(() => {
      if (!tickerState.isRunning) {
        this.stopTicker(profession);
        return;
      }

      tickerState.tickCount++;
      tickerState.currentProgress += config.effortPerTick;

      // Call the onTick callback
      config.onTick(tickerState.currentProgress, tickerState.tickCount);

      // Check if task is complete (optional total effort check could be added)
      if (config.onComplete && tickerState.currentProgress >= (config as any).totalEffort) {
        config.onComplete(tickerState.currentProgress);
        this.stopTicker(profession);
      }
    }, adjustedTickMs);

    this.tickers.set(profession, tickerState);
    return true;
  }

  /**
   * Stops a ticker for a specific profession
   * @param profession Profession identifier
   * @returns True if ticker was stopped
   */
  public stopTicker(profession: string): boolean {
    const ticker = this.tickers.get(profession);
    
    if (ticker && ticker.intervalId) {
      clearInterval(ticker.intervalId);
      ticker.isRunning = false;
      this.tickers.delete(profession);
      return true;
    }
    
    return false;
  }

  /**
   * Stops all active tickers
   */
  public stopAllTickers(): void {
    for (const [profession, ticker] of this.tickers) {
      if (ticker.intervalId) {
        clearInterval(ticker.intervalId);
      }
    }
    this.tickers.clear();
  }

  /**
   * Gets the current state of a ticker
   * @param profession Profession identifier
   * @returns Ticker state or null if not found
   */
  public getTickerState(profession: string): TickerState | null {
    return this.tickers.get(profession) || null;
  }

  /**
   * Checks if a ticker is running for a profession
   * @param profession Profession identifier
   * @returns True if ticker is active
   */
  public isTickerRunning(profession: string): boolean {
    const ticker = this.tickers.get(profession);
    return ticker?.isRunning ?? false;
  }

  /**
   * Gets all active tickers
   * @returns Map of all active tickers
   */
  public getActiveTickers(): Map<string, TickerState> {
    return new Map(this.tickers);
  }
}

// Default example from your requirements
export const DEFAULT_BITCRAFT_TASK: BitcraftTaskConfig = {
  totalEffort: 12700,
  effortPerTick: 11,
  timePerTick: 1.53
};

// Helper function for quick calculations with your example
export function calculateDefaultTask(currentProgress: number = 0): EffortCalculation {
  return BitcraftCalculatorService.getInstance().calculateEffort({
    ...DEFAULT_BITCRAFT_TASK,
    currentProgress
  });
}

// Export common task presets
export const BITCRAFT_PRESETS = {
  DEFAULT: DEFAULT_BITCRAFT_TASK,
  FAST_TASK: {
    totalEffort: 5000,
    effortPerTick: 15,
    timePerTick: 1.0
  },
  SLOW_TASK: {
    totalEffort: 25000,
    effortPerTick: 8,
    timePerTick: 2.0
  }
} as const;

// Singleton service instance for easy access
export const bitcraftService = BitcraftCalculatorService.getInstance();

// Convenience methods using the service instance
export const BitcraftService = {
  calculate: (config: BitcraftTaskConfig) => bitcraftService.calculateEffort(config),
  formatTime: (seconds: number) => bitcraftService.formatTime(seconds),
  calculateFromTime: (timeSeconds: number, effortPerTick: number, timePerTick: number) => 
    bitcraftService.calculateEffortFromTime(timeSeconds, effortPerTick, timePerTick),
  getEfficiency: (effortPerTick: number, timePerTick: number) => 
    bitcraftService.calculateEfficiency(effortPerTick, timePerTick),
  getCheckpoints: (totalEffort: number, effortPerTick: number, timePerTick: number, checkpoints?: number[]) => 
    bitcraftService.createProgressCheckpoints(totalEffort, effortPerTick, timePerTick, checkpoints),
  calculateDefault: (currentProgress?: number) => calculateDefaultTask(currentProgress)
};